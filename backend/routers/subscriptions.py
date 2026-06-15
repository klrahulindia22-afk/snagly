"""Phase 16d — User-facing subscription API endpoints.

Security rules (CLAUDE.md §13):
- Never return gateway secret keys, webhook secrets, or full card numbers.
- Only owner/team/super_admin roles may modify subscriptions (client role → 403).
- All datetime in UTC.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth import get_current_user
from models.board import Board
from models.board_membership import BoardMembership
from models.plan import Plan, PlanFeatureFlag
from models.subscription import Invoice, PaymentMethod, Subscription
from models.user import User, UserRole
from schemas.subscription import (
    AdminSubscriptionOut,
    ApplyCouponRequest,
    CancelRequest,
    CheckoutRequest,
    CouponValidateRequest,
    CouponValidateOut,
    DowngradeRequest,
    InvoiceOut,
    PaymentMethodOut,
    PlanFeatureFlagOut,
    PlanPublicOut,
    SubscriptionMeOut,
    SubscriptionOut,
    SwitchCycleRequest,
    UpgradeRequest,
    UsageOut,
)
from services import subscription_service
from services.razorpay_service import RazorpayServiceError

router = APIRouter(tags=["subscriptions"])


# ─── Guards ───────────────────────────────────────────────────────────────────

def _deny_client(user: User) -> None:
    """Raise 403 if the user is a client-role account."""
    if user.role == UserRole.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client accounts cannot manage subscriptions. Contact your workspace owner.",
        )


# ─── Plans (public) ───────────────────────────────────────────────────────────

@router.get("/api/v1/plans")
async def list_plans(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns all active plans with their feature flags. Cached 60 s."""
    response.headers["Cache-Control"] = "public, max-age=60"

    result = await db.execute(
        select(Plan)
        .where(Plan.is_active == True)
        .order_by(Plan.sort_order, Plan.price_monthly)
    )
    plans = result.scalars().all()

    out = []
    for plan in plans:
        flags_result = await db.execute(
            select(PlanFeatureFlag).where(PlanFeatureFlag.plan_id == plan.id)
        )
        flags = flags_result.scalars().all()
        out.append(
            PlanPublicOut(
                id=plan.id,
                name=plan.name,
                display_name=plan.display_name,
                price_monthly=plan.price_monthly,
                price_yearly=plan.price_yearly,
                sort_order=plan.sort_order,
                is_highlighted=plan.is_highlighted,
                is_active=plan.is_active,
                feature_flags=[PlanFeatureFlagOut.model_validate(f) for f in flags],
            ).model_dump()
        )

    return {"data": out}


# ─── Subscription /me ─────────────────────────────────────────────────────────

@router.get("/api/v1/subscriptions/me")
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's subscription, plan, and usage statistics."""
    # 1. Subscription (Phase 16 model)
    sub = await db.scalar(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )

    # 2. Plan — either from subscription or free-tier fallback
    if sub:
        plan = await db.get(Plan, sub.plan_id)
    else:
        plan = await db.scalar(select(Plan).where(Plan.name == "free"))

    if plan is None:
        # Absolute fallback — no seed data
        raise HTTPException(status_code=500, detail="Billing not configured: no plans found")

    # 3. Feature flags for this plan
    flags_result = await db.execute(
        select(PlanFeatureFlag).where(PlanFeatureFlag.plan_id == plan.id)
    )
    flags = flags_result.scalars().all()
    flag_map = {f.feature_key: f for f in flags}

    # 4. Usage — boards
    boards_used = await db.scalar(
        select(func.count()).select_from(Board)
        .where(Board.owner_id == current_user.id, Board.is_archived == False)
    ) or 0

    boards_limit_flag = flag_map.get("max_boards")
    boards_limit = boards_limit_flag.limit_value if boards_limit_flag else 1

    # 5. Usage — members (max on any single board the user owns)
    board_ids_result = await db.execute(
        select(Board.id).where(
            Board.owner_id == current_user.id, Board.is_archived == False
        )
    )
    board_ids = [row[0] for row in board_ids_result.all()]

    members_max_any_board = 0
    for bid in board_ids:
        count = await db.scalar(
            select(func.count()).select_from(BoardMembership)
            .where(BoardMembership.board_id == bid)
        ) or 0
        if count > members_max_any_board:
            members_max_any_board = count

    members_limit_flag = flag_map.get("max_members_per_board")
    members_limit = members_limit_flag.limit_value if members_limit_flag else 3

    # 6. Usage — storage
    storage_used_bytes = current_user.storage_used_bytes or 0
    storage_gb_flag = flag_map.get("storage_gb")
    storage_gb = storage_gb_flag.limit_value if storage_gb_flag else 0
    storage_limit_bytes = (storage_gb * 1024 * 1024 * 1024) if storage_gb else None
    storage_used_pct = (
        round(storage_used_bytes / storage_limit_bytes * 100, 2)
        if storage_limit_bytes
        else 0.0
    )

    return {
        "data": {
            "subscription": SubscriptionOut.model_validate(sub).model_dump() if sub else None,
            "plan": PlanPublicOut(
                id=plan.id,
                name=plan.name,
                display_name=plan.display_name,
                price_monthly=plan.price_monthly,
                price_yearly=plan.price_yearly,
                sort_order=plan.sort_order,
                is_highlighted=plan.is_highlighted,
                is_active=plan.is_active,
                feature_flags=[PlanFeatureFlagOut.model_validate(f) for f in flags],
            ).model_dump(),
            "usage": UsageOut(
                boards_used=boards_used,
                boards_limit=boards_limit,
                members_max_any_board=members_max_any_board,
                members_limit=members_limit,
                storage_used_bytes=storage_used_bytes,
                storage_limit_bytes=storage_limit_bytes,
                storage_used_pct=storage_used_pct,
            ).model_dump(),
        }
    }


# ─── Checkout ─────────────────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        result = await subscription_service.checkout(
            user=current_user,
            plan_id=body.plan_id,
            billing_cycle=body.billing_cycle,
            db=db,
            trial_days=body.trial_days,
            coupon_code=body.coupon_code,
        )
        return {"data": result}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RazorpayServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Payment gateway error: {exc}")


# ─── Validate coupon (pre-checkout check) ────────────────────────────────────

@router.post("/api/v1/subscriptions/validate-coupon")
async def validate_coupon(
    body: CouponValidateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check a coupon code is valid for a given plan before opening checkout.
    Returns discount details on success; 400/404 with reason on failure.
    """
    _deny_client(current_user)
    try:
        coupon = await subscription_service._validate_coupon_for_checkout(
            code=body.code, plan_id=body.plan_id, user_id=current_user.id, db=db
        )
        return {
            "data": CouponValidateOut(
                code=coupon.code,
                discount_type=coupon.discount_type,
                discount_value=str(coupon.discount_value),
                description=coupon.description,
            ).model_dump()
        }
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ─── Upgrade ──────────────────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/upgrade")
async def upgrade(
    body: UpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        result = await subscription_service.upgrade(
            user=current_user, new_plan_id=body.plan_id, db=db
        )
        # Razorpay returns a checkout dict; Stripe returns the updated Subscription ORM
        if isinstance(result, dict):
            return {"data": result}
        return {"data": SubscriptionOut.model_validate(result).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Payment gateway error: {exc}")


# ─── Downgrade ────────────────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/downgrade")
async def downgrade(
    body: DowngradeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        sub = await subscription_service.downgrade(
            user=current_user, new_plan_id=body.plan_id, db=db
        )
        return {"data": SubscriptionOut.model_validate(sub).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ─── Cancel ───────────────────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/cancel")
async def cancel_subscription(
    body: CancelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        sub = await subscription_service.cancel(
            user=current_user, reason=body.reason, db=db
        )
        return {"data": SubscriptionOut.model_validate(sub).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ─── Reactivate ───────────────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/reactivate")
async def reactivate_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        sub = await subscription_service.reactivate(user=current_user, db=db)
        return {"data": SubscriptionOut.model_validate(sub).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ─── Switch billing cycle ─────────────────────────────────────────────────────

@router.post("/api/v1/subscriptions/switch-cycle")
async def switch_cycle(
    body: SwitchCycleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        sub = await subscription_service.switch_cycle(
            user=current_user, billing_cycle=body.billing_cycle, db=db
        )
        return {"data": SubscriptionOut.model_validate(sub).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ─── Apply coupon ─────────────────────────────────────────────────────────────

_COUPON_ERROR_CODES = {
    "Coupon not found": status.HTTP_404_NOT_FOUND,
    "Coupon has reached its maximum number of uses": status.HTTP_409_CONFLICT,
    "You have already used this coupon": status.HTTP_409_CONFLICT,
}


@router.post("/api/v1/subscriptions/apply-coupon")
async def apply_coupon(
    body: ApplyCouponRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _deny_client(current_user)
    try:
        coupon = await subscription_service.apply_coupon(
            user=current_user, code=body.code, db=db
        )
        return {"data": {"code": coupon.code, "discount_type": coupon.discount_type,
                         "discount_value": str(coupon.discount_value)}}
    except ValueError as exc:
        msg = str(exc)
        http_code = _COUPON_ERROR_CODES.get(msg, status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=http_code, detail=msg)


# ─── Invoices ─────────────────────────────────────────────────────────────────

@router.get("/api/v1/invoices")
async def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * per_page
    total = await db.scalar(
        select(func.count()).select_from(Invoice)
        .where(Invoice.user_id == current_user.id)
    ) or 0
    result = await db.execute(
        select(Invoice)
        .where(Invoice.user_id == current_user.id)
        .order_by(Invoice.created_at.desc())
        .limit(per_page).offset(offset)
    )
    invoices = result.scalars().all()
    return {
        "data": [InvoiceOut.model_validate(inv).model_dump() for inv in invoices],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }


@router.get("/api/v1/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invoice = await db.scalar(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
    )
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    if invoice.invoice_pdf_url:
        return RedirectResponse(url=invoice.invoice_pdf_url)

    # If no cached URL, fetch from Stripe gateway
    if invoice.gateway.value == "stripe":
        from services.stripe_service import get_invoice_pdf_url
        url = await get_invoice_pdf_url(invoice.gateway_invoice_id)
        if url:
            invoice.invoice_pdf_url = url
            await db.commit()
            return RedirectResponse(url=url)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not available")


# ─── Payment methods ──────────────────────────────────────────────────────────

@router.get("/api/v1/payment-methods/me")
async def list_payment_methods(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentMethod)
        .where(PaymentMethod.user_id == current_user.id)
        .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc())
    )
    methods = result.scalars().all()
    return {"data": [PaymentMethodOut.model_validate(m).model_dump() for m in methods]}


@router.delete("/api/v1/payment-methods/{method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    method_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    method = await db.scalar(
        select(PaymentMethod).where(
            PaymentMethod.id == method_id,
            PaymentMethod.user_id == current_user.id,
        )
    )
    if method is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment method not found")
    if method.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default payment method. Set another as default first.",
        )
    await db.delete(method)
    await db.commit()
