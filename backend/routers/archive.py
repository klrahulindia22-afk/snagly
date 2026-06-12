from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.user import User
from models.board import Board
from models.board_membership import BoardMembership
from models.card import Card
from models.list_ import List
from middleware.auth import get_current_user
from routers.cards import _build_card_face
from routers.lists import _list_out

router = APIRouter(prefix="/api/v1/boards/{board_id}/archive", tags=["archive"])


async def _require_member(board_id: int, user: User, db: AsyncSession):
    board = await db.scalar(
        select(Board).where(Board.id == board_id, Board.is_archived == False)
    )
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


@router.get("")
async def get_board_archive(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)

    cards_result = await db.execute(
        select(Card)
        .where(
            Card.board_id == board_id,
            Card.is_archived == True,
            Card.is_deleted == False,
        )
        .order_by(Card.archived_at.desc())
    )
    archived_cards = cards_result.scalars().all()

    lists_result = await db.execute(
        select(List)
        .where(
            List.board_id == board_id,
            List.is_archived == True,
        )
        .order_by(List.archived_at.desc())
    )
    archived_lists = lists_result.scalars().all()

    list_cache = {}
    cards_data = []
    for card in archived_cards:
        if card.list_id not in list_cache:
            list_cache[card.list_id] = await db.scalar(
                select(List).where(List.id == card.list_id)
            )
        face = await _build_card_face(card, db)
        lst = list_cache.get(card.list_id)
        face["list_name"] = lst.name if lst else None
        cards_data.append(face)

    lists_data = [await _list_out(lst, db) for lst in archived_lists]

    return {"data": {"cards": cards_data, "lists": lists_data}}
