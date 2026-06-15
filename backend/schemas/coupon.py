"""Phase 16e — Pydantic schemas for coupon admin endpoints."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class CouponCreate(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: Literal["percent", "fixed"]
    discount_value: Decimal
    max_uses: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    applies_to_plan: Optional[int] = None
    is_active: bool = True
    razorpay_offer_id: Optional[str] = None

    @field_validator("code")
    @classmethod
    def code_upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("discount_value")
    @classmethod
    def value_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("discount_value must be positive")
        return v


class CouponUpdate(BaseModel):
    description: Optional[str] = None
    discount_value: Optional[Decimal] = None
    max_uses: Optional[int] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None
    applies_to_plan: Optional[int] = None
    razorpay_offer_id: Optional[str] = None


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    max_uses: Optional[int] = None
    times_used: int
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    applies_to_plan: Optional[int] = None
    is_active: bool
    razorpay_offer_id: Optional[str] = None
    created_at: datetime
