"""Phase 16 — Subscription & Billing models (PRD §5.28-G)."""
import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum,
    ForeignKey, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.mysql import BIGINT, TINYINT, SMALLINT
from sqlalchemy.orm import relationship
from database import Base


class SubscriptionStatus(str, enum.Enum):
    trialing  = "trialing"
    active    = "active"
    past_due  = "past_due"
    canceled  = "canceled"
    paused    = "paused"


class SubscriptionGateway(str, enum.Enum):
    stripe    = "stripe"
    razorpay  = "razorpay"
    none      = "none"


class InvoiceStatus(str, enum.Enum):
    paid   = "paid"
    open   = "open"
    failed = "failed"
    void   = "void"


class Subscription(Base):
    """One subscription per user (UNIQUE on user_id).
    Plan is derived from subscription.plan_id. Free plan is default when user.subscription_id IS NULL.
    """
    __tablename__ = "subscriptions"

    id                      = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id                 = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    plan_id                 = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=False, index=True)
    status                  = Column(SAEnum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.active)
    gateway                 = Column(SAEnum(SubscriptionGateway), nullable=False, default=SubscriptionGateway.none)
    gateway_subscription_id = Column(String(255), nullable=True, index=True)
    gateway_customer_id     = Column(String(255), nullable=True)
    current_period_start    = Column(DateTime, nullable=True)
    current_period_end      = Column(DateTime, nullable=True)
    trial_start             = Column(DateTime, nullable=True)
    trial_end               = Column(DateTime, nullable=True)
    billing_cycle               = Column(String(10), nullable=True)    # 'monthly' | 'yearly'
    pending_coupon_code         = Column(String(50), nullable=True)    # coupon waiting for activation webhook
    pending_upgrade_plan_id     = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=True)  # upgrade target plan (Razorpay only, confirmed by webhook)
    pending_downgrade_plan_id   = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=True)  # downgrade target plan
    cancel_at_period_end        = Column(Boolean, nullable=False, default=False)
    canceled_at             = Column(DateTime, nullable=True)
    grace_period_ends_at    = Column(DateTime, nullable=True)
    created_at              = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at              = Column(DateTime, nullable=False,
                                    default=lambda: datetime.now(timezone.utc),
                                    onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])
    plan = relationship("Plan", foreign_keys=[plan_id])


class PaymentMethod(Base):
    """Stored payment card metadata (no raw card numbers — gateway holds those)."""
    __tablename__ = "payment_methods"

    id                        = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id                   = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    gateway                   = Column(SAEnum(SubscriptionGateway), nullable=False)
    gateway_payment_method_id = Column(String(255), nullable=False)
    card_brand                = Column(String(20), nullable=True)   # visa / mastercard / amex / rupay
    card_last4                = Column(String(4), nullable=True)
    card_exp_month            = Column(TINYINT(unsigned=True), nullable=True)
    card_exp_year             = Column(SMALLINT(unsigned=True), nullable=True)
    is_default                = Column(Boolean, nullable=False, default=False)
    created_at                = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])


class Invoice(Base):
    """Payment record per billing cycle. UNIQUE on gateway_invoice_id for idempotency."""
    __tablename__ = "invoices"

    id                 = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id            = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    subscription_id    = Column(BIGINT(unsigned=True), ForeignKey("subscriptions.id"), nullable=False, index=True)
    gateway            = Column(SAEnum(SubscriptionGateway), nullable=False)
    gateway_invoice_id = Column(String(255), nullable=False, unique=True)
    amount             = Column(Numeric(10, 2), nullable=False)
    currency           = Column(String(3), nullable=False, default="USD")
    status             = Column(SAEnum(InvoiceStatus), nullable=False)
    invoice_pdf_url    = Column(Text, nullable=True)
    period_start       = Column(DateTime, nullable=False)
    period_end         = Column(DateTime, nullable=False)
    paid_at            = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user         = relationship("User", foreign_keys=[user_id])
    subscription = relationship("Subscription", foreign_keys=[subscription_id])
