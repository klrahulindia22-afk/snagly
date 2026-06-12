from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from database import get_db
from models.user import User
from models.card import Card
from models.time_entry import TimeEntry
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/cards/{card_id}/time-entries", tags=["time-tracking"])
time_entry_router = APIRouter(prefix="/api/v1/time-entries", tags=["time-tracking"])


class TimeEntryCreate(BaseModel):
    duration_minutes: int
    note: Optional[str] = None
    logged_at: Optional[datetime] = None


async def _require_card_member(card_id: int, current_user: User, db: AsyncSession):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id, BoardMembership.user_id == current_user.id
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return card


def _entry_out(e: TimeEntry) -> dict:
    return {
        "id": e.id,
        "card_id": e.card_id,
        "user_id": e.user_id,
        "duration_minutes": e.duration_minutes,
        "note": e.note,
        "logged_at": e.logged_at.isoformat() if e.logged_at else None,
        "user_name": e.user.full_name if e.user else None,
        "user_initials_color": e.user.initials_color if e.user else None,
    }


@router.get("")
async def list_time_entries(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_card_member(card_id, current_user, db)
    from models.user import User as UserModel
    result = await db.execute(
        select(TimeEntry, UserModel)
        .join(UserModel, TimeEntry.user_id == UserModel.id)
        .where(TimeEntry.card_id == card_id)
        .order_by(TimeEntry.logged_at.desc())
    )
    entries = []
    for te, u in result.all():
        entries.append({
            "id": te.id,
            "card_id": te.card_id,
            "user_id": te.user_id,
            "duration_minutes": te.duration_minutes,
            "note": te.note,
            "logged_at": te.logged_at.isoformat() if te.logged_at else None,
            "user_name": u.full_name,
            "user_initials_color": u.initials_color,
        })
    return {"data": entries}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    card_id: int,
    body: TimeEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.duration_minutes <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "duration_minutes must be positive")
    await _require_card_member(card_id, current_user, db)
    entry = TimeEntry(
        card_id=card_id,
        user_id=current_user.id,
        duration_minutes=body.duration_minutes,
        note=body.note,
        logged_at=body.logged_at or datetime.now(timezone.utc),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {"data": {
        "id": entry.id, "card_id": entry.card_id, "user_id": entry.user_id,
        "duration_minutes": entry.duration_minutes, "note": entry.note,
        "logged_at": entry.logged_at.isoformat() if entry.logged_at else None,
    }}


@time_entry_router.delete("/{entry_id}")
async def delete_time_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.scalar(select(TimeEntry).where(TimeEntry.id == entry_id))
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time entry not found")
    if entry.user_id != current_user.id and current_user.role.value not in ("owner", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot delete another user's time entry")
    await db.execute(delete(TimeEntry).where(TimeEntry.id == entry_id))
    await db.commit()
    return {"data": {"message": "Time entry deleted."}}
