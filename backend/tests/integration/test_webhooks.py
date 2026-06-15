"""Integration tests for Phase 16c webhook handlers.

Uses the httpx ASGI test client (same DB as integration conftest).
All Stripe and Razorpay SDK calls are mocked — no real API calls.

Test cases:
1. Stripe invoice.paid → Invoice created, status=paid, email sent
2. Duplicate Stripe event_id → 200, no DB write, no email
3. Invalid Stripe signature → 400, no DB write
4. Razorpay subscription.activated → Subscription.status=active
5. Third payment failure → apply_grace_period() called (grace_period_ends_at set)
"""
from __future__ import annotations

import json
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select

from models.subscription import (
    Invoice, InvoiceStatus, Subscription, SubscriptionGateway, SubscriptionStatus
)
from models.user import User, UserRole
from models.plan import Plan
from models.webhook_event import WebhookEvent, WebhookGateway
from services.stripe_service import StripeServiceError
from services.razorpay_service import RazorpayServiceError


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@webhook.test"


def _stripe_invoice_paid_event(
    event_id: str,
    sub_id: str,
    invoice_id: str,
) -> dict:
    return {
        "id": event_id,
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": invoice_id,
                "subscription": sub_id,
                "amount_paid": 999,
                "currency": "usd",
                "status": "paid",
                "period_start": 1700000000,
                "period_end":   1702592000,
                "invoice_pdf": None,
            }
        },
    }


def _stripe_payment_failed_event(
    event_id: str,
    sub_id: str,
    invoice_id: str,
    attempt_count: int,
) -> dict:
    return {
        "id": event_id,
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "id": invoice_id,
                "subscription": sub_id,
                "amount_due": 999,
                "currency": "usd",
                "attempt_count": attempt_count,
                "period_start": 1700000000,
                "period_end":   1702592000,
            }
        },
    }


def _razorpay_sub_activated_event(rzp_sub_id: str) -> tuple[bytes, dict]:
    payload = {
        "event": "subscription.activated",
        "event_id": f"evt_rzp_{uuid.uuid4().hex[:8]}",
        "payload": {
            "subscription": {
                "entity": {"id": rzp_sub_id, "status": "active"}
            }
        },
    }
    body = json.dumps(payload).encode()
    return body, payload


# ─── Fixtures ─────────────────────────────────────────────────────────────────
# client and raw_db come from tests/integration/conftest.py

@pytest_asyncio.fixture
async def stripe_user_and_sub(raw_db):
    """Create a User + Plan + Subscription wired to a fake Stripe subscription id."""
    from sqlalchemy import select as _s

    plan = await raw_db.scalar(_s(Plan).where(Plan.name == "pro"))
    if plan is None:
        plan = Plan(name="pro", display_name="Pro", price_monthly=Decimal("9.99"),
                    price_yearly=Decimal("99.00"), is_active=True)
        raw_db.add(plan)
        await raw_db.flush()

    user = User(
        email=_unique_email(),
        password_hash="$2b$12$xxx",
        full_name="Webhook Test User",
        role=UserRole.team,
        is_verified=True,
    )
    raw_db.add(user)
    await raw_db.flush()

    stripe_sub_id = f"sub_test_{uuid.uuid4().hex[:8]}"
    sub = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.trialing,
        gateway=SubscriptionGateway.stripe,
        gateway_subscription_id=stripe_sub_id,
        gateway_customer_id="cus_test_123",
    )
    raw_db.add(sub)
    await raw_db.commit()
    return user, sub


@pytest_asyncio.fixture
async def razorpay_user_and_sub(raw_db):
    """Create a User + Plan + Subscription wired to a fake Razorpay subscription id."""
    from sqlalchemy import select as _s

    plan = await raw_db.scalar(_s(Plan).where(Plan.name == "pro"))
    if plan is None:
        plan = Plan(name="pro", display_name="Pro", price_monthly=Decimal("9.99"),
                    price_yearly=Decimal("99.00"), is_active=True)
        raw_db.add(plan)
        await raw_db.flush()

    user = User(
        email=_unique_email(),
        password_hash="$2b$12$xxx",
        full_name="Razorpay Test User",
        role=UserRole.team,
        is_verified=True,
    )
    raw_db.add(user)
    await raw_db.flush()

    rzp_sub_id = f"sub_rzp_{uuid.uuid4().hex[:8]}"
    sub = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.trialing,
        gateway=SubscriptionGateway.razorpay,
        gateway_subscription_id=rzp_sub_id,
        gateway_customer_id="cust_rzp_test",
    )
    raw_db.add(sub)
    await raw_db.commit()
    return user, sub


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestStripeInvoicePaid:
    """Stripe invoice.paid → Invoice created with status=paid, email sent."""

    @pytest.mark.asyncio
    async def test_invoice_paid_creates_invoice_row(self, client, stripe_user_and_sub, raw_db):
        _, sub = stripe_user_and_sub
        event_id   = f"evt_{uuid.uuid4().hex[:12]}"
        invoice_id = f"in_{uuid.uuid4().hex[:12]}"
        event      = _stripe_invoice_paid_event(event_id, sub.gateway_subscription_id, invoice_id)
        body       = json.dumps(event).encode()

        with (
            patch("services.stripe_service.stripe") as mock_stripe,
            patch("services.email_service.send_email", new_callable=AsyncMock) as mock_email,
        ):
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.return_value = event
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            resp = await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "t=1,v1=abc"},
            )

        assert resp.status_code == 200, resp.text

        # Invoice must exist in DB
        invoice = await raw_db.scalar(
            select(Invoice).where(Invoice.gateway_invoice_id == invoice_id)
        )
        assert invoice is not None
        assert invoice.status == InvoiceStatus.paid
        assert invoice.subscription_id == sub.id

        # Email must have been sent
        assert mock_email.called

    @pytest.mark.asyncio
    async def test_webhook_event_row_is_marked_processed(self, client, stripe_user_and_sub, raw_db):
        _, sub = stripe_user_and_sub
        event_id   = f"evt_{uuid.uuid4().hex[:12]}"
        invoice_id = f"in_{uuid.uuid4().hex[:12]}"
        event      = _stripe_invoice_paid_event(event_id, sub.gateway_subscription_id, invoice_id)
        body       = json.dumps(event).encode()

        with (
            patch("services.stripe_service.stripe") as mock_stripe,
            patch("services.email_service.send_email", new_callable=AsyncMock),
        ):
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.return_value = event
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "t=1,v1=abc"},
            )

        wh = await raw_db.scalar(
            select(WebhookEvent).where(
                WebhookEvent.gateway  == WebhookGateway.stripe,
                WebhookEvent.event_id == event_id,
            )
        )
        assert wh is not None
        assert wh.processed is True
        assert wh.processed_at is not None
        assert wh.error is None


class TestStripeDuplicateEvent:
    """Duplicate Stripe event_id → 200, no second DB write, no email."""

    @pytest.mark.asyncio
    async def test_duplicate_returns_200_immediately(self, client, stripe_user_and_sub, raw_db):
        _, sub = stripe_user_and_sub
        event_id   = f"evt_{uuid.uuid4().hex[:12]}"
        invoice_id = f"in_{uuid.uuid4().hex[:12]}"
        event      = _stripe_invoice_paid_event(event_id, sub.gateway_subscription_id, invoice_id)
        body       = json.dumps(event).encode()

        with (
            patch("services.stripe_service.stripe") as mock_stripe,
            patch("services.email_service.send_email", new_callable=AsyncMock) as mock_email,
        ):
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.return_value = event
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            # First delivery
            r1 = await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "t=1,v1=abc"},
            )
            call_count_after_first = mock_email.call_count

            # Second delivery (duplicate)
            r2 = await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "t=1,v1=abc"},
            )

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert json.loads(r2.text).get("status") == "already_processed"
        # Email should NOT have been sent a second time
        assert mock_email.call_count == call_count_after_first

        # Only one Invoice row
        from sqlalchemy import func
        count = await raw_db.scalar(
            select(func.count()).select_from(Invoice)
            .where(Invoice.gateway_invoice_id == invoice_id)
        )
        assert count == 1


class TestStripeInvalidSignature:
    """Invalid signature → 400, no DB write."""

    @pytest.mark.asyncio
    async def test_bad_signature_returns_400(self, client):
        body = b'{"id":"evt_bad","type":"invoice.paid","data":{"object":{}}}'

        with patch("services.stripe_service.stripe") as mock_stripe:
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.side_effect = (
                stripe_sdk.SignatureVerificationError("bad", sig_header="x")
            )
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            resp = await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "bad_sig"},
            )

        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bad_signature_writes_no_db_row(self, client, raw_db):
        event_id = f"evt_badsig_{uuid.uuid4().hex[:8]}"
        body = json.dumps({"id": event_id, "type": "invoice.paid"}).encode()

        with patch("services.stripe_service.stripe") as mock_stripe:
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.side_effect = (
                stripe_sdk.SignatureVerificationError("bad", sig_header="x")
            )
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "bad_sig"},
            )

        wh = await raw_db.scalar(
            select(WebhookEvent).where(WebhookEvent.event_id == event_id)
        )
        assert wh is None


class TestRazorpaySubscriptionActivated:
    """Razorpay subscription.activated → Subscription.status = active."""

    @pytest.mark.asyncio
    async def test_sub_activated_sets_status(self, client, razorpay_user_and_sub, raw_db):
        user, sub = razorpay_user_and_sub
        body, event = _razorpay_sub_activated_event(sub.gateway_subscription_id)

        with (
            patch("services.razorpay_service._client") as mock_client_fn,
            patch("services.email_service.send_email", new_callable=AsyncMock),
        ):
            mock_rzp = MagicMock()
            mock_rzp.utility.verify_webhook_signature.return_value = None
            mock_client_fn.return_value = mock_rzp

            resp = await client.post(
                "/api/v1/webhooks/razorpay",
                content=body,
                headers={"x-razorpay-signature": "valid_sig"},
            )

        assert resp.status_code == 200

        await raw_db.refresh(sub)
        assert sub.status == SubscriptionStatus.active


class TestPaymentFailedThirdAttempt:
    """3rd payment failure → apply_grace_period() sets grace_period_ends_at."""

    @pytest.mark.asyncio
    async def test_third_failure_sets_grace_period(self, client, stripe_user_and_sub, raw_db):
        _, sub = stripe_user_and_sub
        event_id   = f"evt_{uuid.uuid4().hex[:12]}"
        invoice_id = f"in_{uuid.uuid4().hex[:12]}"
        event      = _stripe_payment_failed_event(
            event_id, sub.gateway_subscription_id, invoice_id, attempt_count=3
        )
        body = json.dumps(event).encode()

        with (
            patch("services.stripe_service.stripe") as mock_stripe,
            patch("services.email_service.send_email", new_callable=AsyncMock),
        ):
            import stripe as stripe_sdk
            mock_stripe.Webhook.construct_event.return_value = event
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            resp = await client.post(
                "/api/v1/webhooks/stripe",
                content=body,
                headers={"stripe-signature": "t=1,v1=abc"},
            )

        assert resp.status_code == 200

        await raw_db.refresh(sub)
        assert sub.grace_period_ends_at is not None
        assert sub.status == SubscriptionStatus.past_due

        # Invoice row created with failed status
        invoice = await raw_db.scalar(
            select(Invoice).where(Invoice.gateway_invoice_id == invoice_id)
        )
        assert invoice is not None
        assert invoice.status == InvoiceStatus.failed
