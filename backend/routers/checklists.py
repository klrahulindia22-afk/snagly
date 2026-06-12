from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db
from models.user import User
from models.card import Card
from models.checklist import Checklist
from models.checklist_item import ChecklistItem
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

card_checklists_router = APIRouter(prefix="/api/v1/cards/{card_id}/checklists", tags=["checklists"])
checklists_router = APIRouter(prefix="/api/v1/checklists", tags=["checklists"])
checklist_items_router = APIRouter(prefix="/api/v1/checklist-items", tags=["checklists"])


class ChecklistCreate(BaseModel):
    title: str = "Checklist"
    position: Optional[int] = None


class ChecklistUpdate(BaseModel):
    title: Optional[str] = None


class ChecklistItemCreate(BaseModel):
    text: str
    position: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None


class ChecklistItemUpdate(BaseModel):
    text: Optional[str] = None
    is_checked: Optional[bool] = None
    position: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None


async def _card_member(card_id: int, user: User, db: AsyncSession):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return card, m


async def _checklist_card_member(checklist_id: int, user: User, db: AsyncSession):
    cl = await db.scalar(select(Checklist).where(Checklist.id == checklist_id))
    if not cl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checklist not found")
    card = await db.scalar(select(Card).where(Card.id == cl.card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return cl, card, m


def _item_dict(it):
    return {
        "id": it.id, "checklist_id": it.checklist_id, "text": it.text,
        "is_checked": it.is_checked, "position": it.position,
        "assignee_id": it.assignee_id, "due_date": it.due_date,
        "created_at": it.created_at,
    }


def _cl_dict(cl, items):
    return {
        "id": cl.id, "card_id": cl.card_id, "title": cl.title,
        "position": cl.position, "created_at": cl.created_at,
        "items": [_item_dict(it) for it in items],
    }


# ── card → checklists ─────────────────────────────────────────────────────────

@card_checklists_router.get("")
async def list_checklists(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _card_member(card_id, current_user, db)
    result = await db.execute(
        select(Checklist)
        .where(Checklist.card_id == card_id)
        .order_by(Checklist.position, Checklist.id)
    )
    checklists = result.scalars().all()
    data = []
    for cl in checklists:
        items_res = await db.execute(
            select(ChecklistItem)
            .where(ChecklistItem.checklist_id == cl.id)
            .order_by(ChecklistItem.position, ChecklistItem.id)
        )
        data.append(_cl_dict(cl, items_res.scalars().all()))
    return {"data": data}


@card_checklists_router.post("", status_code=status.HTTP_201_CREATED)
async def create_checklist(
    card_id: int,
    body: ChecklistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _card_member(card_id, current_user, db)
    max_pos = await db.scalar(
        select(func.max(Checklist.position)).where(Checklist.card_id == card_id)
    ) or 0
    cl = Checklist(
        card_id=card_id, title=body.title,
        position=body.position if body.position is not None else max_pos + 1,
    )
    db.add(cl)
    await db.commit()
    cl = await db.scalar(select(Checklist).where(Checklist.id == cl.id))
    return {"data": _cl_dict(cl, [])}


# ── checklist CRUD ────────────────────────────────────────────────────────────

@checklists_router.patch("/{checklist_id}")
async def update_checklist(
    checklist_id: int,
    body: ChecklistUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cl, _, _ = await _checklist_card_member(checklist_id, current_user, db)
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(Checklist).where(Checklist.id == checklist_id).values(**changes))
        await db.commit()
    return {"data": {"message": "Updated."}}


@checklists_router.delete("/{checklist_id}")
async def delete_checklist(
    checklist_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _checklist_card_member(checklist_id, current_user, db)
    await db.execute(delete(Checklist).where(Checklist.id == checklist_id))
    await db.commit()
    return {"data": {"message": "Deleted."}}


@checklists_router.post("/{checklist_id}/items", status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    checklist_id: int,
    body: ChecklistItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _checklist_card_member(checklist_id, current_user, db)
    max_pos = await db.scalar(
        select(func.max(ChecklistItem.position)).where(ChecklistItem.checklist_id == checklist_id)
    ) or 0
    item = ChecklistItem(
        checklist_id=checklist_id,
        text=body.text,
        position=body.position if body.position is not None else max_pos + 1,
        assignee_id=body.assignee_id,
        due_date=body.due_date,
    )
    db.add(item)
    await db.commit()
    item = await db.scalar(select(ChecklistItem).where(ChecklistItem.id == item.id))
    return {"data": _item_dict(item)}


# ── checklist item CRUD ───────────────────────────────────────────────────────

@checklist_items_router.patch("/{item_id}")
async def update_checklist_item(
    item_id: int,
    body: ChecklistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(select(ChecklistItem).where(ChecklistItem.id == item_id))
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _checklist_card_member(item.checklist_id, current_user, db)
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(ChecklistItem).where(ChecklistItem.id == item_id).values(**changes))
        await db.commit()
    item = await db.scalar(select(ChecklistItem).where(ChecklistItem.id == item_id))
    return {"data": _item_dict(item)}


@checklist_items_router.delete("/{item_id}")
async def delete_checklist_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(select(ChecklistItem).where(ChecklistItem.id == item_id))
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _checklist_card_member(item.checklist_id, current_user, db)
    await db.execute(delete(ChecklistItem).where(ChecklistItem.id == item_id))
    await db.commit()
    return {"data": {"message": "Deleted."}}
