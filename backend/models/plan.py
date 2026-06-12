from sqlalchemy import Column, String, Boolean, Numeric
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)          # free / pro / business / enterprise
    display_name = Column(String(100), nullable=False)
    price_monthly = Column(Numeric(10, 2), nullable=False, default=0)
    price_yearly = Column(Numeric(10, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    feature_flags = relationship("PlanFeatureFlag", back_populates="plan", cascade="all, delete-orphan")


class PlanFeatureFlag(Base):
    __tablename__ = "plan_feature_flags"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    plan_id = Column(BIGINT(unsigned=True), nullable=False, index=True)
    feature_key = Column(String(100), nullable=False)   # e.g. "integrations", "unlimited_boards"
    is_enabled = Column(Boolean, nullable=False, default=True)
    limit_value = Column(BIGINT(unsigned=True), nullable=True)      # e.g. board count limit

    plan = relationship("Plan", back_populates="feature_flags", foreign_keys=[plan_id])
