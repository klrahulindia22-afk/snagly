import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.list_ import List
from models.list_automation_rule import ListAutomationRule
from models.board_membership import BoardMembership
from schemas.list_ import (
    ListCreate, ListUpdate, ListReorder, ListOut,
    AutomationRuleCreate, AutomationRuleToggle, AutomationRuleOut,
)
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/boards/{board_id}/lists", tags=["lists"])


async def _broadcast(event_type: str, board_id: int, data: dict) -> None:
    try:
        from services.ws_manager import manager
        await manager.broadcast_to_board(board_id, {"type": event_type, "board_id": board_id, "data": data})
    except Exception:
        pass


# ── helpers ────────────────────────────────────────────────────────────────────

async def _require_member(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(
        select(Board).where(Board.id == board_id, Board.is_archived == False)
    )
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


async def _require_editor(board_id: int, current_user: User, db: AsyncSession):
    board, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot modify lists")
    return board, m


async def _get_list(list_id: int, board_id: int, db: AsyncSession) -> List:
    lst = await db.scalar(
        select(List).where(List.id == list_id, List.board_id == board_id)
    )
    if not lst:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "List not found")
    return lst


async def _next_position(board_id: int, db: AsyncSession) -> int:
    max_pos = await db.scalar(
        select(func.max(List.position)).where(
            List.board_id == board_id, List.is_archived == False
        )
    )
    return (max_pos or 0) + 1


async def _card_count(list_id: int, db: AsyncSession) -> int:
    from models.card import Card as CardModel
    return await db.scalar(
        select(func.count()).select_from(CardModel).where(
            CardModel.list_id == list_id,
            CardModel.is_deleted == False,
            CardModel.is_archived == False,
        )
    ) or 0


async def _list_out(lst: List, db: AsyncSession) -> dict:
    rules_result = await db.execute(
        select(ListAutomationRule).where(ListAutomationRule.list_id == lst.id)
    )
    rules = rules_result.scalars().all()
    return ListOut(
        id=lst.id,
        board_id=lst.board_id,
        name=lst.name,
        position=lst.position,
        wip_limit=lst.wip_limit,
        color=lst.color,
        is_archived=lst.is_archived,
        card_count=await _card_count(lst.id, db),
        created_at=lst.created_at,
        automation_rules=[
            AutomationRuleOut(
                id=r.id, list_id=r.list_id, rule_type=r.rule_type,
                config_json=r.config_json, is_active=r.is_active, created_at=r.created_at,
            )
            for r in rules
        ],
    ).model_dump()


# ── list CRUD ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_lists(
    board_id: int,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    q = select(List).where(List.board_id == board_id)
    if not include_archived:
        q = q.where(List.is_archived == False)
    q = q.order_by(List.position)
    result = await db.execute(q)
    lists = result.scalars().all()
    data = [await _list_out(lst, db) for lst in lists]
    return {"data": data, "meta": {"total": len(data)}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_list(
    board_id: int,
    body: ListCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    position = await _next_position(board_id, db)
    lst = List(
        board_id=board_id,
        name=body.name,
        color=body.color,
        wip_limit=body.wip_limit,
        position=position,
    )
    db.add(lst)
    await db.commit()
    await db.refresh(lst)
    out = await _list_out(lst, db)
    asyncio.create_task(_broadcast("list.created", board_id, out))
    return {"data": out}


@router.patch("/reorder", status_code=status.HTTP_200_OK)
async def reorder_lists(
    board_id: int,
    body: ListReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    for item in body.lists:
        await db.execute(
            update(List)
            .where(List.id == item.id, List.board_id == board_id)
            .values(position=item.position)
        )
    await db.commit()
    return {"data": {"message": "Lists reordered."}}


@router.get("/{list_id}")
async def get_list(
    board_id: int,
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    lst = await _get_list(list_id, board_id, db)
    return {"data": await _list_out(lst, db)}


@router.patch("/{list_id}")
async def update_list(
    board_id: int,
    list_id: int,
    body: ListUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    lst = await _get_list(list_id, board_id, db)
    if lst.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot update an archived list")

    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(List).where(List.id == list_id).values(**changes))
        await db.commit()
        await db.refresh(lst)
    out = await _list_out(lst, db)
    asyncio.create_task(_broadcast("list.updated", board_id, out))
    return {"data": out}


@router.delete("/{list_id}")
async def delete_list(
    board_id: int,
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    lst = await _get_list(list_id, board_id, db)
    # Soft-archive on DELETE (never hard delete)
    await db.execute(
        update(List).where(List.id == list_id).values(
            is_archived=True, archived_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    asyncio.create_task(_broadcast("list.archived", board_id, {"list_id": list_id}))
    return {"data": {"message": "List archived."}}


@router.post("/{list_id}/archive")
async def archive_list(
    board_id: int,
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    lst = await _get_list(list_id, board_id, db)
    if lst.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "List is already archived")
    await db.execute(
        update(List).where(List.id == list_id).values(
            is_archived=True, archived_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    asyncio.create_task(_broadcast("list.archived", board_id, {"list_id": list_id}))
    return {"data": {"message": "List archived."}}


@router.post("/{list_id}/restore")
async def restore_list(
    board_id: int,
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    lst = await _get_list(list_id, board_id, db)
    if not lst.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "List is not archived")
    position = await _next_position(board_id, db)
    await db.execute(
        update(List).where(List.id == list_id).values(
            is_archived=False, archived_at=None, position=position
        )
    )
    await db.commit()
    return {"data": {"message": "List restored."}}


# ── automation rules ───────────────────────────────────────────────────────────

@router.get("/{list_id}/automation-rules")
async def get_automation_rules(
    board_id: int,
    list_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    await _get_list(list_id, board_id, db)
    result = await db.execute(
        select(ListAutomationRule).where(ListAutomationRule.list_id == list_id)
    )
    rules = result.scalars().all()
    return {
        "data": [
            AutomationRuleOut(
                id=r.id, list_id=r.list_id, rule_type=r.rule_type,
                config_json=r.config_json, is_active=r.is_active, created_at=r.created_at,
            ).model_dump()
            for r in rules
        ]
    }


@router.post("/{list_id}/automation-rules", status_code=status.HTTP_201_CREATED)
async def create_automation_rule(
    board_id: int,
    list_id: int,
    body: AutomationRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    await _get_list(list_id, board_id, db)
    rule = ListAutomationRule(
        list_id=list_id, rule_type=body.rule_type, config_json=body.config_json
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "data": AutomationRuleOut(
            id=rule.id, list_id=rule.list_id, rule_type=rule.rule_type,
            config_json=rule.config_json, is_active=rule.is_active, created_at=rule.created_at,
        ).model_dump()
    }


@router.patch("/{list_id}/automation-rules/{rule_id}")
async def toggle_automation_rule(
    board_id: int,
    list_id: int,
    rule_id: int,
    body: AutomationRuleToggle,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_editor(board_id, current_user, db)
    rule = await db.scalar(
        select(ListAutomationRule).where(
            ListAutomationRule.id == rule_id, ListAutomationRule.list_id == list_id
        )
    )
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    await db.execute(
        update(ListAutomationRule)
        .where(ListAutomationRule.id == rule_id)
        .values(is_active=body.is_active)
    )
    await db.commit()
    return {"data": {"message": "Rule updated."}}
