import json
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, or_, and_
from typing import Optional, Any
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.invite import Invite
from models.plan import Plan, PlanFeatureFlag
from models.user_subscription import UserSubscription
from models.system_config import SystemConfig
from models.admin_audit_log import AdminAuditLog
from models.subscription import Subscription, SubscriptionStatus, SubscriptionGateway
from models.coupon import Coupon, DiscountType
from schemas.admin import (
    AdminUserCreate, AdminUserUpdate, AdminBoardLimitUpdate,
    AdminUserOut, AdminBoardOut, AdminInviteOut, AdminStatsOut,
    PlanOut, SubscriptionCreate, SubscriptionUpdate, SubscriptionOut,
    RevenueStatsOut, RevenuePlanBreakdown,
)
from schemas.subscription import (
    AdminPlanOut, PlanCreate, PlanUpdate, FeatureFlagUpdate,
    AdminSubscriptionOut, AdminSubscriptionPatch,
    PlanFeatureFlagOut, RevenueOut, GatewayConfigPatch,
)
from schemas.coupon import CouponCreate, CouponUpdate, CouponOut
from middleware.auth import require_super_admin
from services.auth_service import hash_password

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── Default system config keys ────────────────────────────────────────────────

_DEFAULT_CONFIG = {
    "signup_allowed": True,
    "2fa_required": False,
    "free_plan_board_limit": 1,
    "free_plan_member_limit": 3,
    "pro_plan_board_limit": 10,
    "pro_plan_member_limit": 25,
    "maintenance_mode": False,
    "support_email": "support@bugtrack.app",
}


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = [User.is_deleted == False]
    if search:
        like = f"%{search}%"
        conditions.append(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if role:
        conditions.append(User.role == role)
    if is_active is not None:
        conditions.append(User.is_active == is_active)

    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count()).select_from(User).where(*conditions))
    result = await db.execute(
        select(User).where(*conditions)
        .order_by(User.created_at.desc())
        .limit(per_page).offset(offset)
    )
    users = result.scalars().all()
    return {
        "data": [AdminUserOut.model_validate(u).model_dump() for u in users],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: AdminUserCreate,
    current_admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"data": AdminUserOut.model_validate(user).model_dump()}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    body: AdminUserUpdate,
    current_admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.id == user_id, User.is_deleted == False))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user_id == current_admin.id and body.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account")
    if user_id == current_admin.id and body.role and body.role != UserRole.super_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")

    changes = body.model_dump(exclude_none=True)
    if changes:
        # Fix 7: snapshot previous values before overwriting for the audit log
        before = {k: getattr(user, k, None) for k in changes}
        await db.execute(update(User).where(User.id == user_id).values(**changes))
        db.add(AdminAuditLog(
            admin_id=current_admin.id,
            action="update_user",
            target_type="User",
            target_id=user_id,
            detail_json=json.dumps({"before": {k: str(v) for k, v in before.items()},
                                    "after": {k: str(v) for k, v in changes.items()}}),
        ))
        await db.commit()
        await db.refresh(user)
    return {"data": AdminUserOut.model_validate(user).model_dump()}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: int,
    current_admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account")
    user = await db.scalar(select(User).where(User.id == user_id, User.is_deleted == False))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.execute(update(User).where(User.id == user_id).values(is_active=False))
    await db.commit()
    return {"data": {"message": "User deactivated."}}


# ── Boards ──────────────────────────────────────────────────────────────────────

@router.get("/boards")
async def list_boards(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Board.is_archived == False]
    if search:
        conditions.append(Board.name.ilike(f"%{search}%"))
    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count()).select_from(Board).where(*conditions))
    result = await db.execute(
        select(Board).where(*conditions)
        .order_by(Board.created_at.desc())
        .limit(per_page).offset(offset)
    )
    boards = result.scalars().all()

    data = []
    for b in boards:
        owner = await db.scalar(select(User).where(User.id == b.owner_id))
        data.append(AdminBoardOut(
            id=b.id,
            name=b.name,
            owner_id=b.owner_id,
            owner_name=owner.full_name if owner else None,
            member_limit=b.member_limit,
            is_archived=b.is_archived,
            created_at=b.created_at,
        ).model_dump())

    return {"data": data, "meta": {"page": page, "per_page": per_page, "total": total}}


@router.patch("/boards/{board_id}/member-limit")
async def update_member_limit(
    board_id: int,
    body: AdminBoardLimitUpdate,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    board = await db.scalar(select(Board).where(Board.id == board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")

    await db.execute(update(Board).where(Board.id == board_id).values(member_limit=body.member_limit))
    await db.commit()
    return {"data": {"id": board_id, "member_limit": body.member_limit}}


# ── Invites ─────────────────────────────────────────────────────────────────────

@router.get("/invites")
async def list_invites(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Invite.is_cancelled == False, Invite.accepted_at == None]
    if search:
        conditions.append(Invite.email.ilike(f"%{search}%"))
    if role:
        conditions.append(Invite.role == role)
    offset = (page - 1) * per_page
    total = await db.scalar(
        select(func.count()).select_from(Invite).where(*conditions)
    )
    result = await db.execute(
        select(Invite).where(*conditions)
        .order_by(Invite.created_at.desc())
        .limit(per_page).offset(offset)
    )
    invites = result.scalars().all()

    data = []
    for inv in invites:
        board_name = None
        if inv.board_id:
            board = await db.scalar(select(Board).where(Board.id == inv.board_id))
            board_name = board.name if board else None
        inviter = await db.scalar(select(User).where(User.id == inv.invited_by_id))
        data.append(AdminInviteOut(
            id=inv.id,
            email=inv.email,
            board_id=inv.board_id,
            board_name=board_name,
            invited_by_name=inviter.full_name if inviter else None,
            role=inv.role,
            expires_at=inv.expires_at,
            accepted_at=inv.accepted_at,
            is_cancelled=inv.is_cancelled,
            created_at=inv.created_at,
        ).model_dump())

    return {"data": data, "meta": {"page": page, "per_page": per_page, "total": total}}


@router.delete("/invites/{invite_id}")
async def cancel_invite(
    invite_id: int,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    invite = await db.scalar(select(Invite).where(Invite.id == invite_id))
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    await db.execute(update(Invite).where(Invite.id == invite_id).values(is_cancelled=True))
    await db.commit()
    return {"data": {"message": "Invite cancelled."}}


# ── Stats ────────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_deleted == False)
    )
    active_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_deleted == False, User.is_active == True)
    )
    total_boards = await db.scalar(
        select(func.count()).select_from(Board).where(Board.is_archived == False)
    )
    pending_invites = await db.scalar(
        select(func.count()).select_from(Invite)
        .where(Invite.is_cancelled == False, Invite.accepted_at == None)
    )

    return {
        "data": AdminStatsOut(
            total_users=total_users or 0,
            active_users=active_users or 0,
            total_boards=total_boards or 0,
            pending_invites=pending_invites or 0,
        ).model_dump()
    }


# ── System Settings ──────────────────────────────────────────────────────────

class SettingUpdate(BaseModel):
    updates: dict[str, Any]


@router.get("/settings")
async def get_settings(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemConfig))
    rows = {r.config_key: json.loads(r.config_value) for r in result.scalars().all()}
    # Fill in defaults for any missing keys
    merged = {**_DEFAULT_CONFIG, **rows}
    return {"data": merged}


# ── Plans (Phase 16e) ────────────────────────────────────────────────────────────

async def _plan_out(plan: Plan, db: AsyncSession) -> dict:
    flags_result = await db.execute(
        select(PlanFeatureFlag).where(PlanFeatureFlag.plan_id == plan.id)
    )
    flags = flags_result.scalars().all()
    return AdminPlanOut(
        id=plan.id,
        name=plan.name,
        display_name=plan.display_name,
        price_monthly=plan.price_monthly,
        price_yearly=plan.price_yearly,
        sort_order=plan.sort_order,
        is_highlighted=plan.is_highlighted,
        is_active=plan.is_active,
        stripe_price_id_monthly=plan.stripe_price_id_monthly,
        stripe_price_id_yearly=plan.stripe_price_id_yearly,
        razorpay_plan_id_monthly=plan.razorpay_plan_id_monthly,
        razorpay_plan_id_yearly=plan.razorpay_plan_id_yearly,
        feature_flags=[PlanFeatureFlagOut.model_validate(f) for f in flags],
    ).model_dump()


@router.get("/plans")
async def list_plans(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return ALL plans (active and inactive) for admin plan management."""
    result = await db.execute(select(Plan).order_by(Plan.sort_order, Plan.price_monthly))
    plans = result.scalars().all()
    return {"data": [await _plan_out(p, db) for p in plans]}


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: PlanCreate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(Plan).where(Plan.name == body.name))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan name already exists")

    plan = Plan(
        name=body.name,
        display_name=body.display_name,
        price_monthly=body.price_monthly,
        price_yearly=body.price_yearly,
        sort_order=body.sort_order,
        is_highlighted=body.is_highlighted,
        is_active=False,   # starts as draft
        stripe_price_id_monthly=body.stripe_price_id_monthly,
        stripe_price_id_yearly=body.stripe_price_id_yearly,
        razorpay_plan_id_monthly=body.razorpay_plan_id_monthly,
        razorpay_plan_id_yearly=body.razorpay_plan_id_yearly,
    )
    db.add(plan)
    await db.flush()

    db.add(AdminAuditLog(
        admin_id=admin.id, action="create_plan", target_type="Plan", target_id=plan.id,
        detail_json=json.dumps({"name": plan.name}),
    ))
    await db.commit()
    await db.refresh(plan)
    return {"data": await _plan_out(plan, db)}


@router.patch("/plans/{plan_id}")
async def update_plan(
    plan_id: int,
    body: PlanUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    changes = body.model_dump(exclude_none=True)
    flag_updates = changes.pop("feature_flags", None)

    if changes:
        before = {k: str(getattr(plan, k, None)) for k in changes}
        await db.execute(update(Plan).where(Plan.id == plan_id).values(**changes))
        db.add(AdminAuditLog(
            admin_id=admin.id, action="update_plan", target_type="Plan", target_id=plan_id,
            detail_json=json.dumps({"before": before, "after": {k: str(v) for k, v in changes.items()}}),
        ))

    if flag_updates:
        for flag_data in flag_updates:
            existing = await db.scalar(
                select(PlanFeatureFlag).where(
                    PlanFeatureFlag.plan_id == plan_id,
                    PlanFeatureFlag.feature_key == flag_data["feature_key"],
                )
            )
            if existing:
                existing.is_enabled = flag_data["is_enabled"]
                existing.limit_value = flag_data.get("limit_value")
            else:
                db.add(PlanFeatureFlag(
                    plan_id=plan_id,
                    feature_key=flag_data["feature_key"],
                    is_enabled=flag_data["is_enabled"],
                    limit_value=flag_data.get("limit_value"),
                ))

    if changes or flag_updates:
        await db.commit()
        await db.refresh(plan)

    return {"data": await _plan_out(plan, db)}


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    subscribers = await db.scalar(
        select(func.count()).select_from(Subscription).where(Subscription.plan_id == plan_id)
    ) or 0
    if subscribers > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete plan with {subscribers} active subscriber(s)",
        )

    db.add(AdminAuditLog(
        admin_id=admin.id, action="delete_plan", target_type="Plan", target_id=plan_id,
        detail_json=json.dumps({"name": plan.name}),
    ))
    await db.delete(plan)
    await db.commit()


@router.post("/plans/{plan_id}/publish")
async def publish_plan(
    plan_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    await db.execute(update(Plan).where(Plan.id == plan_id).values(is_active=True))
    db.add(AdminAuditLog(
        admin_id=admin.id, action="publish_plan", target_type="Plan", target_id=plan_id,
        detail_json=json.dumps({"name": plan.name}),
    ))
    await db.commit()
    await db.refresh(plan)
    return {"data": await _plan_out(plan, db)}


@router.post("/plans/{plan_id}/unpublish")
async def unpublish_plan(
    plan_id: int,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    await db.execute(update(Plan).where(Plan.id == plan_id).values(is_active=False))
    db.add(AdminAuditLog(
        admin_id=admin.id, action="unpublish_plan", target_type="Plan", target_id=plan_id,
        detail_json=json.dumps({"name": plan.name}),
    ))
    await db.commit()
    await db.refresh(plan)
    return {"data": await _plan_out(plan, db)}


# ── Revenue ───────────────────────────────────────────────────────────────────────

# Phase 16e: /admin/revenue — metrics from Phase 16 Subscription model
@router.get("/revenue")
async def get_revenue_phase16(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase 16 revenue metrics based on the Subscription model."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        month_end = now.replace(year=now.year + 1, month=1, day=1)
    else:
        month_end = now.replace(month=now.month + 1, day=1)

    active_subscribers = await db.scalar(
        select(func.count()).select_from(Subscription)
        .where(Subscription.status == SubscriptionStatus.active)
    ) or 0

    trialing = await db.scalar(
        select(func.count()).select_from(Subscription)
        .where(Subscription.status == SubscriptionStatus.trialing)
    ) or 0

    canceled_this_month = await db.scalar(
        select(func.count()).select_from(Subscription)
        .where(
            Subscription.status == SubscriptionStatus.canceled,
            Subscription.canceled_at >= month_start,
            Subscription.canceled_at < month_end,
        )
    ) or 0

    # MRR approximation: sum plan.price_monthly for all active subscriptions
    mrr_result = await db.execute(
        select(func.coalesce(func.sum(Plan.price_monthly), 0))
        .select_from(Subscription)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status.in_([SubscriptionStatus.active, SubscriptionStatus.trialing]))
    )
    mrr = float(mrr_result.scalar() or 0)
    arr = mrr * 12

    churn_rate = (
        round(canceled_this_month / (active_subscribers + canceled_this_month) * 100, 2)
        if (active_subscribers + canceled_this_month) > 0
        else 0.0
    )

    return {
        "data": RevenueOut(
            mrr=mrr,
            arr=arr,
            active_subscribers=active_subscribers,
            trialing=trialing,
            canceled_this_month=canceled_this_month,
            churn_rate=churn_rate,
        ).model_dump()
    }


# Legacy: /admin/revenue/stats — from UserSubscription (old admin revenue module)
@router.get("/revenue/stats")
async def get_revenue_stats(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    # Strip tz for naive DB datetimes
    now_naive = now.replace(tzinfo=None)
    month_start = now_naive.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now_naive.month == 12:
        month_end = now_naive.replace(year=now_naive.year + 1, month=1, day=1)
    else:
        month_end = now_naive.replace(month=now_naive.month + 1, day=1)

    total_revenue_row = await db.scalar(
        select(func.coalesce(func.sum(UserSubscription.amount_paid), 0))
    )
    total_revenue = float(total_revenue_row or 0)

    active_subscriptions = await db.scalar(
        select(func.count()).select_from(UserSubscription)
        .where(UserSubscription.is_active == True, UserSubscription.cancelled_at == None)
    ) or 0

    expiring_this_month = await db.scalar(
        select(func.count()).select_from(UserSubscription)
        .where(
            UserSubscription.is_active == True,
            UserSubscription.expires_at >= month_start,
            UserSubscription.expires_at < month_end,
        )
    ) or 0

    new_this_month = await db.scalar(
        select(func.count()).select_from(UserSubscription)
        .where(
            UserSubscription.created_at >= month_start,
            UserSubscription.created_at < month_end,
        )
    ) or 0

    # Users with no active subscription
    subscribed_user_ids_result = await db.execute(
        select(UserSubscription.user_id).where(
            UserSubscription.is_active == True,
            UserSubscription.cancelled_at == None,
        ).distinct()
    )
    subscribed_ids = {row[0] for row in subscribed_user_ids_result}
    total_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_deleted == False, User.is_active == True)
    ) or 0
    free_users = max(0, total_users - len(subscribed_ids))

    # Revenue by plan
    plans_result = await db.execute(select(Plan).where(Plan.is_active == True).order_by(Plan.price_monthly))
    plans = plans_result.scalars().all()

    revenue_by_plan = []
    for plan in plans:
        count = await db.scalar(
            select(func.count()).select_from(UserSubscription)
            .where(UserSubscription.plan_id == plan.id, UserSubscription.is_active == True)
        ) or 0
        rev = await db.scalar(
            select(func.coalesce(func.sum(UserSubscription.amount_paid), 0))
            .where(UserSubscription.plan_id == plan.id)
        ) or 0
        revenue_by_plan.append(RevenuePlanBreakdown(
            plan_id=plan.id,
            plan_name=plan.name,
            plan_display_name=plan.display_name,
            subscriber_count=count,
            total_revenue=float(rev),
        ))

    return {
        "data": RevenueStatsOut(
            total_revenue=total_revenue,
            active_subscriptions=active_subscriptions,
            expiring_this_month=expiring_this_month,
            new_this_month=new_this_month,
            free_users=free_users,
            revenue_by_plan=revenue_by_plan,
        ).model_dump()
    }


# ── Subscriptions (Phase 16e) — Subscription model ────────────────────────────

async def _admin_sub_out(sub: Subscription, db: AsyncSession) -> dict:
    user = await db.get(User, sub.user_id)
    plan = await db.get(Plan, sub.plan_id)
    return AdminSubscriptionOut(
        id=sub.id,
        user_id=sub.user_id,
        user_email=user.email if user else "",
        user_name=user.full_name if user else "",
        plan_id=sub.plan_id,
        plan_name=plan.name if plan else "",
        plan_display_name=plan.display_name if plan else "",
        status=sub.status.value,
        gateway=sub.gateway.value,
        gateway_subscription_id=sub.gateway_subscription_id,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        trial_end=sub.trial_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        canceled_at=sub.canceled_at,
        grace_period_ends_at=sub.grace_period_ends_at,
        created_at=sub.created_at,
    ).model_dump()


@router.get("/subscriptions")
async def list_subscriptions_phase16(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    plan_id: Optional[int] = Query(None),
    gateway: Optional[str] = Query(None),
    sub_status: Optional[str] = Query(None, alias="status"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phase 16 subscriptions — from the Subscription model (gateway-managed)."""
    conditions = []
    if plan_id:
        conditions.append(Subscription.plan_id == plan_id)
    if gateway:
        conditions.append(Subscription.gateway == gateway)
    if sub_status:
        conditions.append(Subscription.status == sub_status)

    q = select(Subscription).join(User, User.id == Subscription.user_id)
    count_q = (
        select(func.count()).select_from(Subscription)
        .join(User, User.id == Subscription.user_id)
    )
    if search:
        like = f"%{search}%"
        s_cond = or_(User.email.ilike(like), User.full_name.ilike(like))
        q = q.where(s_cond, *conditions)
        count_q = count_q.where(s_cond, *conditions)
    else:
        q = q.where(*conditions)
        count_q = count_q.where(*conditions)

    total = await db.scalar(count_q) or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        q.order_by(Subscription.created_at.desc()).limit(per_page).offset(offset)
    )
    subs = result.scalars().all()

    return {
        "data": [await _admin_sub_out(s, db) for s in subs],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }


@router.patch("/subscriptions/{sub_id}")
async def override_subscription_plan(
    sub_id: int,
    body: AdminSubscriptionPatch,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Manual plan override — bypasses gateway, direct DB update only. Writes AdminAuditLog."""
    sub = await db.get(Subscription, sub_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    plan = await db.get(Plan, body.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    old_plan_id = sub.plan_id
    sub.plan_id = body.plan_id

    db.add(AdminAuditLog(
        admin_id=admin.id,
        action="override_subscription_plan",
        target_type="Subscription",
        target_id=sub_id,
        detail_json=json.dumps({
            "user_id": sub.user_id,
            "old_plan_id": old_plan_id,
            "new_plan_id": body.plan_id,
            "note": "manual admin override",
        }),
    ))
    await db.commit()
    return {"data": await _admin_sub_out(sub, db)}


# ── Coupons (Phase 16e) ────────────────────────────────────────────────────────

@router.get("/coupons")
async def list_coupons(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    total = await db.scalar(select(func.count()).select_from(Coupon)) or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Coupon).order_by(Coupon.created_at.desc()).limit(per_page).offset(offset)
    )
    coupons = result.scalars().all()
    return {
        "data": [CouponOut.model_validate(c).model_dump() for c in coupons],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }


@router.post("/coupons", status_code=status.HTTP_201_CREATED)
async def create_coupon(
    body: CouponCreate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(Coupon).where(Coupon.code == body.code))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Coupon code already exists")

    coupon = Coupon(
        code=body.code,
        description=body.description,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        max_uses=body.max_uses,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        applies_to_plan=body.applies_to_plan,
        is_active=body.is_active,
    )
    db.add(coupon)
    db.add(AdminAuditLog(
        admin_id=admin.id, action="create_coupon", target_type="Coupon",
        detail_json=json.dumps({"code": body.code}),
    ))
    await db.commit()
    await db.refresh(coupon)
    return {"data": CouponOut.model_validate(coupon).model_dump()}


@router.patch("/coupons/{coupon_id}")
async def update_coupon(
    coupon_id: int,
    body: CouponUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    coupon = await db.get(Coupon, coupon_id)
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")

    changes = body.model_dump(exclude_none=True)
    if changes:
        for k, v in changes.items():
            setattr(coupon, k, v)
        db.add(AdminAuditLog(
            admin_id=admin.id, action="update_coupon", target_type="Coupon", target_id=coupon_id,
            detail_json=json.dumps({"code": coupon.code, "changes": {k: str(v) for k, v in changes.items()}}),
        ))
        await db.commit()
        await db.refresh(coupon)

    return {"data": CouponOut.model_validate(coupon).model_dump()}


# ── Gateway config (Phase 16e) ─────────────────────────────────────────────────

_GW_KEYS = [
    "billing.stripe.secret_key",
    "billing.stripe.publishable_key",
    "billing.stripe.webhook_secret",
    "billing.razorpay.key_id",
    "billing.razorpay.key_secret",
    "billing.razorpay.webhook_secret",
    "billing.gateway.default",
    "billing.gateway.india",
]


def _mask(value: Optional[str]) -> Optional[str]:
    """Return last 4 chars prefixed with asterisks, or None."""
    if not value:
        return None
    return "****" + value[-4:] if len(value) > 4 else "****"


@router.get("/gateway-config")
async def get_gateway_config(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return masked gateway configuration — secret values show last 4 chars only."""
    from services.encryption import fernet_decrypt
    from cryptography.fernet import InvalidToken

    rows = {}
    for key in _GW_KEYS:
        row = await db.scalar(select(SystemConfig).where(SystemConfig.config_key == key))
        if row:
            try:
                rows[key] = fernet_decrypt(json.loads(row.config_value))
            except (InvalidToken, Exception):
                rows[key] = json.loads(row.config_value)

    return {
        "data": {
            "stripe": {
                "secret_key_last4": _mask(rows.get("billing.stripe.secret_key")),
                "publishable_key_last4": _mask(rows.get("billing.stripe.publishable_key")),
                "webhook_secret_set": bool(rows.get("billing.stripe.webhook_secret")),
            },
            "razorpay": {
                "key_id_last4": _mask(rows.get("billing.razorpay.key_id")),
                "key_secret_last4": _mask(rows.get("billing.razorpay.key_secret")),
                "webhook_secret_set": bool(rows.get("billing.razorpay.webhook_secret")),
            },
            "routing": {
                "default": rows.get("billing.gateway.default", "stripe"),
                "india": rows.get("billing.gateway.india", "razorpay"),
            },
        }
    }


@router.patch("/gateway-config")
async def update_gateway_config(
    body: GatewayConfigPatch,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Store gateway keys encrypted in SystemConfig. Audit logged."""
    from services.encryption import fernet_encrypt

    field_to_key = {
        "stripe_secret_key":      "billing.stripe.secret_key",
        "stripe_publishable_key": "billing.stripe.publishable_key",
        "stripe_webhook_secret":  "billing.stripe.webhook_secret",
        "razorpay_key_id":        "billing.razorpay.key_id",
        "razorpay_key_secret":    "billing.razorpay.key_secret",
        "razorpay_webhook_secret":"billing.razorpay.webhook_secret",
        "gateway_default":        "billing.gateway.default",
        "gateway_india":          "billing.gateway.india",
    }

    updates = body.model_dump(exclude_none=True)
    changed = []
    for field, config_key in field_to_key.items():
        value = updates.get(field)
        if value is None:
            continue
        # Encrypt secret-looking keys; routing values stored plain
        store_value = (
            json.dumps(fernet_encrypt(value))
            if "secret" in config_key or "key" in config_key
            else json.dumps(value)
        )
        existing = await db.scalar(select(SystemConfig).where(SystemConfig.config_key == config_key))
        if existing:
            await db.execute(
                update(SystemConfig)
                .where(SystemConfig.config_key == config_key)
                .values(config_value=store_value, updated_by_id=admin.id)
            )
        else:
            db.add(SystemConfig(config_key=config_key, config_value=store_value, updated_by_id=admin.id))
        changed.append(config_key)

    if changed:
        db.add(AdminAuditLog(
            admin_id=admin.id,
            action="update_gateway_config",
            target_type="SystemConfig",
            detail_json=json.dumps({"updated_keys": changed}),
        ))
        await db.commit()

    return {"data": {"message": f"Updated {len(changed)} gateway config key(s)."}}


# ── System Settings ──────────────────────────────────────────────────────────
@router.patch("/settings")
async def update_settings(
    body: SettingUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    for key, value in body.updates.items():
        if key not in _DEFAULT_CONFIG:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown config key: {key}")

        encoded = json.dumps(value)
        existing = await db.scalar(select(SystemConfig).where(SystemConfig.config_key == key))
        if existing:
            old_value = existing.config_value
            await db.execute(
                update(SystemConfig)
                .where(SystemConfig.config_key == key)
                .values(config_value=encoded, updated_by_id=admin.id)
            )
        else:
            old_value = "null"
            db.add(SystemConfig(config_key=key, config_value=encoded, updated_by_id=admin.id))

        # Audit log
        db.add(AdminAuditLog(
            admin_id=admin.id,
            action="update_system_config",
            target_type="SystemConfig",
            detail_json=json.dumps({"key": key, "old": json.loads(old_value), "new": value}),
        ))

    await db.commit()
    return {"data": {"message": f"Updated {len(body.updates)} setting(s)."}}
