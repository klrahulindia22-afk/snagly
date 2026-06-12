from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.user import User
from models.card import Card
from models.activity_log import ActivityLog
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

card_activity_router = APIRouter(prefix="/api/v1/cards/{card_id}/activity", tags=["activity"])


@card_activity_router.get("")
async def get_card_activity(
    card_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    offset = (page - 1) * per_page
    result = await db.execute(
        select(ActivityLog, User)
        .join(User, ActivityLog.user_id == User.id)
        .where(ActivityLog.card_id == card_id)
        .order_by(ActivityLog.created_at.desc())
        .offset(offset).limit(per_page)
    )
    rows = result.all()
    data = [
        {
            "id": log.id, "board_id": log.board_id, "card_id": log.card_id,
            "user_id": log.user_id, "action": log.action,
            "detail_json": log.detail_json, "created_at": log.created_at,
            "user_full_name": user.full_name,
            "user_initials_color": user.initials_color,
        }
        for log, user in rows
    ]
    return {"data": data, "meta": {"page": page, "per_page": per_page}}
