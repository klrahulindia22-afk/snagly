import json
from typing import Optional, List as PyList
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.field_definition import FieldDefinition
from models.card_field import CardField
from models.board_membership import BoardMembership
from models.card import Card
from middleware.auth import get_current_user

board_fields_router = APIRouter(prefix="/api/v1/boards/{board_id}/field-definitions", tags=["fields"])
card_fields_router = APIRouter(prefix="/api/v1/cards/{card_id}/fields", tags=["fields"])


class FieldDefCreate(BaseModel):
    name: str
    field_type: str = "text"  # text | number | date | dropdown
    options: Optional[PyList[str]] = None
    is_required: bool = False


class FieldDefUpdate(BaseModel):
    name: Optional[str] = None
    options: Optional[PyList[str]] = None
    is_required: Optional[bool] = None


class CardFieldSet(BaseModel):
    field_definition_id: int
    value_text: Optional[str] = None
    value_number: Optional[float] = None
    value_date: Optional[str] = None


VALID_TYPES = {"text", "number", "date", "dropdown"}


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


def _fd_out(fd: FieldDefinition) -> dict:
    opts = None
    if fd.options_json:
        try:
            opts = json.loads(fd.options_json)
        except Exception:
            opts = None
    return {
        "id": fd.id,
        "board_id": fd.board_id,
        "name": fd.name,
        "field_type": fd.field_type,
        "options": opts,
        "position": fd.position,
        "is_required": fd.is_required,
    }


# ── Field definition endpoints ────────────────────────────────────────────────

@board_fields_router.get("")
async def list_field_definitions(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    result = await db.execute(
        select(FieldDefinition)
        .where(FieldDefinition.board_id == board_id)
        .order_by(FieldDefinition.position, FieldDefinition.id)
    )
    return {"data": [_fd_out(fd) for fd in result.scalars().all()]}


@board_fields_router.post("", status_code=status.HTTP_201_CREATED)
async def create_field_definition(
    board_id: int,
    body: FieldDefCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot create fields")
    if body.field_type not in VALID_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"field_type must be one of: {', '.join(VALID_TYPES)}")
    from sqlalchemy import func as sqlfunc
    max_pos = await db.scalar(
        select(sqlfunc.max(FieldDefinition.position)).where(FieldDefinition.board_id == board_id)
    ) or 0
    fd = FieldDefinition(
        board_id=board_id,
        name=body.name.strip(),
        field_type=body.field_type,
        options_json=json.dumps(body.options) if body.options else None,
        position=max_pos + 1,
        is_required=body.is_required,
    )
    db.add(fd)
    await db.commit()
    await db.refresh(fd)
    return {"data": _fd_out(fd)}


@board_fields_router.patch("/{field_id}")
async def update_field_definition(
    board_id: int,
    field_id: int,
    body: FieldDefUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot edit fields")
    fd = await db.scalar(
        select(FieldDefinition).where(FieldDefinition.id == field_id, FieldDefinition.board_id == board_id)
    )
    if not fd:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field not found")
    changes = {}
    if body.name is not None:
        changes["name"] = body.name.strip()
    if body.options is not None:
        changes["options_json"] = json.dumps(body.options)
    if body.is_required is not None:
        changes["is_required"] = body.is_required
    if changes:
        await db.execute(update(FieldDefinition).where(FieldDefinition.id == field_id).values(**changes))
        await db.commit()
        await db.refresh(fd)
    return {"data": _fd_out(fd)}


@board_fields_router.delete("/{field_id}")
async def delete_field_definition(
    board_id: int,
    field_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot delete fields")
    fd = await db.scalar(
        select(FieldDefinition).where(FieldDefinition.id == field_id, FieldDefinition.board_id == board_id)
    )
    if not fd:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field not found")
    await db.execute(delete(FieldDefinition).where(FieldDefinition.id == field_id))
    await db.commit()
    return {"data": {"message": "Field deleted."}}


# ── Card field value endpoints ─────────────────────────────────────────────────

@card_fields_router.get("")
async def get_card_fields(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    result = await db.execute(
        select(CardField, FieldDefinition)
        .join(FieldDefinition, CardField.field_definition_id == FieldDefinition.id)
        .where(CardField.card_id == card_id)
        .order_by(FieldDefinition.position)
    )
    fields = []
    for cf, fd in result.all():
        value = cf.value_text if fd.field_type in ("text", "dropdown") else (
            cf.value_number if fd.field_type == "number" else cf.value_date
        )
        fields.append({
            "field_definition_id": fd.id,
            "name": fd.name,
            "field_type": fd.field_type,
            "value": value,
        })
    return {"data": fields}


@card_fields_router.put("")
async def set_card_fields(
    card_id: int,
    body: PyList[CardFieldSet],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    from datetime import datetime
    for item in body:
        existing = await db.scalar(
            select(CardField).where(
                CardField.card_id == card_id, CardField.field_definition_id == item.field_definition_id
            )
        )
        value_date = None
        if item.value_date:
            try:
                value_date = datetime.fromisoformat(item.value_date)
            except Exception:
                pass
        if existing:
            await db.execute(
                update(CardField).where(CardField.id == existing.id).values(
                    value_text=item.value_text,
                    value_number=item.value_number,
                    value_date=value_date,
                )
            )
        else:
            db.add(CardField(
                card_id=card_id,
                field_definition_id=item.field_definition_id,
                value_text=item.value_text,
                value_number=item.value_number,
                value_date=value_date,
            ))
    await db.commit()
    return {"data": {"message": "Fields updated."}}
