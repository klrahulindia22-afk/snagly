import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.list_ import List
from models.card import Card, Priority, Severity, CardSource
from models.card_label import CardLabel
from models.label import Label
from models.card_assignee import CardAssignee
from models.board_membership import BoardMembership
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/boards/{board_id}", tags=["export-import"])


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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return board, m


@router.get("/export")
async def export_board(
    board_id: int,
    format: str = Query("csv", regex="^(csv|json)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, _ = await _require_member(board_id, current_user, db)

    # Fetch lists
    lists_res = await db.execute(
        select(List).where(List.board_id == board_id, List.is_archived == False).order_by(List.position)
    )
    lists = lists_res.scalars().all()
    list_map = {l.id: l.name for l in lists}

    # Fetch non-deleted non-archived cards
    cards_res = await db.execute(
        select(Card).where(
            Card.board_id == board_id, Card.is_deleted == False, Card.is_archived == False
        ).order_by(Card.list_id, Card.position)
    )
    cards = cards_res.scalars().all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "id", "title", "description", "priority", "severity", "source",
            "list_name", "due_date", "start_date", "created_at",
        ])
        for c in cards:
            writer.writerow([
                c.id, c.title,
                (c.description or "").replace("\n", " "),
                c.priority.value if c.priority else "",
                c.severity.value if c.severity else "",
                c.source.value if c.source else "",
                list_map.get(c.list_id, ""),
                c.due_date.isoformat() if c.due_date else "",
                c.start_date.isoformat() if c.start_date else "",
                c.created_at.isoformat() if c.created_at else "",
            ])
        output.seek(0)
        filename = f"bugtrack-{board.name.lower().replace(' ', '-')}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    else:  # JSON
        cards_data = []
        for c in cards:
            cards_data.append({
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "priority": c.priority.value if c.priority else None,
                "severity": c.severity.value if c.severity else None,
                "source": c.source.value if c.source else None,
                "list_name": list_map.get(c.list_id, ""),
                "due_date": c.due_date.isoformat() if c.due_date else None,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        export = {
            "board": {
                "id": board.id,
                "name": board.name,
                "exported_at": datetime.now(timezone.utc).isoformat(),
            },
            "lists": [{"id": l.id, "name": l.name, "position": l.position} for l in lists],
            "cards": cards_data,
        }
        filename = f"bugtrack-{board.name.lower().replace(' ', '-')}.json"
        content = json.dumps(export, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_board(
    board_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_member(board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot import cards")
    if not file.filename.endswith(".csv"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only CSV files are supported")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # Load existing lists by name (case-insensitive)
    lists_res = await db.execute(
        select(List).where(List.board_id == board_id, List.is_archived == False)
    )
    lists = lists_res.scalars().all()
    list_by_name = {l.name.lower(): l for l in lists}

    # Use first list as fallback
    default_list = lists[0] if lists else None
    if not default_list:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Board has no lists to import cards into")

    from sqlalchemy import func as sqlfunc
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    errors = []

    for i, row in enumerate(reader, start=2):
        title = (row.get("title") or "").strip()
        if not title:
            errors.append(f"Row {i}: missing title — skipped")
            continue

        list_name = (row.get("list_name") or "").strip().lower()
        target_list = list_by_name.get(list_name, default_list)

        priority_val = (row.get("priority") or "normal").strip().lower()
        if priority_val not in {e.value for e in Priority}:
            priority_val = "normal"

        severity_val = (row.get("severity") or "").strip().lower()
        severity = severity_val if severity_val in {e.value for e in Severity} else None

        max_pos = await db.scalar(
            select(sqlfunc.max(Card.position)).where(
                Card.list_id == target_list.id, Card.is_deleted == False
            )
        ) or 0

        card = Card(
            board_id=board_id,
            list_id=target_list.id,
            title=title,
            description=(row.get("description") or "").strip() or None,
            priority=priority_val,
            severity=severity,
            source=CardSource.internal,
            position=max_pos + 1,
            created_by_id=current_user.id,
        )
        db.add(card)
        created += 1

    await db.commit()
    return {"data": {"imported": created, "errors": errors}}
