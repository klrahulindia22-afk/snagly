from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional
from decimal import Decimal
from datetime import datetime
from models.user import UserRole


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class AdminBoardLimitUpdate(BaseModel):
    member_limit: int

    @field_validator("member_limit")
    @classmethod
    def limit_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Member limit must be at least 1")
        return v


class AdminUserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminBoardOut(BaseModel):
    id: int
    name: str
    owner_id: int
    owner_name: Optional[str] = None
    member_limit: int
    is_archived: bool
    created_at: datetime


class AdminInviteOut(BaseModel):
    id: int
    email: str
    board_id: Optional[int] = None
    board_name: Optional[str] = None
    invited_by_name: Optional[str] = None
    role: UserRole
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    is_cancelled: bool
    created_at: datetime


class AdminStatsOut(BaseModel):
    total_users: int
    active_users: int
    total_boards: int
    pending_invites: int


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    price_monthly: Decimal
    price_yearly: Decimal
    is_active: bool


class SubscriptionCreate(BaseModel):
    user_id: int
    plan_id: int
    started_at: datetime
    expires_at: Optional[datetime] = None
    amount_paid: Decimal = Decimal('0.00')
    billing_cycle: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[int] = None
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    cancelled_at: Optional[datetime] = None
    amount_paid: Optional[Decimal] = None
    billing_cycle: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    user_email: str
    user_name: str
    user_avatar_url: Optional[str]
    plan_id: int
    plan_name: str
    plan_display_name: str
    started_at: datetime
    expires_at: Optional[datetime]
    amount_paid: Optional[Decimal]
    billing_cycle: Optional[str]
    is_active: bool
    cancelled_at: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]


class RevenuePlanBreakdown(BaseModel):
    plan_id: int
    plan_name: str
    plan_display_name: str
    subscriber_count: int
    total_revenue: float


class RevenueStatsOut(BaseModel):
    total_revenue: float
    active_subscriptions: int
    expiring_this_month: int
    new_this_month: int
    free_users: int
    revenue_by_plan: list[RevenuePlanBreakdown]
