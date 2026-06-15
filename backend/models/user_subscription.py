"""Admin revenue module model — informal subscription tracking (pre-Phase 16).
Kept separate from the PRD-compliant Subscription model (models/subscription.py).
"""
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class UserSubscription(Base):
    __tablename__ = 'user_subscriptions'

    id            = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id       = Column(BIGINT(unsigned=True), ForeignKey('users.id'), nullable=False, index=True)
    plan_id       = Column(BIGINT(unsigned=True), ForeignKey('plans.id'), nullable=False, index=True)
    started_at    = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at    = Column(DateTime, nullable=True)
    amount_paid   = Column(Numeric(10, 2), default=Decimal('0.00'))
    billing_cycle = Column(String(20), nullable=True)
    is_active     = Column(Boolean, default=True, index=True)
    cancelled_at  = Column(DateTime, nullable=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship('User', lazy='select', foreign_keys=[user_id])
    plan = relationship('Plan', lazy='select', foreign_keys=[plan_id])
