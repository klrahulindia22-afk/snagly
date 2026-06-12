from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models.user import User
from models.board import Board
from models.board_membership import BoardMembership
from models.card import Card
from models.list_ import List
from middleware.auth import get_current_user
from routers.cards import _build_card_face

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("")
async def search_cards(
    q: str = Query(..., min_length=1, max_length=200),
    board_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if board_id:
        m = await db.scalar(
            select(BoardMembership).where(
                BoardMembership.board_id == board_id,
                BoardMembership.user_id == current_user.id,
            )
        )
        if not m:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
        board_ids = [board_id]
    else:
        result = await db.execute(
            select(BoardMembership.board_id).where(
                BoardMembership.user_id == current_user.id
            )
        )
        board_ids = [row[0] for row in result.all()]

    if not board_ids:
        return {"data": [], "meta": {"total": 0}}

    search_term = f"%{q}%"
    result = await db.execute(
        select(Card)
        .where(
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == False,
            or_(
                Card.title.like(search_term),
                Card.description.like(search_term),
            ),
        )
        .order_by(Card.board_id, Card.list_id, Card.position)
        .limit(50)
    )
    cards = result.scalars().all()

    board_cache = {}
    list_cache = {}
    data = []
    for card in cards:
        if card.board_id not in board_cache:
            board_cache[card.board_id] = await db.scalar(
                select(Board).where(Board.id == card.board_id)
            )
        if card.list_id not in list_cache:
            list_cache[card.list_id] = await db.scalar(
                select(List).where(List.id == card.list_id)
            )
        face = await _build_card_face(card, db)
        b = board_cache[card.board_id]
        lst = list_cache.get(card.list_id)
        face["board_name"] = b.name if b else None
        face["list_name"] = lst.name if lst else None
        data.append(face)

    return {"data": data, "meta": {"total": len(data)}}
