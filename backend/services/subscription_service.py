"""Phase 16b — Subscription orchestration service.

Coordinates between the DB layer and the gateway services (Stripe/Razorpay).
Keeps gateway-specific logic inside stripe_service / razorpay_service; this
module only decides *which* gateway to use and updates the DB accordingly.

CLAUDE.md: No hard-delete, no token logging, UTC timestamps only.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.coupon import Coupon, CouponRedemption
from models.plan import Plan
from models.subscription import Subscription, SubscriptionStatus, SubscriptionGateway

if TYPE_CHECKING:
    from models.user import User


# ─── Gateway routing ──────────────────────────────────────────────────────────

def get_gateway_for_user(user: "User") -> Literal["stripe", "razorpay"]:
    """Return the correct payment gateway for this user.

    Routing priority:
    1. If PAYMENT_GATEWAY_IN env var == "razorpay" *and* billing country is IN
       (or no country recorded yet) → razorpay.
    2. Otherwise → PAYMENT_GATEWAY_DEFAULT.

    The heuristic for "India user": check user.email domain or a future
    billing_country field.  For now we use PAYMENT_GATEWAY_IN as a global
    override (flip it to 'stripe' to force Stripe for all users).
    """
    # Country-based routing: if the operator has set PAYMENT_GATEWAY_IN=razorpay
    # it means India users should use Razorpay.  For the MVP we treat all users
    # as matching when PAYMENT_GATEWAY_IN is set (real country detection comes in 16d).
    if settings.PAYMENT_GATEWAY_IN == "razorpay":
        return "razorpay"
    return settings.PAYMENT_GATEWAY_DEFAULT or "stripe"


# ─── Checkout ────────────────────────────────────────────────────────────────

async def checkout(
    user: "User",
    plan_id: int,
    billing_cycle: str,           # "monthly" | "yearly"
    db: AsyncSession,
    trial_days: int = 0,
    coupon_code: str | None = None,
) -> dict:
    """Create a new Subscription row and call the gateway to initiate checkout.

    Returns:
        Stripe  → { "client_secret": "...", "gateway": "stripe" }
        Razorpay → { "subscription_id": "...", "key_id": "...", "gateway": "razorpay" }
    """
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise ValueError(f"Plan {plan_id} not found")

    # Validate coupon early so user sees errors before gateway call
    validated_coupon = None
    if coupon_code:
        validated_coupon = await _validate_coupon_for_checkout(
            code=coupon_code.strip().upper(), plan_id=plan_id, user_id=user.id, db=db
        )

    gateway_name = get_gateway_for_user(user)

    # Determine gateway price/plan id from the Plan model
    if gateway_name == "stripe":
        price_id = (
            plan.stripe_price_id_monthly
            if billing_cycle == "monthly"
            else plan.stripe_price_id_yearly
        )
        if not price_id:
            raise ValueError(f"Plan {plan.name} has no Stripe price ID for cycle '{billing_cycle}'")
    else:
        price_id = (
            plan.razorpay_plan_id_monthly
            if billing_cycle == "monthly"
            else plan.razorpay_plan_id_yearly
        )
        if not price_id:
            raise ValueError(f"Plan {plan.name} has no Razorpay plan ID for cycle '{billing_cycle}'")

    gateway_enum = SubscriptionGateway.stripe if gateway_name == "stripe" else SubscriptionGateway.razorpay

    # Create or update subscription row
    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub is None:
        sub = Subscription(
            user_id=user.id,
            plan_id=plan_id,
            status=SubscriptionStatus.trialing if trial_days > 0 else SubscriptionStatus.active,
            gateway=gateway_enum,
            billing_cycle=billing_cycle,
            pending_coupon_code=validated_coupon.code if validated_coupon else None,
        )
        db.add(sub)
        await db.flush()
    else:
        sub.plan_id = plan_id
        sub.gateway = gateway_enum
        sub.status = SubscriptionStatus.trialing if trial_days > 0 else SubscriptionStatus.active
        sub.billing_cycle = billing_cycle
        sub.pending_coupon_code = validated_coupon.code if validated_coupon else None

    # Call gateway
    if gateway_name == "stripe":
        from services.stripe_service import create_customer, create_subscription as stripe_create_sub

        # Create or reuse customer
        customer_id = sub.gateway_customer_id
        if not customer_id:
            customer_id = await create_customer(user)
            sub.gateway_customer_id = customer_id

        result = await stripe_create_sub(customer_id, price_id, trial_days)
        sub.gateway_subscription_id = result["id"]
        await db.commit()

        client_secret = (
            result.get("latest_invoice", {})
            .get("payment_intent", {})
            .get("client_secret")
        )
        return {"client_secret": client_secret, "gateway": "stripe"}

    else:
        from services.razorpay_service import create_customer, create_subscription as rp_create_sub

        customer_id = sub.gateway_customer_id
        if not customer_id:
            customer_id = await create_customer(user)
            sub.gateway_customer_id = customer_id

        rzp_offer_id = validated_coupon.razorpay_offer_id if validated_coupon else None
        result = await rp_create_sub(customer_id, price_id, trial_days, offer_id=rzp_offer_id)
        sub.gateway_subscription_id = result["id"]
        await db.commit()

        return {
            "subscription_id": result["id"],
            "key_id": settings.RAZORPAY_KEY_ID,
            "gateway": "razorpay",
            "coupon_applied": validated_coupon.code if validated_coupon else None,
            "discount_type": validated_coupon.discount_type if validated_coupon else None,
            "discount_value": str(validated_coupon.discount_value) if validated_coupon else None,
        }


# ─── Upgrade ─────────────────────────────────────────────────────────────────

async def upgrade(user: "User", new_plan_id: int, db: AsyncSession) -> dict | "Subscription":
    """Switch the user to a higher plan.

    Stripe  → prorated in-place price swap; returns Subscription ORM object.
    Razorpay → cancel current subscription immediately, create new one;
               returns checkout dict {subscription_id, key_id, gateway} so the
               caller can open the Razorpay payment modal.
    """
    sub = await _get_active_sub(user, db)
    new_plan = await db.get(Plan, new_plan_id)
    if new_plan is None:
        raise ValueError(f"Plan {new_plan_id} not found")

    if sub.gateway == SubscriptionGateway.stripe:
        from services.stripe_service import upgrade_subscription
        price_id = (
            new_plan.stripe_price_id_yearly
            if sub.billing_cycle == "yearly"
            else new_plan.stripe_price_id_monthly
        )
        if price_id and sub.gateway_subscription_id:
            await upgrade_subscription(sub.gateway_subscription_id, price_id)
        sub.plan_id = new_plan_id
        sub.billing_cycle = sub.billing_cycle or "monthly"
        await db.commit()
        return sub

    # Razorpay: cancel current subscription immediately, then create a new one
    billing_cycle = sub.billing_cycle or "monthly"
    razorpay_plan_id = (
        new_plan.razorpay_plan_id_yearly
        if billing_cycle == "yearly"
        else new_plan.razorpay_plan_id_monthly
    )
    if not razorpay_plan_id:
        raise ValueError(
            f"Plan '{new_plan.name}' has no Razorpay plan ID for cycle '{billing_cycle}'. "
            "Configure it in the admin panel."
        )

    from services.razorpay_service import cancel_subscription as rp_cancel, create_subscription as rp_create_sub

    # Cancel existing subscription immediately (not at period end)
    old_gateway_sub_id = sub.gateway_subscription_id
    if old_gateway_sub_id:
        try:
            await rp_cancel(old_gateway_sub_id, at_period_end=False)
        except Exception:
            pass  # don't block upgrade if cancel fails; new subscription takes over

    # Create new subscription for the upgraded plan
    result = await rp_create_sub(sub.gateway_customer_id, razorpay_plan_id)

    # Store the target plan as pending — plan_id is NOT updated until the
    # subscription.activated webhook confirms the user actually paid.
    # This prevents the plan from appearing upgraded when the user cancels checkout.
    sub.pending_upgrade_plan_id = new_plan_id
    sub.gateway_subscription_id = result["id"]
    sub.billing_cycle = billing_cycle
    # status stays as-is; on_subscription_activated() will set it to active
    await db.commit()

    from config import settings
    return {
        "subscription_id": result["id"],
        "key_id": settings.RAZORPAY_KEY_ID,
        "gateway": "razorpay",
    }


# ─── Downgrade ───────────────────────────────────────────────────────────────

async def downgrade(user: "User", new_plan_id: int, db: AsyncSession) -> Subscription:
    """Schedule a plan downgrade at the end of the current billing period.

    Stripe: schedules a price swap at period end (Stripe handles it automatically).
    Razorpay: cancels at cycle end on gateway; on_subscription_cancelled() switches plan_id.
    """
    sub = await _get_active_sub(user, db)
    new_plan = await db.get(Plan, new_plan_id)
    if new_plan is None:
        raise ValueError(f"Plan {new_plan_id} not found")

    if sub.gateway == SubscriptionGateway.stripe:
        from services.stripe_service import downgrade_subscription
        billing_cycle = sub.billing_cycle or "monthly"
        price_id = (
            new_plan.stripe_price_id_yearly
            if billing_cycle == "yearly"
            else new_plan.stripe_price_id_monthly
        )
        if price_id and sub.gateway_subscription_id:
            await downgrade_subscription(sub.gateway_subscription_id, price_id)

    elif sub.gateway == SubscriptionGateway.razorpay:
        if sub.gateway_subscription_id:
            from services.razorpay_service import cancel_subscription as rp_cancel
            try:
                await rp_cancel(sub.gateway_subscription_id, at_period_end=True)
            except Exception:
                pass  # log but don't block; DB already marks cancel_at_period_end

    sub.cancel_at_period_end = True
    sub.pending_downgrade_plan_id = new_plan_id
    await db.commit()
    return sub


# ─── Cancel ──────────────────────────────────────────────────────────────────

async def cancel(user: "User", reason: str, db: AsyncSession) -> Subscription:
    """Cancel the subscription at period end."""
    sub = await _get_active_sub(user, db)

    if sub.gateway == SubscriptionGateway.stripe and sub.gateway_subscription_id:
        from services.stripe_service import cancel_subscription
        await cancel_subscription(sub.gateway_subscription_id, at_period_end=True)

    elif sub.gateway == SubscriptionGateway.razorpay and sub.gateway_subscription_id:
        from services.razorpay_service import cancel_subscription as rp_cancel
        await rp_cancel(sub.gateway_subscription_id)

    sub.cancel_at_period_end = True
    sub.canceled_at = datetime.now(timezone.utc)
    await db.commit()
    return sub


# ─── Reactivate ──────────────────────────────────────────────────────────────

async def reactivate(user: "User", db: AsyncSession) -> Subscription:
    """Clear cancel_at_period_end — subscription will renew as normal.

    Also clears pending_downgrade_plan_id if this is a downgrade reversal.
    Note: Razorpay has no uncancel API, so for Razorpay subscriptions the
    cancel-at-period-end state on the gateway cannot be reverted; we clear
    it in our DB so the switch-to-lower-plan logic doesn't run if the
    subscription does end, and the user stays on their current plan data
    until the period expires (or they resubscribe).
    """
    sub = await _get_active_sub(user, db)

    if sub.gateway == SubscriptionGateway.stripe and sub.gateway_subscription_id:
        from services.stripe_service import reactivate_subscription
        await reactivate_subscription(sub.gateway_subscription_id)

    sub.cancel_at_period_end = False
    sub.canceled_at = None
    sub.pending_downgrade_plan_id = None
    await db.commit()
    return sub


# ─── Switch billing cycle ────────────────────────────────────────────────────

async def switch_cycle(user: "User", billing_cycle: str, db: AsyncSession) -> Subscription:
    """Switch between monthly and yearly billing on the same plan.

    For Stripe: swaps the price_id on the existing subscription (prorated immediately).
    For Razorpay: Razorpay doesn't support in-place cycle switch.
    We update billing_cycle in the DB so the UI reflects the preference;
    the gateway will pick up the new price_id at the next renewal via the webhook flow.
    """
    sub = await _get_active_sub(user, db)
    plan = await db.get(Plan, sub.plan_id)
    if plan is None:
        raise ValueError("Plan not found")

    if sub.gateway == SubscriptionGateway.stripe and sub.gateway_subscription_id:
        from services.stripe_service import upgrade_subscription
        price_id = (
            plan.stripe_price_id_monthly
            if billing_cycle == "monthly"
            else plan.stripe_price_id_yearly
        )
        if price_id:
            await upgrade_subscription(sub.gateway_subscription_id, price_id)

    # Always persist the billing_cycle change in the DB regardless of gateway
    sub.billing_cycle = billing_cycle
    await db.commit()
    return sub


# ─── Apply coupon ─────────────────────────────────────────────────────────────

async def apply_coupon(user: "User", code: str, db: AsyncSession) -> Coupon:
    """Validate and apply a coupon for the user's active subscription.

    Raises ValueError with a human-readable message on any validation failure.
    """
    now = datetime.now(timezone.utc)

    coupon = await db.scalar(select(Coupon).where(Coupon.code == code))
    if coupon is None:
        raise ValueError("Coupon not found")
    if not coupon.is_active:
        raise ValueError("Coupon is no longer active")
    if coupon.valid_from and now < coupon.valid_from:
        raise ValueError("Coupon is not yet valid")
    if coupon.valid_until and now > coupon.valid_until:
        raise ValueError("Coupon has expired")
    if coupon.max_uses is not None and coupon.times_used >= coupon.max_uses:
        raise ValueError("Coupon has reached its maximum number of uses")

    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if coupon.applies_to_plan is not None and sub and sub.plan_id != coupon.applies_to_plan:
        raise ValueError("Coupon does not apply to your current plan")

    # Guard against double-redemption
    existing = await db.scalar(
        select(CouponRedemption).where(
            CouponRedemption.coupon_id == coupon.id,
            CouponRedemption.user_id == user.id,
        )
    )
    if existing:
        raise ValueError("You have already used this coupon")

    # Create redemption record
    from decimal import Decimal
    discount_amount = Decimal(str(coupon.discount_value))
    redemption = CouponRedemption(
        coupon_id=coupon.id,
        user_id=user.id,
        subscription_id=sub.id if sub else None,
        redeemed_at=now,
        discount_amount=discount_amount,
    )
    db.add(redemption)
    coupon.times_used += 1
    await db.commit()
    return coupon


# ─── Grace period ─────────────────────────────────────────────────────────────

async def apply_grace_period(subscription: Subscription, db: AsyncSession) -> Subscription:
    """Extend access by SUBSCRIPTION_GRACE_PERIOD_DAYS after payment failure."""
    subscription.grace_period_ends_at = datetime.now(timezone.utc) + timedelta(
        days=settings.SUBSCRIPTION_GRACE_PERIOD_DAYS
    )
    subscription.status = SubscriptionStatus.past_due
    await db.commit()
    return subscription


# ─── Downgrade to free ────────────────────────────────────────────────────────

async def downgrade_to_free(user: "User", db: AsyncSession) -> None:
    """Cancel the subscription, archive excess boards, set subscription_id = NULL.

    Called after grace period expires with no payment recovery.
    """
    from sqlalchemy import update as sa_update
    from models.board import Board

    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub:
        sub.status = SubscriptionStatus.canceled
        sub.canceled_at = datetime.now(timezone.utc)

    # Archive boards beyond the free plan limit (keep the most recently active 1)
    from models.plan import Plan as PlanModel
    free_plan = await db.scalar(select(PlanModel).where(PlanModel.name == "free"))
    board_limit = 1  # hardcoded free-tier default; plan_service.get_plan_limit would need a loaded user

    user_boards = (
        await db.execute(
            select(Board)
            .where(Board.owner_id == user.id, Board.is_archived == False)  # noqa: E712
            .order_by(Board.created_at.desc())
        )
    ).scalars().all()

    for board in user_boards[board_limit:]:
        board.is_archived = True

    # Disconnect subscription
    user.subscription_id = None
    await db.commit()


# ─── Webhook handlers ────────────────────────────────────────────────────────
# Called from routers/webhooks.py AFTER idempotency check and WebhookEvent insert.
# Each receives the normalised event dict (gateway-specific parsing happens in the router).

async def on_subscription_activated(db: AsyncSession, event_data: dict) -> None:
    """Stripe: checkout.session.completed / Razorpay: subscription.activated.
    Set Subscription.status = active and send activation email.
    """
    gateway_sub_id = _extract_subscription_id(event_data)
    sub = await _sub_by_gateway_id(gateway_sub_id, db)
    if sub is None:
        return

    sub.status = SubscriptionStatus.active

    # If this activation is for a pending upgrade, promote the plan now that payment is confirmed
    if sub.pending_upgrade_plan_id:
        sub.plan_id = sub.pending_upgrade_plan_id
        sub.pending_upgrade_plan_id = None

    # Set period dates from the activation event
    rzp_payload = event_data.get("payload", {})
    if rzp_payload:
        sub_entity = rzp_payload.get("subscription", {}).get("entity", {})
        period_start_ts = sub_entity.get("current_start") or sub_entity.get("start_at")
        period_end_ts   = sub_entity.get("current_end")   or sub_entity.get("end_at")
        if period_start_ts:
            sub.current_period_start = _ts_to_dt(period_start_ts)
        if period_end_ts:
            sub.current_period_end = _ts_to_dt(period_end_ts)
    else:
        # Stripe: checkout.session.completed has subscription period via subscription object
        obj = event_data.get("data", {}).get("object", {})
        period_start_ts = obj.get("current_period_start")
        period_end_ts   = obj.get("current_period_end")
        if period_start_ts:
            sub.current_period_start = _ts_to_dt(period_start_ts)
        if period_end_ts:
            sub.current_period_end = _ts_to_dt(period_end_ts)

    # Redeem pending coupon now that subscription is confirmed active
    if sub.pending_coupon_code:
        try:
            await _redeem_pending_coupon(sub, db)
        except Exception:
            pass  # don't block activation if coupon redemption fails (already validated at checkout)

    await db.commit()

    user = await db.get(__import__("models.user", fromlist=["User"]).User, sub.user_id)
    if user:
        from services.email_service import send_subscription_activated
        await send_subscription_activated(user.email, user.full_name)


async def on_invoice_paid(db: AsyncSession, event_data: dict) -> None:
    """Stripe: invoice.paid / Razorpay: subscription.charged.
    Create Invoice row (status=paid) and send renewal email.
    """
    from models.subscription import Invoice, InvoiceStatus

    # Detect Razorpay vs Stripe by payload structure
    rzp_payload = event_data.get("payload", {})
    if rzp_payload:
        # Razorpay subscription.charged
        sub_entity         = rzp_payload.get("subscription", {}).get("entity", {})
        pay_entity         = rzp_payload.get("payment",      {}).get("entity", {})
        gateway_sub_id     = str(sub_entity.get("id", ""))
        gateway_invoice_id = str(pay_entity.get("id", ""))   # payment_id acts as invoice_id
        amount_cents       = pay_entity.get("amount", 0)
        currency           = pay_entity.get("currency", "INR").upper()
        period_start_ts    = sub_entity.get("current_start", 0)
        period_end_ts      = sub_entity.get("current_end",   0)
        pdf_url            = None
        card_data          = pay_entity.get("card", {})
    else:
        # Stripe invoice.paid
        obj                = event_data.get("data", {}).get("object", event_data)
        gateway_sub_id     = str(obj.get("subscription") or obj.get("subscription_id", ""))
        gateway_invoice_id = str(obj.get("id", ""))
        amount_cents       = obj.get("amount_paid") or obj.get("amount", 0)
        currency           = (obj.get("currency") or "usd").upper()
        period_start_ts    = obj.get("period_start") or obj.get("current_start", 0)
        period_end_ts      = obj.get("period_end")   or obj.get("current_end",   0)
        pdf_url            = obj.get("invoice_pdf")
        card_data          = {}

    sub = await _sub_by_gateway_id(gateway_sub_id, db)
    if sub is None:
        return

    # Idempotency: skip if already recorded
    from sqlalchemy import select as sa_select
    existing = await db.scalar(
        sa_select(Invoice).where(Invoice.gateway_invoice_id == gateway_invoice_id)
    )
    if existing:
        return

    period_start_dt = _ts_to_dt(period_start_ts)
    period_end_dt   = _ts_to_dt(period_end_ts)

    invoice = Invoice(
        user_id=sub.user_id,
        subscription_id=sub.id,
        gateway=sub.gateway,
        gateway_invoice_id=gateway_invoice_id,
        amount=_cents_to_decimal(amount_cents),
        currency=currency[:3],
        status=InvoiceStatus.paid,
        invoice_pdf_url=pdf_url,
        period_start=period_start_dt,
        period_end=period_end_dt,
        paid_at=datetime.now(timezone.utc),
    )
    db.add(invoice)

    # Update subscription period dates on each renewal
    sub.current_period_start = period_start_dt
    sub.current_period_end   = period_end_dt
    sub.status = SubscriptionStatus.active

    # Save card details from Razorpay card data so payment method pane shows real values
    if card_data:
        await _upsert_payment_method(db, sub.user_id, sub.gateway, card_data)

    await db.commit()

    user = await db.get(__import__("models.user", fromlist=["User"]).User, sub.user_id)
    if user:
        from services.email_service import send_subscription_renewed
        await send_subscription_renewed(user.email, user.full_name)


async def on_payment_failed(
    db: AsyncSession, event_data: dict, attempt_number: int
) -> None:
    """Stripe: invoice.payment_failed / Razorpay: subscription.payment_failed.
    Create Invoice row (status=failed), send escalating failure email.
    On attempt 3: call apply_grace_period().
    """
    from models.subscription import Invoice, InvoiceStatus

    inv_data           = event_data.get("data", {}).get("object", event_data)
    gateway_invoice_id = str(inv_data.get("id", ""))
    gateway_sub_id     = str(inv_data.get("subscription") or inv_data.get("subscription_id", ""))
    amount_cents       = inv_data.get("amount_due") or inv_data.get("amount", 0)
    currency           = (inv_data.get("currency") or "usd").upper()
    period_start_ts    = inv_data.get("period_start") or inv_data.get("current_start", 0)
    period_end_ts      = inv_data.get("period_end")   or inv_data.get("current_end", 0)

    sub = await _sub_by_gateway_id(gateway_sub_id, db)
    if sub is None:
        return

    from sqlalchemy import select as sa_select
    existing = await db.scalar(
        sa_select(Invoice).where(Invoice.gateway_invoice_id == gateway_invoice_id)
    )
    if not existing:
        invoice = Invoice(
            user_id=sub.user_id,
            subscription_id=sub.id,
            gateway=sub.gateway,
            gateway_invoice_id=gateway_invoice_id,
            amount=_cents_to_decimal(amount_cents),
            currency=currency[:3],
            status=InvoiceStatus.failed,
            period_start=_ts_to_dt(period_start_ts),
            period_end=_ts_to_dt(period_end_ts),
        )
        db.add(invoice)
        await db.commit()

    user = await db.get(__import__("models.user", fromlist=["User"]).User, sub.user_id)
    if user:
        from services import email_service as _email
        if attempt_number == 1:
            await _email.send_payment_failed_1(user.email, user.full_name)
        elif attempt_number == 2:
            await _email.send_payment_failed_2(user.email, user.full_name)
        else:
            await _email.send_payment_failed_final(user.email, user.full_name)
            await apply_grace_period(sub, db)


async def on_subscription_cancelled(db: AsyncSession, event_data: dict) -> None:
    """Stripe: customer.subscription.deleted / Razorpay: subscription.cancelled.

    If pending_downgrade_plan_id is set this is a scheduled downgrade reaching
    its period end — switch plan_id to the lower plan and clear the gateway sub
    so the user can start a fresh subscription for that plan.

    Otherwise treat as a full cancellation; downgrade_to_free() runs later via
    BackgroundTasks after grace_period_ends_at.
    """
    gateway_sub_id = _extract_subscription_id(event_data)
    sub = await _sub_by_gateway_id(gateway_sub_id, db)
    if sub is None:
        return

    if sub.pending_downgrade_plan_id:
        # Scheduled downgrade: keep the row alive but switch to the lower plan
        sub.plan_id = sub.pending_downgrade_plan_id
        sub.pending_downgrade_plan_id = None
        sub.cancel_at_period_end = False
        sub.gateway_subscription_id = None   # old sub is gone; user must re-checkout
        sub.status = SubscriptionStatus.canceled
        sub.canceled_at = datetime.now(timezone.utc)
        await db.commit()

        # Notify user to resubscribe to the lower plan
        try:
            user = await db.get(__import__("models.user", fromlist=["User"]).User, sub.user_id)
            plan = await db.get(Plan, sub.plan_id)
            if user and plan:
                from services import email_service as _email
                await _email.send_downgrade_complete(
                    user.email, user.full_name, plan.display_name
                )
        except Exception:
            pass
        return

    # Normal cancellation
    sub.status = SubscriptionStatus.canceled
    sub.canceled_at = sub.canceled_at or datetime.now(timezone.utc)
    await db.commit()


async def on_trial_ending(db: AsyncSession, event_data: dict) -> None:
    """Stripe: customer.subscription.trial_will_end → send trial_ending_soon email."""
    gateway_sub_id = _extract_subscription_id(event_data)
    sub = await _sub_by_gateway_id(gateway_sub_id, db)
    if sub is None:
        return

    user = await db.get(__import__("models.user", fromlist=["User"]).User, sub.user_id)
    if user:
        trial_end_ts = (
            event_data.get("data", {}).get("object", {}).get("trial_end")
            or event_data.get("payload", {})
            .get("subscription", {})
            .get("entity", {})
            .get("end_at", 0)
        )
        trial_end_dt = _ts_to_dt(trial_end_ts) if trial_end_ts else None
        from services.email_service import send_trial_ending_soon
        await send_trial_ending_soon(user.email, user.full_name, trial_end_dt)


# ─── Internal helpers ─────────────────────────────────────────────────────────

async def _get_active_sub(user: "User", db: AsyncSession) -> Subscription:
    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub is None:
        raise ValueError("No active subscription found for this user")
    return sub


async def _sub_by_gateway_id(
    gateway_sub_id: str, db: AsyncSession
) -> "Subscription | None":
    """Look up a Subscription by its gateway_subscription_id."""
    return await db.scalar(
        select(Subscription).where(Subscription.gateway_subscription_id == gateway_sub_id)
    )


def _extract_subscription_id(event_data: dict) -> str:
    """Extract gateway subscription id from Stripe or Razorpay event dict."""
    # Stripe: event.data.object.id (for subscription events) or event.data.object.subscription
    obj = event_data.get("data", {}).get("object", {})
    sub_id = obj.get("id") or obj.get("subscription") or ""
    if sub_id:
        return str(sub_id)
    # Razorpay: payload.subscription.entity.id
    return str(
        event_data.get("payload", {})
        .get("subscription", {})
        .get("entity", {})
        .get("id", "")
    )


async def _validate_coupon_for_checkout(
    code: str, plan_id: int, user_id: int, db: AsyncSession
):
    """Validate a coupon code before checkout. Raises ValueError with a human-readable message."""
    from models.coupon import Coupon, CouponRedemption
    from sqlalchemy import select as sa_select

    now = datetime.now(timezone.utc)
    coupon = await db.scalar(sa_select(Coupon).where(Coupon.code == code))
    if coupon is None:
        raise ValueError("Coupon not found")
    if not coupon.is_active:
        raise ValueError("Coupon is no longer active")
    if coupon.valid_from and now < coupon.valid_from:
        raise ValueError("Coupon is not yet valid")
    if coupon.valid_until and now > coupon.valid_until:
        raise ValueError("Coupon has expired")
    if coupon.max_uses is not None and coupon.times_used >= coupon.max_uses:
        raise ValueError("Coupon has reached its maximum number of uses")
    if coupon.applies_to_plan is not None and coupon.applies_to_plan != plan_id:
        raise ValueError("Coupon does not apply to this plan")

    existing = await db.scalar(
        sa_select(CouponRedemption).where(
            CouponRedemption.coupon_id == coupon.id,
            CouponRedemption.user_id == user_id,
        )
    )
    if existing:
        raise ValueError("You have already used this coupon")

    return coupon


async def _redeem_pending_coupon(sub: "Subscription", db: AsyncSession) -> None:
    """Create a CouponRedemption and clear pending_coupon_code on the subscription."""
    from models.coupon import Coupon, CouponRedemption
    from decimal import Decimal
    from sqlalchemy import select as sa_select

    coupon = await db.scalar(
        sa_select(Coupon).where(Coupon.code == sub.pending_coupon_code)
    )
    if coupon is None or not coupon.is_active:
        sub.pending_coupon_code = None
        return

    # Guard against double-redemption (could happen if webhook fires twice)
    existing = await db.scalar(
        sa_select(CouponRedemption).where(
            CouponRedemption.coupon_id == coupon.id,
            CouponRedemption.user_id == sub.user_id,
        )
    )
    if existing:
        sub.pending_coupon_code = None
        return

    # Calculate actual discount amount for recording
    plan = await db.get(Plan, sub.plan_id)
    base_price = Decimal(str(plan.price_monthly if sub.billing_cycle == "monthly" else plan.price_yearly)) if plan else Decimal("0")
    if coupon.discount_type == "percent":
        discount_amount = (base_price * Decimal(str(coupon.discount_value)) / Decimal("100")).quantize(Decimal("0.01"))
    else:
        discount_amount = Decimal(str(coupon.discount_value))

    db.add(CouponRedemption(
        coupon_id=coupon.id,
        user_id=sub.user_id,
        subscription_id=sub.id,
        redeemed_at=datetime.now(timezone.utc),
        discount_amount=discount_amount,
    ))
    coupon.times_used += 1
    sub.pending_coupon_code = None


async def _upsert_payment_method(db: AsyncSession, user_id: int, gateway, card_data: dict) -> None:
    """Create or update the user's default PaymentMethod from gateway card data."""
    from models.subscription import PaymentMethod
    from sqlalchemy import select as sa_select

    card_brand     = card_data.get("network") or card_data.get("brand")
    card_last4     = str(card_data.get("last4") or card_data.get("last_4") or "")
    raw_month      = card_data.get("expiry_month") or card_data.get("exp_month")
    raw_year       = card_data.get("expiry_year")  or card_data.get("exp_year")
    gateway_pm_id  = str(card_data.get("id") or "")

    if not card_last4:
        return

    exp_month = int(raw_month) if raw_month else None
    exp_year  = int(raw_year)  if raw_year  else None

    existing = await db.scalar(
        sa_select(PaymentMethod).where(
            PaymentMethod.user_id == user_id,
            PaymentMethod.is_default == True,
        )
    )
    if existing:
        existing.card_brand                = card_brand
        existing.card_last4                = card_last4
        existing.card_exp_month            = exp_month
        existing.card_exp_year             = exp_year
        if gateway_pm_id:
            existing.gateway_payment_method_id = gateway_pm_id
    else:
        db.add(PaymentMethod(
            user_id=user_id,
            gateway=gateway,
            gateway_payment_method_id=gateway_pm_id or "razorpay_card",
            card_brand=card_brand,
            card_last4=card_last4,
            card_exp_month=exp_month,
            card_exp_year=exp_year,
            is_default=True,
        ))


def _cents_to_decimal(cents):
    from decimal import Decimal
    return Decimal(str(cents)) / Decimal("100")


def _ts_to_dt(ts) -> datetime:
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return datetime.now(timezone.utc)
