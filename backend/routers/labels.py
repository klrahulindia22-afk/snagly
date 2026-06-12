from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models.user import User, UserRole
from models.label import Label
from models.board import Board
from models.board_membership import BoardMembership
from schemas.card import LabelCreate, LabelUpdate, LabelOut
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/boards/{board_id}/labels", tags=["labels"])


async def _require_member(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(select(Board).where(Board.id == board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id, BoardMembership.user_id == current_user.id
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


@router.get("")
async def list_labels(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    result = await db.execute(
        select(Label).where(Label.board_id == board_id).order_by(Label.created_at)
    )
    labels = result.scalars().all()
    return {
        "data": [
            LabelOut(id=l.id, board_id=l.board_id, name=l.name, color=l.color, created_at=l.created_at).model_dump()
            for l in labels
        ]
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_label(
    board_id: int,
    body: LabelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot create labels")
    label = Label(board_id=board_id, name=body.name, color=body.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return {"data": LabelOut(id=label.id, board_id=label.board_id, name=label.name, color=label.color, created_at=label.created_at).model_dump()}


@router.patch("/{label_id}")
async def update_label(
    board_id: int,
    label_id: int,
    body: LabelUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot update labels")
    label = await db.scalar(select(Label).where(Label.id == label_id, Label.board_id == board_id))
    if not label:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(Label).where(Label.id == label_id).values(**changes))
        await db.commit()
        await db.refresh(label)
    return {"data": LabelOut(id=label.id, board_id=label.board_id, name=label.name, color=label.color, created_at=label.created_at).model_dump()}


@router.delete("/{label_id}")
async def delete_label(
    board_id: int,
    label_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot delete labels")
    label = await db.scalar(select(Label).where(Label.id == label_id, Label.board_id == board_id))
    if not label:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    await db.execute(delete(Label).where(Label.id == label_id))
    await db.commit()
    return {"data": {"message": "Label deleted."}}
