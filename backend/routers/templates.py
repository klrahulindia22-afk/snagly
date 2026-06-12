import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.card_template import CardTemplate
from models.card import Priority, Severity
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/boards/{board_id}/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    severity: Optional[Severity] = None
    priority: Optional[Priority] = Priority.normal
    checklist_json: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[Severity] = None
    priority: Optional[Priority] = None
    checklist_json: Optional[str] = None


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


def _tpl_out(t: CardTemplate) -> dict:
    checklist = None
    if t.checklist_json:
        try:
            checklist = json.loads(t.checklist_json)
        except Exception:
            checklist = None
    return {
        "id": t.id,
        "board_id": t.board_id,
        "name": t.name,
        "description": t.description,
        "severity": t.severity.value if t.severity else None,
        "priority": t.priority.value if t.priority else "normal",
        "checklist": checklist,
        "created_at": t.created_at.isoformat(),
    }


@router.get("")
async def list_templates(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    result = await db.execute(
        select(CardTemplate)
        .where(CardTemplate.board_id == board_id)
        .order_by(CardTemplate.created_at)
    )
    return {"data": [_tpl_out(t) for t in result.scalars().all()]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_template(
    board_id: int,
    body: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot create templates")
    tpl = CardTemplate(
        board_id=board_id,
        name=body.name.strip(),
        description=body.description,
        severity=body.severity,
        priority=body.priority or Priority.normal,
        checklist_json=body.checklist_json,
        created_by_id=current_user.id,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return {"data": _tpl_out(tpl)}


@router.patch("/{template_id}")
async def update_template(
    board_id: int,
    template_id: int,
    body: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot edit templates")
    tpl = await db.scalar(
        select(CardTemplate).where(
            CardTemplate.id == template_id, CardTemplate.board_id == board_id
        )
    )
    if not tpl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(CardTemplate).where(CardTemplate.id == template_id).values(**changes))
        await db.commit()
        await db.refresh(tpl)
    return {"data": _tpl_out(tpl)}


@router.delete("/{template_id}")
async def delete_template(
    board_id: int,
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot delete templates")
    tpl = await db.scalar(
        select(CardTemplate).where(
            CardTemplate.id == template_id, CardTemplate.board_id == board_id
        )
    )
    if not tpl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    await db.execute(delete(CardTemplate).where(CardTemplate.id == template_id))
    await db.commit()
    return {"data": {"message": "Template deleted."}}
