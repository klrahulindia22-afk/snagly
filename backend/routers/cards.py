import asyncio
from datetime import datetime, timezone
from typing import Optional, List as PyList
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, delete
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.list_ import List
from models.card import Card, Priority, Severity, CardSource
from models.card_meta import CardMeta
from models.card_label import CardLabel
from models.card_assignee import CardAssignee
from models.label import Label
from models.board_membership import BoardMembership
from models.checklist import Checklist
from models.checklist_item import ChecklistItem
from schemas.card import CardCreate, CardUpdate, CardMove, CardFace, LabelMiniOut, AssigneeMiniOut, CardMetaOut
from models.sla_rule import SLARule
from models.card_watcher import CardWatcher
from models.card_field import CardField
from models.field_definition import FieldDefinition
from models.time_entry import TimeEntry
from middleware.auth import get_current_user

board_cards_router = APIRouter(prefix="/api/v1/boards/{board_id}/cards", tags=["cards"])
cards_router = APIRouter(prefix="/api/v1/cards", tags=["cards"])


# ── helpers ────────────────────────────────────────────────────────────────────

async def _broadcast(event_type: str, board_id: int, data: dict) -> None:
    """Fire-and-forget broadcast of a board event via WebSocket."""
    try:
        from services.ws_manager import manager
        await manager.broadcast_to_board(board_id, {
            "type": event_type,
            "board_id": board_id,
            "data": data,
        })
    except Exception:
        pass


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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


async def _get_card_for_user(card_id: int, current_user: User, db: AsyncSession) -> Card:
    card = await db.scalar(
        select(Card).where(Card.id == card_id, Card.is_deleted == False)
    )
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    await _require_member(card.board_id, current_user, db)
    return card


async def _build_card_face(card: Card, db: AsyncSession, current_user_id: Optional[int] = None) -> dict:
    # Labels
    cl_result = await db.execute(
        select(CardLabel, Label)
        .join(Label, CardLabel.label_id == Label.id)
        .where(CardLabel.card_id == card.id)
    )
    labels = [
        LabelMiniOut(id=lb.id, name=lb.name, color=lb.color).model_dump()
        for _, lb in cl_result.all()
    ]

    # Assignees
    ca_result = await db.execute(
        select(CardAssignee, User)
        .join(User, CardAssignee.user_id == User.id)
        .where(CardAssignee.card_id == card.id)
    )
    assignees = [
        AssigneeMiniOut(
            user_id=u.id, full_name=u.full_name,
            avatar_url=u.avatar_url, initials_color=u.initials_color,
        ).model_dump()
        for _, u in ca_result.all()
    ]

    # Meta
    meta_obj = await db.scalar(select(CardMeta).where(CardMeta.card_id == card.id))
    meta = CardMetaOut(
        browser=meta_obj.browser, os=meta_obj.os, viewport=meta_obj.viewport
    ).model_dump() if meta_obj else None

    # Checklist progress
    checklist_total = await db.scalar(
        select(func.count()).select_from(ChecklistItem)
        .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
        .where(Checklist.card_id == card.id)
    ) or 0
    checklist_checked = await db.scalar(
        select(func.count()).select_from(ChecklistItem)
        .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
        .where(Checklist.card_id == card.id, ChecklistItem.is_checked == True)
    ) or 0

    # Watchers
    watcher_count = await db.scalar(
        select(func.count()).select_from(CardWatcher).where(CardWatcher.card_id == card.id)
    ) or 0
    is_watching = False
    if current_user_id:
        is_watching = await db.scalar(
            select(CardWatcher).where(
                CardWatcher.card_id == card.id,
                CardWatcher.user_id == current_user_id,
            )
        ) is not None

    # Custom fields
    cf_result = await db.execute(
        select(CardField, FieldDefinition)
        .join(FieldDefinition, CardField.field_definition_id == FieldDefinition.id)
        .where(CardField.card_id == card.id)
        .order_by(FieldDefinition.position)
    )
    custom_fields = []
    for cf, fd in cf_result.all():
        value = cf.value_text if fd.field_type in ("text", "dropdown") else (
            cf.value_number if fd.field_type == "number" else (
                cf.value_date.isoformat() if cf.value_date else None
            )
        )
        custom_fields.append({
            "field_definition_id": fd.id,
            "name": fd.name,
            "field_type": fd.field_type,
            "value": value,
        })

    # Total logged time
    total_time_minutes = await db.scalar(
        select(func.sum(TimeEntry.duration_minutes)).where(TimeEntry.card_id == card.id)
    ) or 0

    return CardFace(
        id=card.id, board_id=card.board_id, list_id=card.list_id,
        title=card.title, description=card.description, position=card.position,
        priority=card.priority.value, severity=card.severity.value if card.severity else None,
        source=card.source.value, due_date=card.due_date, start_date=card.start_date,
        cover_image_url=card.cover_image_url,
        is_archived=card.is_archived, is_deleted=card.is_deleted,
        created_by_id=card.created_by_id, created_at=card.created_at,
        labels=labels, assignees=assignees, meta=meta,
        checklist_total=checklist_total, checklist_checked=checklist_checked,
        watcher_count=watcher_count, is_watching=is_watching,
        custom_fields=custom_fields,
        total_time_minutes=int(total_time_minutes),
        is_recurring=card.is_recurring or False,
        recurrence_pattern=card.recurrence_pattern,
        next_recurrence_at=card.next_recurrence_at,
    ).model_dump()


async def _normalize_positions(list_id: int, db: AsyncSession):
    result = await db.execute(
        select(Card)
        .where(Card.list_id == list_id, Card.is_deleted == False, Card.is_archived == False)
        .order_by(Card.position, Card.id)
    )
    cards = result.scalars().all()
    for i, c in enumerate(cards):
        if c.position != i + 1:
            await db.execute(update(Card).where(Card.id == c.id).values(position=i + 1))


async def _next_card_position(list_id: int, db: AsyncSession) -> int:
    max_pos = await db.scalar(
        select(func.max(Card.position)).where(
            Card.list_id == list_id, Card.is_deleted == False
        )
    )
    return (max_pos or 0) + 1


# ── board-scoped endpoints ─────────────────────────────────────────────────────

@board_cards_router.get("")
async def list_cards(
    board_id: int,
    list_id: Optional[int] = Query(None),
    priority: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    label_id: Optional[int] = Query(None),
    assignee_id: Optional[int] = Query(None),
    is_archived: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    q = select(Card).where(Card.board_id == board_id, Card.is_deleted == False)

    if list_id:
        q = q.where(Card.list_id == list_id)
    if priority:
        q = q.where(Card.priority == priority)
    if severity:
        q = q.where(Card.severity == severity)
    if source:
        q = q.where(Card.source == source)
    if label_id:
        q = q.where(
            Card.id.in_(
                select(CardLabel.card_id).where(CardLabel.label_id == label_id)
            )
        )
    if assignee_id:
        q = q.where(
            Card.id.in_(
                select(CardAssignee.card_id).where(CardAssignee.user_id == assignee_id)
            )
        )
    q = q.where(Card.is_archived == is_archived)
    q = q.order_by(Card.list_id, Card.position)

    result = await db.execute(q)
    cards = result.scalars().all()
    data = [await _build_card_face(c, db, current_user.id) for c in cards]
    return {"data": data, "meta": {"total": len(data)}}


@board_cards_router.post("", status_code=status.HTTP_201_CREATED)
async def create_card(
    board_id: int,
    body: CardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)

    # Verify list belongs to this board
    lst = await db.scalar(
        select(List).where(List.id == body.list_id, List.board_id == board_id, List.is_archived == False)
    )
    if not lst:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "List not found")

    position = await _next_card_position(body.list_id, db)
    source = CardSource.client if m.role == UserRole.client else (body.source or CardSource.internal)

    # SLA auto-due-date: apply if severity set, no due_date provided, and a matching rule exists
    sla_due_date = body.due_date
    sla_rule_applied = None
    if body.severity and not body.due_date:
        sla_rule = await db.scalar(
            select(SLARule).where(SLARule.board_id == board_id, SLARule.severity == body.severity.value)
        )
        if sla_rule:
            from datetime import timedelta
            sla_due_date = datetime.now(timezone.utc) + timedelta(hours=sla_rule.hours_to_resolve)
            sla_rule_applied = sla_rule

    card = Card(
        board_id=board_id, list_id=body.list_id,
        title=body.title, position=position,
        priority=body.priority or Priority.normal,
        severity=body.severity, source=source,
        due_date=sla_due_date, start_date=body.start_date,
        created_by_id=current_user.id,
    )
    db.add(card)
    await db.flush()

    # Save CardMeta
    if body.meta:
        db.add(CardMeta(
            card_id=card.id,
            browser=body.meta.browser, os=body.meta.os,
            viewport=body.meta.viewport, user_agent=body.meta.user_agent,
        ))

    # Log SLA auto-due-date if applied
    if sla_rule_applied:
        from models.activity_log import ActivityLog
        import json
        db.add(ActivityLog(
            card_id=card.id,
            actor_id=current_user.id,
            action_type="sla_due_date_set",
            meta_json=json.dumps({
                "severity": sla_rule_applied.severity.value,
                "hours": sla_rule_applied.hours_to_resolve,
                "due_date": sla_due_date.isoformat(),
            }),
        ))

    await db.commit()
    await db.refresh(card)
    face = await _build_card_face(card, db, current_user.id)
    asyncio.create_task(_broadcast("card.created", board_id, face))
    return {"data": face}


# ── card-level endpoints ───────────────────────────────────────────────────────

@cards_router.get("/{card_id}")
async def get_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    await db.refresh(card)
    return {"data": await _build_card_face(card, db, current_user.id)}


@cards_router.patch("/{card_id}")
async def update_card(
    card_id: int,
    body: CardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(Card).where(Card.id == card_id).values(**changes))
        await db.commit()
        await db.refresh(card)
    face = await _build_card_face(card, db, current_user.id)
    asyncio.create_task(_broadcast("card.updated", card.board_id, face))
    return {"data": face}


@cards_router.delete("/{card_id}")
async def delete_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    _, m = await _require_member(card.board_id, current_user, db)
    if m.role == UserRole.client and card.created_by_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients can only delete their own cards")
    await db.execute(
        update(Card).where(Card.id == card_id).values(
            is_deleted=True, deleted_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    return {"data": {"message": "Card deleted."}}


@cards_router.post("/{card_id}/archive")
async def archive_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    await db.execute(
        update(Card).where(Card.id == card_id).values(
            is_archived=True, archived_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    asyncio.create_task(_broadcast("card.archived", card.board_id, {"card_id": card_id, "list_id": card.list_id}))
    return {"data": {"message": "Card archived."}}


@cards_router.post("/{card_id}/restore")
async def restore_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    await db.execute(
        update(Card).where(Card.id == card_id).values(is_archived=False, archived_at=None)
    )
    await db.commit()
    await db.refresh(card)
    face = await _build_card_face(card, db, current_user.id)
    asyncio.create_task(_broadcast("card.restored", card.board_id, face))
    return {"data": {"message": "Card restored."}}


@cards_router.delete("/{card_id}/permanent")
async def permanent_delete_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    if not card.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Card must be archived before permanent deletion")
    await db.execute(
        update(Card).where(Card.id == card_id).values(
            is_deleted=True, deleted_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    return {"data": {"message": "Card permanently deleted."}}


@cards_router.patch("/{card_id}/move")
async def move_card(
    card_id: int,
    body: CardMove,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    old_list_id = card.list_id

    # Verify target list belongs to same board
    target_list = await db.scalar(
        select(List).where(List.id == body.list_id, List.board_id == card.board_id, List.is_archived == False)
    )
    if not target_list:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target list not found")

    await db.execute(
        update(Card).where(Card.id == card_id).values(list_id=body.list_id, position=body.position)
    )
    await db.commit()

    # Normalize positions in affected lists
    await _normalize_positions(body.list_id, db)
    if old_list_id != body.list_id:
        await _normalize_positions(old_list_id, db)
    await db.commit()

    await db.refresh(card)
    face = await _build_card_face(card, db, current_user.id)
    asyncio.create_task(_broadcast("card.moved", card.board_id, {
        "card_id": card_id, "list_id": body.list_id, "from_list_id": old_list_id, "position": body.position,
    }))
    return {"data": face}


# ── label assignment ───────────────────────────────────────────────────────────

@cards_router.post("/{card_id}/labels/{label_id}", status_code=status.HTTP_201_CREATED)
async def add_label(
    card_id: int,
    label_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    label = await db.scalar(
        select(Label).where(Label.id == label_id, Label.board_id == card.board_id)
    )
    if not label:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found on this board")
    existing = await db.scalar(
        select(CardLabel).where(CardLabel.card_id == card_id, CardLabel.label_id == label_id)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Label already applied")
    db.add(CardLabel(card_id=card_id, label_id=label_id))
    await db.commit()
    return {"data": {"message": "Label added."}}


@cards_router.delete("/{card_id}/labels/{label_id}")
async def remove_label(
    card_id: int,
    label_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_for_user(card_id, current_user, db)
    await db.execute(
        delete(CardLabel).where(CardLabel.card_id == card_id, CardLabel.label_id == label_id)
    )
    await db.commit()
    return {"data": {"message": "Label removed."}}


# ── assignee management ────────────────────────────────────────────────────────

@cards_router.post("/{card_id}/assignees/{user_id}", status_code=status.HTTP_201_CREATED)
async def add_assignee(
    card_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    # Verify user is a board member
    member = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == user_id,
        )
    )
    if not member:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User is not a board member")
    existing = await db.scalar(
        select(CardAssignee).where(CardAssignee.card_id == card_id, CardAssignee.user_id == user_id)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already assigned")
    db.add(CardAssignee(card_id=card_id, user_id=user_id))
    await db.commit()
    return {"data": {"message": "Assignee added."}}


@cards_router.delete("/{card_id}/assignees/{user_id}")
async def remove_assignee(
    card_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_for_user(card_id, current_user, db)
    await db.execute(
        delete(CardAssignee).where(CardAssignee.card_id == card_id, CardAssignee.user_id == user_id)
    )
    await db.commit()
    return {"data": {"message": "Assignee removed."}}


@cards_router.post("/{card_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    _, m = await _require_member(card.board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot duplicate cards")

    next_pos = await _next_card_position(card.list_id, db)
    new_card = Card(
        board_id=card.board_id,
        list_id=card.list_id,
        title=f"Copy of {card.title}",
        description=card.description,
        priority=card.priority,
        severity=card.severity,
        source=card.source,
        position=next_pos,
        created_by_id=current_user.id,
    )
    db.add(new_card)
    await db.flush()

    # Copy labels
    labels_result = await db.execute(
        select(CardLabel).where(CardLabel.card_id == card_id)
    )
    for cl in labels_result.scalars().all():
        db.add(CardLabel(card_id=new_card.id, label_id=cl.label_id))

    await db.commit()
    new_card = await db.scalar(select(Card).where(Card.id == new_card.id))
    face = await _build_card_face(new_card, db, current_user.id)
    return {"data": face}


class BulkActionRequest(BaseModel):
    card_ids: PyList[int]
    action: str  # "archive" | "move" | "set_priority"
    target_list_id: Optional[int] = None
    priority: Optional[str] = None


@board_cards_router.post("/bulk")
async def bulk_card_action(
    board_id: int,
    body: BulkActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot perform bulk actions")

    result = await db.execute(
        select(Card).where(
            Card.id.in_(body.card_ids),
            Card.board_id == board_id,
            Card.is_deleted == False,
        )
    )
    cards = result.scalars().all()

    now = datetime.now(timezone.utc)
    if body.action == "archive":
        for c in cards:
            await db.execute(
                update(Card).where(Card.id == c.id).values(is_archived=True, archived_at=now)
            )
    elif body.action == "move":
        if not body.target_list_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "target_list_id required for move")
        target = await db.scalar(
            select(List).where(List.id == body.target_list_id, List.board_id == board_id)
        )
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target list not found")
        for c in cards:
            await db.execute(
                update(Card).where(Card.id == c.id).values(list_id=body.target_list_id)
            )
    elif body.action == "set_priority":
        valid_priorities = {e.value for e in Priority}
        if body.priority not in valid_priorities:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid priority. Must be one of: {', '.join(valid_priorities)}")
        for c in cards:
            await db.execute(
                update(Card).where(Card.id == c.id).values(priority=body.priority)
            )
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown action: {body.action}")

    await db.commit()
    return {"data": {"affected": len(cards)}}


# ── Recurring card endpoints ───────────────────────────────────────────────────

class RecurrenceSet(BaseModel):
    pattern: str  # "daily" | "weekly" | "monthly"
    end_date: Optional[datetime] = None


@cards_router.put("/{card_id}/recurrence")
async def set_recurrence(
    card_id: int,
    body: RecurrenceSet,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await _get_card_for_user(card_id, current_user, db)
    valid_patterns = {"daily", "weekly", "monthly"}
    if body.pattern not in valid_patterns:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"pattern must be one of: {', '.join(valid_patterns)}")

    from datetime import timedelta
    base = card.due_date or datetime.now(timezone.utc)
    if body.pattern == "daily":
        next_at = base + timedelta(days=1)
    elif body.pattern == "weekly":
        next_at = base + timedelta(weeks=1)
    else:
        from dateutil.relativedelta import relativedelta
        next_at = base + relativedelta(months=1)

    await db.execute(
        update(Card).where(Card.id == card_id).values(
            is_recurring=True,
            recurrence_pattern=body.pattern,
            recurrence_end_date=body.end_date,
            next_recurrence_at=next_at,
        )
    )
    await db.commit()
    await db.refresh(card)
    face = await _build_card_face(card, db, current_user.id)
    return {"data": face}


@cards_router.delete("/{card_id}/recurrence")
async def clear_recurrence(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_for_user(card_id, current_user, db)
    await db.execute(
        update(Card).where(Card.id == card_id).values(
            is_recurring=False,
            recurrence_pattern=None,
            recurrence_end_date=None,
            next_recurrence_at=None,
        )
    )
    await db.commit()
    return {"data": {"message": "Recurrence cleared."}}


@cards_router.post("/{card_id}/recurrence/trigger")
async def trigger_recurrence(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually clone a recurring card and advance its next_recurrence_at."""
    card = await _get_card_for_user(card_id, current_user, db)
    if not card.is_recurring:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Card is not recurring")

    from datetime import timedelta
    from dateutil.relativedelta import relativedelta

    next_pos = await _next_card_position(card.list_id, db)
    new_card = Card(
        board_id=card.board_id, list_id=card.list_id,
        title=card.title, description=card.description,
        priority=card.priority, severity=card.severity, source=card.source,
        position=next_pos, created_by_id=current_user.id,
        is_recurring=False,
    )
    db.add(new_card)

    # Advance next_recurrence_at
    base = card.next_recurrence_at or datetime.now(timezone.utc)
    if card.recurrence_pattern == "daily":
        next_at = base + timedelta(days=1)
    elif card.recurrence_pattern == "weekly":
        next_at = base + timedelta(weeks=1)
    else:
        next_at = base + relativedelta(months=1)

    active = not (card.recurrence_end_date and next_at > card.recurrence_end_date)
    await db.execute(
        update(Card).where(Card.id == card_id).values(
            next_recurrence_at=next_at if active else None,
            is_recurring=active,
        )
    )
    await db.flush()
    await db.commit()

    new_card = await db.scalar(select(Card).where(Card.id == new_card.id))
    face = await _build_card_face(new_card, db, current_user.id)
    asyncio.create_task(_broadcast("card.created", card.board_id, face))
    return {"data": face}
