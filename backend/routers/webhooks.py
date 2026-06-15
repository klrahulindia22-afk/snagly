"""Phase 16c — Webhook handlers for Stripe and Razorpay.

Security contract (from CLAUDE.md §13 and PRD §5.28-E):
- Raw bytes body MUST be read before any JSON parsing (signature covers raw body).
- Signature is verified FIRST — before any DB operation.
- NEVER return 4xx to the gateway (except 400 on signature failure):
  gateways interpret 4xx as "permanent failure, stop retrying."
- Duplicate event_id → return 200 immediately, no processing.
- Handler exception → store traceback in WebhookEvent.error, return 500 so gateway retries.
- Payload is NEVER logged to stdout — it goes into WebhookEvent.payload_json only.
"""
from __future__ import annotations

import json
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.subscription import Subscription, SubscriptionStatus
from models.webhook_event import WebhookEvent, WebhookGateway
from services import subscription_service

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


# ─── Stripe ──────────────────────────────────────────────────────────────────

@router.post("/stripe", status_code=200)
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> Response:
    payload_bytes = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # 1. Verify signature — return 400 on failure (only safe 4xx for webhooks)
    from services.stripe_service import verify_webhook_signature, StripeServiceError
    try:
        event = await verify_webhook_signature(payload_bytes, sig_header)
    except StripeServiceError:
        return Response(content='{"error":"invalid_signature"}', status_code=400,
                        media_type="application/json")

    event_id   = str(event.get("id", ""))
    event_type = str(event.get("type", ""))

    # 2. Idempotency — skip if already processed
    existing = await db.scalar(
        select(WebhookEvent).where(
            WebhookEvent.gateway  == WebhookGateway.stripe,
            WebhookEvent.event_id == event_id,
        )
    )
    if existing and existing.processed:
        return Response(content='{"status":"already_processed"}', status_code=200,
                        media_type="application/json")

    # 3. Insert (or reuse failed) WebhookEvent row
    if existing is None:
        wh_event = WebhookEvent(
            gateway=WebhookGateway.stripe,
            event_id=event_id,
            event_type=event_type,
            payload_json=payload_bytes.decode("utf-8", errors="replace"),
            processed=False,
        )
        db.add(wh_event)
        await db.flush()
    else:
        wh_event = existing

    # 4. Dispatch to handler
    try:
        await _handle_stripe_event(event_type, event, db, background_tasks)
        wh_event.processed    = True
        wh_event.processed_at = datetime.now(timezone.utc)
        wh_event.error        = None
        await db.commit()
        return Response(content='{"status":"ok"}', status_code=200,
                        media_type="application/json")

    except Exception:
        tb = traceback.format_exc()
        wh_event.error = tb[:4000]   # TEXT column — cap to avoid overflow
        await db.commit()
        return Response(content='{"status":"error"}', status_code=500,
                        media_type="application/json")


# ─── Razorpay ────────────────────────────────────────────────────────────────

@router.post("/razorpay", status_code=200)
async def razorpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> Response:
    payload_bytes = await request.body()
    sig_header = request.headers.get("x-razorpay-signature", "")

    # 1. Verify signature
    from services.razorpay_service import verify_webhook_signature, RazorpayServiceError
    try:
        event = await verify_webhook_signature(payload_bytes, sig_header)
    except RazorpayServiceError:
        return Response(content='{"error":"invalid_signature"}', status_code=400,
                        media_type="application/json")

    # Razorpay event id is inside the payload
    event_id   = str(event.get("event_id") or event.get("id", ""))
    event_type = str(event.get("event", ""))

    if not event_id:
        # Razorpay doesn't always send a unique event id in the top-level payload.
        # Fall back to a content-derived id so we still get idempotency.
        import hashlib
        event_id = "rzp_" + hashlib.sha256(payload_bytes).hexdigest()[:32]

    # 2. Idempotency
    existing = await db.scalar(
        select(WebhookEvent).where(
            WebhookEvent.gateway  == WebhookGateway.razorpay,
            WebhookEvent.event_id == event_id,
        )
    )
    if existing and existing.processed:
        return Response(content='{"status":"already_processed"}', status_code=200,
                        media_type="application/json")

    # 3. Insert WebhookEvent
    if existing is None:
        wh_event = WebhookEvent(
            gateway=WebhookGateway.razorpay,
            event_id=event_id,
            event_type=event_type,
            payload_json=payload_bytes.decode("utf-8", errors="replace"),
            processed=False,
        )
        db.add(wh_event)
        await db.flush()
    else:
        wh_event = existing

    # 4. Dispatch
    try:
        await _handle_razorpay_event(event_type, event, db, background_tasks)
        wh_event.processed    = True
        wh_event.processed_at = datetime.now(timezone.utc)
        wh_event.error        = None
        await db.commit()
        return Response(content='{"status":"ok"}', status_code=200,
                        media_type="application/json")

    except Exception:
        tb = traceback.format_exc()
        wh_event.error = tb[:4000]
        await db.commit()
        return Response(content='{"status":"error"}', status_code=500,
                        media_type="application/json")


# ─── Stripe event dispatcher ──────────────────────────────────────────────────

async def _handle_stripe_event(
    event_type: str,
    event: dict,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Route a Stripe event_type to the correct subscription_service handler."""
    ss = subscription_service

    if event_type in ("checkout.session.completed",):
        await ss.on_subscription_activated(db, event)

    elif event_type == "invoice.paid":
        await ss.on_invoice_paid(db, event)

    elif event_type == "invoice.payment_failed":
        obj       = event.get("data", {}).get("object", {})
        attempt   = int(obj.get("attempt_count", 1))
        await ss.on_payment_failed(db, event, attempt_number=attempt)

    elif event_type == "customer.subscription.trial_will_end":
        await ss.on_trial_ending(db, event)

    elif event_type in ("customer.subscription.deleted",):
        await ss.on_subscription_cancelled(db, event)
        # Schedule downgrade_to_free after grace period via BackgroundTask
        sub_id = event.get("data", {}).get("object", {}).get("id")
        if sub_id:
            background_tasks.add_task(
                _schedule_downgrade_to_free, sub_id, db
            )

    elif event_type == "customer.subscription.updated":
        await _sync_stripe_subscription(event, db)

    # Unknown / unhandled events are silently acknowledged (no error)


async def _handle_razorpay_event(
    event_type: str,
    event: dict,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Route a Razorpay event to the correct subscription_service handler."""
    ss = subscription_service

    if event_type == "subscription.activated":
        await ss.on_subscription_activated(db, event)

    elif event_type == "subscription.charged":
        await ss.on_invoice_paid(db, event)

    elif event_type == "subscription.payment_failed":
        # Razorpay doesn't provide attempt number — use payment_failed_1 as default
        await ss.on_payment_failed(db, event, attempt_number=1)

    elif event_type in ("subscription.cancelled", "subscription.completed"):
        await ss.on_subscription_cancelled(db, event)

    # Unknown events silently acknowledged


# ─── Background / sync helpers ────────────────────────────────────────────────

async def _schedule_downgrade_to_free(gateway_sub_id: str, db: AsyncSession) -> None:
    """Called as a BackgroundTask after subscription.deleted.
    Finds the user via the subscription and calls downgrade_to_free.
    """
    from sqlalchemy import select as _select
    sub = await db.scalar(
        _select(Subscription).where(Subscription.gateway_subscription_id == gateway_sub_id)
    )
    if sub is None:
        return
    from models.user import User
    user = await db.get(User, sub.user_id)
    if user:
        await subscription_service.downgrade_to_free(user, db)


async def _sync_stripe_subscription(event: dict, db: AsyncSession) -> None:
    """Handle customer.subscription.updated — sync status and cancel_at_period_end."""
    obj = event.get("data", {}).get("object", {})
    gateway_sub_id = str(obj.get("id", ""))
    if not gateway_sub_id:
        return

    from sqlalchemy import select as _sel
    sub = await db.scalar(
        _sel(Subscription).where(Subscription.gateway_subscription_id == gateway_sub_id)
    )
    if sub is None:
        return

    status_map = {
        "active":   SubscriptionStatus.active,
        "trialing": SubscriptionStatus.trialing,
        "past_due": SubscriptionStatus.past_due,
        "canceled": SubscriptionStatus.canceled,
        "paused":   SubscriptionStatus.paused,
    }
    new_status = status_map.get(obj.get("status", ""), None)
    if new_status:
        sub.status = new_status

    cancel_at = obj.get("cancel_at_period_end")
    if cancel_at is not None:
        sub.cancel_at_period_end = bool(cancel_at)

    period_start = obj.get("current_period_start")
    period_end   = obj.get("current_period_end")
    if period_start:
        sub.current_period_start = datetime.fromtimestamp(int(period_start), tz=timezone.utc)
    if period_end:
        sub.current_period_end   = datetime.fromtimestamp(int(period_end), tz=timezone.utc)

    await db.commit()
