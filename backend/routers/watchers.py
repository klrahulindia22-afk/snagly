from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from database import get_db
from models.user import User
from models.card import Card
from models.card_watcher import CardWatcher
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/cards", tags=["watchers"])


async def _get_card_member(card_id: int, current_user: User, db: AsyncSession):
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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return card


@router.post("/{card_id}/watch", status_code=status.HTTP_201_CREATED)
async def watch_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_member(card_id, current_user, db)
    existing = await db.scalar(
        select(CardWatcher).where(
            CardWatcher.card_id == card_id, CardWatcher.user_id == current_user.id
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already watching")
    db.add(CardWatcher(card_id=card_id, user_id=current_user.id))
    await db.commit()
    return {"data": {"message": "Watching.", "is_watching": True}}


@router.delete("/{card_id}/watch")
async def unwatch_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_member(card_id, current_user, db)
    await db.execute(
        delete(CardWatcher).where(
            CardWatcher.card_id == card_id, CardWatcher.user_id == current_user.id
        )
    )
    await db.commit()
    return {"data": {"message": "Unwatched.", "is_watching": False}}


@router.get("/{card_id}/watchers")
async def get_card_watchers(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_member(card_id, current_user, db)
    result = await db.execute(
        select(CardWatcher, User)
        .join(User, CardWatcher.user_id == User.id)
        .where(CardWatcher.card_id == card_id)
        .order_by(CardWatcher.created_at)
    )
    watchers = [
        {
            "user_id": u.id,
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "initials_color": u.initials_color,
        }
        for _, u in result.all()
    ]
    return {"data": watchers}
