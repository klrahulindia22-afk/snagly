"""Phase 16 — Coupon & CouponRedemption models (PRD §5.28-G)."""
import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class DiscountType(str, enum.Enum):
    percent  = "percent"
    fixed    = "fixed"


class Coupon(Base):
    __tablename__ = "coupons"

    id                 = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    code               = Column(String(50), nullable=False, unique=True, index=True)
    description        = Column(String(255), nullable=True)
    discount_type      = Column(SAEnum(DiscountType), nullable=False)
    discount_value     = Column(Numeric(10, 2), nullable=False)
    max_uses           = Column(Integer, nullable=True)
    times_used         = Column(Integer, nullable=False, default=0)
    valid_from         = Column(DateTime, nullable=True)
    valid_until        = Column(DateTime, nullable=True)
    applies_to_plan    = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=True, index=True)
    is_active          = Column(Boolean, nullable=False, default=True)
    razorpay_offer_id  = Column(String(255), nullable=True)   # optional: Razorpay offer ID for gateway-side discount
    created_at         = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    plan_restriction = relationship("Plan", foreign_keys=[applies_to_plan])
    redemptions      = relationship("CouponRedemption", back_populates="coupon", cascade="all, delete-orphan")


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"

    __table_args__ = (
        UniqueConstraint("coupon_id", "user_id", name="uq_coupon_redemption_per_user"),
    )

    id              = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    coupon_id       = Column(BIGINT(unsigned=True), ForeignKey("coupons.id"), nullable=False, index=True)
    user_id         = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(BIGINT(unsigned=True), ForeignKey("subscriptions.id"), nullable=True, index=True)
    redeemed_at     = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    discount_amount = Column(Numeric(10, 2), nullable=False)

    coupon       = relationship("Coupon", back_populates="redemptions")
    user         = relationship("User", foreign_keys=[user_id])
    subscription = relationship("Subscription", foreign_keys=[subscription_id])
