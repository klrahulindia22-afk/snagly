"""Phase 16b — Stripe SDK wrapper.

All public functions are `async def` and wrap the synchronous Stripe SDK via
`asyncio.to_thread()` to avoid blocking the event loop.

CLAUDE.md rules observed:
- Secret key is never logged; always read from config.Settings.
- On failure, raise StripeServiceError (never propagate raw StripeError to callers).

NOTE: stripe v15+ exposes exceptions directly on the top-level `stripe` namespace.
      The `stripe.error` submodule no longer exists.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import stripe

from config import settings

if TYPE_CHECKING:
    from models.user import User


# ─── Custom exception ─────────────────────────────────────────────────────────

class StripeServiceError(Exception):
    """Raised when a Stripe API call fails."""
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _client() -> stripe.StripeClient:
    """Return a configured StripeClient; key comes from Settings, never hardcoded."""
    return stripe.StripeClient(api_key=settings.STRIPE_SECRET_KEY)


def _wrap(exc: Exception) -> StripeServiceError:
    code = getattr(exc, "code", None)
    return StripeServiceError(str(exc), code=code)


# ─── Public API ───────────────────────────────────────────────────────────────

async def create_customer(user: "User") -> str:
    """Create a Stripe Customer and return the customer_id string."""
    def _sync() -> str:
        try:
            customer = _client().customers.create(
                params={"email": user.email, "name": user.full_name}
            )
            return customer.id
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def create_subscription(
    customer_id: str,
    stripe_price_id: str,
    trial_days: int = 0,
) -> dict:
    """Create a Stripe Subscription and return the raw Subscription dict."""
    def _sync() -> dict:
        try:
            params: dict = {
                "customer": customer_id,
                "items": [{"price": stripe_price_id}],
                "payment_behavior": "default_incomplete",
                "expand": ["latest_invoice.payment_intent"],
            }
            if trial_days > 0:
                params["trial_period_days"] = trial_days

            sub = _client().subscriptions.create(params=params)
            return dict(sub)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def upgrade_subscription(
    gateway_subscription_id: str,
    new_stripe_price_id: str,
) -> dict:
    """Immediately swap the price on an existing subscription (prorated)."""
    def _sync() -> dict:
        try:
            sub = _client().subscriptions.retrieve(gateway_subscription_id)
            item_id = sub.items.data[0].id

            updated = _client().subscriptions.update(
                gateway_subscription_id,
                params={
                    "items": [{"id": item_id, "price": new_stripe_price_id}],
                    "proration_behavior": "create_prorations",
                },
            )
            return dict(updated)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def downgrade_subscription(
    gateway_subscription_id: str,
    new_stripe_price_id: str,
) -> dict:
    """Schedule a price change at end of billing period (no proration)."""
    def _sync() -> dict:
        try:
            sub = _client().subscriptions.retrieve(gateway_subscription_id)
            item_id = sub.items.data[0].id

            updated = _client().subscriptions.update(
                gateway_subscription_id,
                params={
                    "items": [{"id": item_id, "price": new_stripe_price_id}],
                    "proration_behavior": "none",
                    "billing_cycle_anchor": "unchanged",
                },
            )
            return dict(updated)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def cancel_subscription(
    gateway_subscription_id: str,
    at_period_end: bool = True,
) -> dict:
    """Cancel a Stripe Subscription.

    at_period_end=True  → user keeps access until billing period ends.
    at_period_end=False → immediate cancellation.
    """
    def _sync() -> dict:
        try:
            if at_period_end:
                updated = _client().subscriptions.update(
                    gateway_subscription_id,
                    params={"cancel_at_period_end": True},
                )
                return dict(updated)
            else:
                cancelled = _client().subscriptions.cancel(gateway_subscription_id)
                return dict(cancelled)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def reactivate_subscription(gateway_subscription_id: str) -> dict:
    """Clear cancel_at_period_end so the subscription renews as normal."""
    def _sync() -> dict:
        try:
            updated = _client().subscriptions.update(
                gateway_subscription_id,
                params={"cancel_at_period_end": False},
            )
            return dict(updated)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def verify_webhook_signature(payload_bytes: bytes, sig_header: str) -> dict:
    """Verify Stripe webhook signature and return the parsed event dict.

    Raises StripeServiceError if signature is invalid.
    Uses STRIPE_WEBHOOK_SECRET from settings (never passed directly in code).
    """
    def _sync() -> dict:
        try:
            event = stripe.Webhook.construct_event(
                payload_bytes, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
            return dict(event)
        except stripe.SignatureVerificationError as exc:
            raise StripeServiceError(
                "Invalid Stripe webhook signature", code="invalid_signature"
            ) from exc
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)


async def get_invoice_pdf_url(gateway_invoice_id: str) -> str | None:
    """Return the hosted invoice PDF URL, or None if unavailable."""
    def _sync() -> str | None:
        try:
            invoice = _client().invoices.retrieve(gateway_invoice_id)
            return getattr(invoice, "invoice_pdf", None)
        except stripe.StripeError as exc:
            raise _wrap(exc) from exc

    return await asyncio.to_thread(_sync)
