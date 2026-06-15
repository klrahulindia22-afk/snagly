from sqlalchemy import Column, String, Boolean, Numeric, ForeignKey, SmallInteger
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    price_monthly = Column(Numeric(10, 2), nullable=False, default=0)
    price_yearly = Column(Numeric(10, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    # Phase 16a — gateway + UI fields
    sort_order               = Column(SmallInteger, nullable=False, default=0)
    is_highlighted           = Column(Boolean, nullable=False, default=False)
    stripe_price_id_monthly  = Column(String(255), nullable=True)
    stripe_price_id_yearly   = Column(String(255), nullable=True)
    razorpay_plan_id_monthly = Column(String(255), nullable=True)
    razorpay_plan_id_yearly  = Column(String(255), nullable=True)

    feature_flags = relationship("PlanFeatureFlag", back_populates="plan", cascade="all, delete-orphan")


class PlanFeatureFlag(Base):
    __tablename__ = "plan_feature_flags"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    plan_id = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=False, index=True)
    feature_key = Column(String(100), nullable=False)   # e.g. "integrations", "unlimited_boards"
    is_enabled = Column(Boolean, nullable=False, default=True)
    limit_value = Column(BIGINT(unsigned=True), nullable=True)      # e.g. board count limit

    plan = relationship("Plan", back_populates="feature_flags", foreign_keys=[plan_id])
