from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.board_membership import BoardMembership
from models.sla_rule import SLARule, SeverityLevel
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/boards/{board_id}/sla-rules", tags=["sla"])


class SLARuleCreate(BaseModel):
    severity: SeverityLevel
    hours_to_resolve: int = Field(..., ge=1, le=8760)  # max 1 year


class SLARuleUpdate(BaseModel):
    hours_to_resolve: int = Field(..., ge=1, le=8760)


class SLARuleOut(BaseModel):
    id: int
    board_id: int
    severity: str
    hours_to_resolve: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


async def _require_member(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(select(Board).where(Board.id == board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return board, m


async def _require_owner(board_id: int, current_user: User, db: AsyncSession):
    board, m = await _require_member(board_id, current_user, db)
    if m.role.value not in ("owner",) and current_user.role != UserRole.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only board owners can manage SLA rules")
    return board, m


@router.get("")
async def list_sla_rules(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    result = await db.execute(select(SLARule).where(SLARule.board_id == board_id).order_by(SLARule.severity))
    rules = result.scalars().all()
    return {"data": [SLARuleOut.model_validate(r).model_dump() for r in rules]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_sla_rule(
    board_id: int,
    body: SLARuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)

    # Upsert: if a rule for this severity already exists, update it
    existing = await db.scalar(
        select(SLARule).where(SLARule.board_id == board_id, SLARule.severity == body.severity)
    )
    if existing:
        await db.execute(
            update(SLARule)
            .where(SLARule.id == existing.id)
            .values(hours_to_resolve=body.hours_to_resolve, updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        await db.refresh(existing)
        return {"data": SLARuleOut.model_validate(existing).model_dump()}

    rule = SLARule(board_id=board_id, severity=body.severity, hours_to_resolve=body.hours_to_resolve)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"data": SLARuleOut.model_validate(rule).model_dump()}


@router.patch("/{rule_id}")
async def update_sla_rule(
    board_id: int,
    rule_id: int,
    body: SLARuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)
    rule = await db.scalar(select(SLARule).where(SLARule.id == rule_id, SLARule.board_id == board_id))
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SLA rule not found")
    await db.execute(
        update(SLARule)
        .where(SLARule.id == rule_id)
        .values(hours_to_resolve=body.hours_to_resolve, updated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    await db.refresh(rule)
    return {"data": SLARuleOut.model_validate(rule).model_dump()}


@router.delete("/{rule_id}")
async def delete_sla_rule(
    board_id: int,
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)
    rule = await db.scalar(select(SLARule).where(SLARule.id == rule_id, SLARule.board_id == board_id))
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SLA rule not found")
    await db.execute(delete(SLARule).where(SLARule.id == rule_id))
    await db.commit()
    return {"data": {"message": "SLA rule deleted."}}
