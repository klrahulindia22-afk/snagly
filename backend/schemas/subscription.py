"""Phase 16d — Pydantic schemas for user-facing subscription endpoints.

Security rules (from CLAUDE.md §13):
- Never return gateway secret keys, webhook secrets, or full card numbers.
- PaymentMethod response: card_brand, card_last4, card_exp_month, card_exp_year only.
- Never expose gateway_customer_id or gateway_subscription_id to the frontend.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ─── Feature flags & plans ────────────────────────────────────────────────────

class PlanFeatureFlagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    feature_key: str
    is_enabled: bool
    limit_value: Optional[int] = None


class PlanPublicOut(BaseModel):
    """Plan response safe for public consumption — no gateway price IDs."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    price_monthly: Decimal
    price_yearly: Decimal
    sort_order: int
    is_highlighted: bool
    is_active: bool
    feature_flags: list[PlanFeatureFlagOut] = []


# ─── Admin plan schemas ───────────────────────────────────────────────────────

class AdminPlanOut(BaseModel):
    """Full plan response for admin panel — includes gateway price IDs."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    price_monthly: Decimal
    price_yearly: Decimal
    sort_order: int
    is_highlighted: bool
    is_active: bool
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    razorpay_plan_id_monthly: Optional[str] = None
    razorpay_plan_id_yearly: Optional[str] = None
    feature_flags: list[PlanFeatureFlagOut] = []


class PlanCreate(BaseModel):
    name: str
    display_name: str
    price_monthly: Decimal = Decimal("0.00")
    price_yearly: Decimal = Decimal("0.00")
    sort_order: int = 0
    is_highlighted: bool = False
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    razorpay_plan_id_monthly: Optional[str] = None
    razorpay_plan_id_yearly: Optional[str] = None


class FeatureFlagUpdate(BaseModel):
    feature_key: str
    is_enabled: bool = True
    limit_value: Optional[int] = None


class PlanUpdate(BaseModel):
    display_name: Optional[str] = None
    price_monthly: Optional[Decimal] = None
    price_yearly: Optional[Decimal] = None
    sort_order: Optional[int] = None
    is_highlighted: Optional[bool] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    razorpay_plan_id_monthly: Optional[str] = None
    razorpay_plan_id_yearly: Optional[str] = None
    feature_flags: Optional[list[FeatureFlagUpdate]] = None


# ─── Subscription ─────────────────────────────────────────────────────────────

class SubscriptionOut(BaseModel):
    """User-facing subscription — no gateway internal IDs."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    plan_id: int
    status: str
    gateway: str
    billing_cycle: Optional[str] = None
    pending_upgrade_plan_id: Optional[int] = None
    pending_downgrade_plan_id: Optional[int] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    cancel_at_period_end: bool
    canceled_at: Optional[datetime] = None
    grace_period_ends_at: Optional[datetime] = None
    created_at: datetime


class AdminSubscriptionOut(BaseModel):
    """Admin-facing subscription — includes gateway_subscription_id for support."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    user_email: str
    user_name: str
    plan_id: int
    plan_name: str
    plan_display_name: str
    status: str
    gateway: str
    gateway_subscription_id: Optional[str] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    cancel_at_period_end: bool
    canceled_at: Optional[datetime] = None
    grace_period_ends_at: Optional[datetime] = None
    created_at: datetime


class AdminSubscriptionPatch(BaseModel):
    """Manual plan override — admin only, bypasses gateway."""
    plan_id: int


# ─── Usage ────────────────────────────────────────────────────────────────────

class UsageOut(BaseModel):
    boards_used: int
    boards_limit: Optional[int]       # None = unlimited
    members_max_any_board: int
    members_limit: Optional[int]
    storage_used_bytes: int
    storage_limit_bytes: Optional[int]
    storage_used_pct: float


class SubscriptionMeOut(BaseModel):
    subscription: Optional[SubscriptionOut] = None
    plan: PlanPublicOut
    usage: UsageOut


# ─── Request bodies ───────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan_id: int
    billing_cycle: Literal["monthly", "yearly"]
    trial_days: int = 0
    coupon_code: Optional[str] = None


class CouponValidateRequest(BaseModel):
    code: str
    plan_id: int

    @field_validator("code")
    @classmethod
    def code_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Coupon code cannot be empty")
        return v.strip().upper()


class CouponValidateOut(BaseModel):
    code: str
    discount_type: str
    discount_value: str
    description: Optional[str] = None


class UpgradeRequest(BaseModel):
    plan_id: int


class DowngradeRequest(BaseModel):
    plan_id: int


class CancelRequest(BaseModel):
    reason: str = ""


class SwitchCycleRequest(BaseModel):
    billing_cycle: Literal["monthly", "yearly"]


class ApplyCouponRequest(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def code_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Coupon code cannot be empty")
        return v.strip().upper()


# ─── Invoices ─────────────────────────────────────────────────────────────────

class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subscription_id: int
    gateway: str
    gateway_invoice_id: str
    amount: Decimal
    currency: str
    status: str
    invoice_pdf_url: Optional[str] = None
    period_start: datetime
    period_end: datetime
    paid_at: Optional[datetime] = None
    created_at: datetime


# ─── Payment methods ──────────────────────────────────────────────────────────

class PaymentMethodOut(BaseModel):
    """Safe response — no full card number or gateway internal method ID."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    gateway: str
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    card_exp_month: Optional[int] = None
    card_exp_year: Optional[int] = None
    is_default: bool
    created_at: datetime


# ─── Revenue ──────────────────────────────────────────────────────────────────

class RevenueOut(BaseModel):
    mrr: float
    arr: float
    active_subscribers: int
    trialing: int
    canceled_this_month: int
    churn_rate: float


# ─── Gateway config ───────────────────────────────────────────────────────────

class GatewayConfigPatch(BaseModel):
    """Writable gateway config — values stored encrypted in SystemConfig."""
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    razorpay_webhook_secret: Optional[str] = None
    gateway_default: Optional[Literal["stripe", "razorpay"]] = None
    gateway_india: Optional[Literal["stripe", "razorpay"]] = None
