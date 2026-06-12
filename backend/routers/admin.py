import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Any
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.invite import Invite
from models.system_config import SystemConfig
from models.admin_audit_log import AdminAuditLog
from schemas.admin import (
    AdminUserCreate, AdminUserUpdate, AdminBoardLimitUpdate,
    AdminUserOut, AdminBoardOut, AdminInviteOut, AdminStatsOut,
)
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
    per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count()).select_from(User).where(User.is_deleted == False))
    result = await db.execute(
        select(User)
        .where(User.is_deleted == False)
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
        await db.execute(update(User).where(User.id == user_id).values(**changes))
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
    per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count()).select_from(Board).where(Board.is_archived == False))
    result = await db.execute(
        select(Board).where(Board.is_archived == False)
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
    per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * per_page
    total = await db.scalar(
        select(func.count()).select_from(Invite)
        .where(Invite.is_cancelled == False, Invite.accepted_at == None)
    )
    result = await db.execute(
        select(Invite)
        .where(Invite.is_cancelled == False, Invite.accepted_at == None)
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
