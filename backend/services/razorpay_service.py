"""Phase 16b — Razorpay SDK wrapper.

All public functions are `async def`; the synchronous Razorpay SDK is wrapped
via `asyncio.to_thread()` to avoid blocking the event loop.

Notes:
- Razorpay does not support subscription proration.  Downgrades are handled in
  subscription_service by cancel + recreate at period end.
- Secret key is never logged; always read from config.Settings.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
from typing import TYPE_CHECKING

import razorpay

from config import settings

if TYPE_CHECKING:
    from models.user import User


# ─── Custom exception ─────────────────────────────────────────────────────────

class RazorpayServiceError(Exception):
    """Raised when a Razorpay API call fails."""
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _client() -> razorpay.Client:
    """Return a Razorpay Client; credentials come from Settings, never hardcoded."""
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


# ─── Public API ───────────────────────────────────────────────────────────────

async def create_customer(user: "User") -> str:
    """Create a Razorpay Customer and return the customer_id string.

    If a customer with the same email already exists (from a prior partial
    checkout attempt), Razorpay may still raise 'already exists' even with
    fail_existing=0.  We catch that and look up the existing customer.
    """
    def _sync() -> str:
        rzp = _client()
        try:
            customer = rzp.customer.create(data={
                "name": user.full_name,
                "email": user.email,
                "fail_existing": 0,
            })
            return customer["id"]
        except Exception as exc:
            if "already exists" in str(exc).lower():
                # Customer was created in a previous attempt — find and reuse them
                try:
                    result = rzp.customer.all({"count": 100})
                    for item in (result.get("items") or []):
                        if item.get("email") == user.email:
                            return item["id"]
                except Exception:
                    pass
            raise RazorpayServiceError(str(exc)) from exc

    return await asyncio.to_thread(_sync)


async def create_subscription(
    customer_id: str,
    razorpay_plan_id: str,
    trial_days: int = 0,
    offer_id: str | None = None,
) -> dict:
    """Create a Razorpay Subscription and return the raw subscription dict.

    offer_id: optional Razorpay Offer ID that discounts the subscription charge.
    """
    def _sync() -> dict:
        try:
            data: dict = {
                "plan_id": razorpay_plan_id,
                "customer_id": customer_id,
                "quantity": 1,
                "total_count": 120,   # max billing cycles (10 years)
            }
            if trial_days > 0:
                data["start_at"] = _unix_future(trial_days)
            if offer_id:
                data["offer_id"] = offer_id

            sub = _client().subscription.create(data=data)
            return dict(sub)
        except Exception as exc:
            raise RazorpayServiceError(str(exc)) from exc

    return await asyncio.to_thread(_sync)


async def cancel_subscription(
    gateway_subscription_id: str,
    at_period_end: bool = True,
) -> dict:
    """Cancel a Razorpay subscription.

    at_period_end=True  → cancel at end of current billing cycle (used for user-initiated cancel).
    at_period_end=False → cancel immediately (used when upgrading to a new plan).
    """
    def _sync() -> dict:
        try:
            result = _client().subscription.cancel(
                gateway_subscription_id,
                data={"cancel_at_cycle_end": 1 if at_period_end else 0},
            )
            return dict(result)
        except Exception as exc:
            raise RazorpayServiceError(str(exc)) from exc

    return await asyncio.to_thread(_sync)


async def verify_webhook_signature(payload: bytes, signature: str) -> dict:
    """Verify Razorpay webhook signature and return the parsed JSON event dict.

    Raises RazorpayServiceError if signature is invalid.
    Uses RAZORPAY_WEBHOOK_SECRET from settings.
    """
    import json

    def _sync() -> dict:
        try:
            _client().utility.verify_webhook_signature(
                payload.decode("utf-8"),
                signature,
                settings.RAZORPAY_WEBHOOK_SECRET,
            )
            return json.loads(payload)
        except razorpay.errors.SignatureVerificationError as exc:
            raise RazorpayServiceError("Invalid Razorpay webhook signature", code="invalid_signature") from exc
        except Exception as exc:
            raise RazorpayServiceError(str(exc)) from exc

    return await asyncio.to_thread(_sync)


# ─── Internal utilities ───────────────────────────────────────────────────────

def _unix_future(days: int) -> int:
    """Return a Unix timestamp `days` from now (used for trial_start_at)."""
    import time
    return int(time.time()) + days * 86400
