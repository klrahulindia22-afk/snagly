from datetime import datetime, timezone, timedelta, date as dt_date
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.board_membership import BoardMembership
from models.card import Card
from models.list_ import List
from models.label import Label
from models.card_label import CardLabel
from models.card_assignee import CardAssignee
from middleware.auth import get_current_user

board_dash_router = APIRouter(
    prefix="/api/v1/boards/{board_id}/dashboard", tags=["dashboard"]
)
global_dash_router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _fill_trend(opened: dict, closed: dict, start: dt_date, end: dt_date) -> list:
    result = []
    cur = start
    while cur <= end:
        ds = cur.isoformat()
        result.append({"date": ds, "opened": opened.get(ds, 0), "closed": closed.get(ds, 0)})
        cur += timedelta(days=1)
    return result


async def _verify_board_member(board_id: int, user: User, db: AsyncSession):
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
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot access the dashboard")
    return board, m


# ── per-board dashboard ────────────────────────────────────────────────────────

@board_dash_router.get("")
async def board_dashboard(
    board_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    label_id: Optional[int] = Query(None),
    source: Optional[str] = Query(None),
    trend_days: int = Query(30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_board_member(board_id, current_user, db)

    sd = _parse_date(start_date)
    ed = _parse_date(end_date)
    now = datetime.now(timezone.utc)

    # Base predicate for "active" (non-archived) cards
    def active_where(*extra):
        conds = [
            Card.board_id == board_id,
            Card.is_deleted == False,
            Card.is_archived == False,
        ]
        if sd:
            conds.append(Card.created_at >= sd)
        if ed:
            conds.append(Card.created_at <= ed)
        if assignee_id:
            conds.append(
                Card.id.in_(
                    select(CardAssignee.card_id).where(CardAssignee.user_id == assignee_id)
                )
            )
        if label_id:
            conds.append(
                Card.id.in_(
                    select(CardLabel.card_id).where(CardLabel.label_id == label_id)
                )
            )
        if source:
            conds.append(Card.source == source)
        conds.extend(extra)
        return and_(*conds)

    # ── stats ──
    total_bugs = await db.scalar(
        select(func.count()).select_from(Card).where(active_where())
    ) or 0

    overdue_bugs = await db.scalar(
        select(func.count()).select_from(Card).where(
            active_where(Card.due_date.isnot(None), Card.due_date < now)
        )
    ) or 0

    week_ago = now - timedelta(days=7)
    resolved_this_week = await db.scalar(
        select(func.count()).select_from(Card).where(
            Card.board_id == board_id,
            Card.is_deleted == False,
            Card.is_archived == True,
            Card.archived_at.isnot(None),
            Card.archived_at >= week_ago,
        )
    ) or 0

    # Unassigned = no CardAssignee row
    assigned_card_ids_q = select(CardAssignee.card_id).where(
        CardAssignee.card_id.in_(
            select(Card.id).where(active_where())
        )
    )
    assigned_count = await db.scalar(
        select(func.count()).select_from(
            select(CardAssignee.card_id).distinct()
            .where(CardAssignee.card_id.in_(select(Card.id).where(active_where())))
            .subquery()
        )
    ) or 0
    unassigned = total_bugs - assigned_count

    avg_days_raw = await db.scalar(
        select(func.avg(func.datediff(Card.archived_at, Card.created_at))).where(
            Card.board_id == board_id,
            Card.is_deleted == False,
            Card.is_archived == True,
            Card.archived_at.isnot(None),
        )
    )
    avg_resolution_days = round(float(avg_days_raw), 1) if avg_days_raw else None

    # ── by severity ──
    sev_result = await db.execute(
        select(Card.severity, func.count().label("cnt"))
        .where(active_where())
        .group_by(Card.severity)
    )
    by_severity = [
        {"severity": row.severity.value if row.severity else "none", "count": row.cnt}
        for row in sev_result.all()
    ]

    # ── by priority ──
    pri_result = await db.execute(
        select(Card.priority, func.count().label("cnt"))
        .where(active_where())
        .group_by(Card.priority)
    )
    by_priority = [
        {"priority": row.priority.value if row.priority else "none", "count": row.cnt}
        for row in pri_result.all()
    ]

    # ── by column ──
    col_result = await db.execute(
        select(List.id, List.name, List.color, func.count(Card.id).label("cnt"))
        .outerjoin(Card, and_(
            Card.list_id == List.id,
            Card.is_deleted == False,
            Card.is_archived == False,
        ))
        .where(List.board_id == board_id, List.is_archived == False)
        .group_by(List.id, List.name, List.color)
        .order_by(List.position)
    )
    by_column = [
        {"list_id": row.id, "list_name": row.name, "color": row.color, "count": row.cnt or 0}
        for row in col_result.all()
    ]

    # ── by label ──
    lbl_result = await db.execute(
        select(Label.id, Label.name, Label.color, func.count(CardLabel.card_id).label("cnt"))
        .outerjoin(CardLabel, CardLabel.label_id == Label.id)
        .outerjoin(Card, and_(
            Card.id == CardLabel.card_id,
            Card.is_deleted == False,
            Card.is_archived == False,
        ))
        .where(Label.board_id == board_id)
        .group_by(Label.id, Label.name, Label.color)
        .order_by(func.count(CardLabel.card_id).desc())
    )
    by_label = [
        {"label_id": row.id, "label_name": row.name, "color": row.color, "count": row.cnt or 0}
        for row in lbl_result.all()
        if (row.cnt or 0) > 0
    ]

    # ── by assignee (open vs closed) ──
    open_assign_result = await db.execute(
        select(User.id, User.full_name, User.initials_color, func.count().label("cnt"))
        .join(CardAssignee, CardAssignee.user_id == User.id)
        .join(Card, and_(Card.id == CardAssignee.card_id, Card.board_id == board_id,
                         Card.is_deleted == False, Card.is_archived == False))
        .group_by(User.id, User.full_name, User.initials_color)
    )
    open_assign = {row.id: {"full_name": row.full_name, "initials_color": row.initials_color, "open": row.cnt} for row in open_assign_result.all()}

    closed_assign_result = await db.execute(
        select(User.id, func.count().label("cnt"))
        .join(CardAssignee, CardAssignee.user_id == User.id)
        .join(Card, and_(Card.id == CardAssignee.card_id, Card.board_id == board_id,
                         Card.is_deleted == False, Card.is_archived == True))
        .group_by(User.id)
    )
    closed_assign = {row.id: row.cnt for row in closed_assign_result.all()}

    all_user_ids = set(open_assign) | set(closed_assign)
    by_assignee = [
        {
            "user_id": uid,
            "full_name": open_assign.get(uid, {}).get("full_name") or closed_assign.get(uid),
            "initials_color": open_assign.get(uid, {}).get("initials_color"),
            "open_count": open_assign.get(uid, {}).get("open", 0),
            "closed_count": closed_assign.get(uid, 0),
        }
        for uid in all_user_ids
    ]
    by_assignee.sort(key=lambda x: (x["open_count"] + x["closed_count"]), reverse=True)

    # ── trend ──
    trend_end = now.date()
    trend_start = trend_end - timedelta(days=trend_days - 1)

    opened_result = await db.execute(
        select(func.date(Card.created_at).label("d"), func.count().label("cnt"))
        .where(
            Card.board_id == board_id,
            Card.is_deleted == False,
            Card.created_at >= datetime.combine(trend_start, datetime.min.time()),
        )
        .group_by(func.date(Card.created_at))
    )
    opened_by_date = {str(row.d): row.cnt for row in opened_result.all()}

    closed_result = await db.execute(
        select(func.date(Card.archived_at).label("d"), func.count().label("cnt"))
        .where(
            Card.board_id == board_id,
            Card.is_deleted == False,
            Card.is_archived == True,
            Card.archived_at.isnot(None),
            Card.archived_at >= datetime.combine(trend_start, datetime.min.time()),
        )
        .group_by(func.date(Card.archived_at))
    )
    closed_by_date = {str(row.d): row.cnt for row in closed_result.all()}

    trend = _fill_trend(opened_by_date, closed_by_date, trend_start, trend_end)

    # ── by source ──
    src_result = await db.execute(
        select(Card.source, func.count().label("cnt"))
        .where(active_where())
        .group_by(Card.source)
    )
    by_source = [
        {"source": row.source.value if row.source else "internal", "count": row.cnt}
        for row in src_result.all()
    ]

    return {
        "data": {
            "stats": {
                "total_bugs": total_bugs,
                "open_bugs": total_bugs,
                "overdue_bugs": overdue_bugs,
                "resolved_this_week": resolved_this_week,
                "unassigned": max(0, unassigned),
                "avg_resolution_days": avg_resolution_days,
            },
            "by_severity": by_severity,
            "by_priority": by_priority,
            "by_column": by_column,
            "by_label": by_label,
            "by_assignee": by_assignee,
            "trend": trend,
            "by_source": by_source,
        }
    }


# ── global dashboard ───────────────────────────────────────────────────────────

@global_dash_router.get("/global")
async def global_dashboard(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    trend_days: int = Query(30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sd = _parse_date(start_date)
    ed = _parse_date(end_date)
    now = datetime.now(timezone.utc)

    # Get accessible board IDs
    if current_user.role == UserRole.super_admin:
        board_ids_result = await db.execute(
            select(Board.id).where(Board.is_archived == False)
        )
    else:
        board_ids_result = await db.execute(
            select(BoardMembership.board_id)
            .join(Board, Board.id == BoardMembership.board_id)
            .where(
                BoardMembership.user_id == current_user.id,
                Board.is_archived == False,
            )
        )
    board_ids = [row[0] for row in board_ids_result.all()]

    if not board_ids:
        return {"data": {
            "stats": {}, "bugs_per_board": [], "severity_per_board": [],
            "priority_per_board": [], "trend": [], "top_assignees": [], "label_usage": [],
        }}

    def active_base(*extra):
        conds = [
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == False,
        ]
        if sd:
            conds.append(Card.created_at >= sd)
        if ed:
            conds.append(Card.created_at <= ed)
        if severity:
            conds.append(Card.severity == severity)
        if priority_filter:
            conds.append(Card.priority == priority_filter)
        conds.extend(extra)
        return and_(*conds)

    # ── global stats ──
    total_open = await db.scalar(
        select(func.count()).select_from(Card).where(active_base())
    ) or 0

    critical_open = await db.scalar(
        select(func.count()).select_from(Card).where(active_base(Card.severity == "critical"))
    ) or 0

    overdue = await db.scalar(
        select(func.count()).select_from(Card).where(
            active_base(Card.due_date.isnot(None), Card.due_date < now)
        )
    ) or 0

    week_ago = now - timedelta(days=7)
    resolved_week = await db.scalar(
        select(func.count()).select_from(Card).where(
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == True,
            Card.archived_at.isnot(None),
            Card.archived_at >= week_ago,
        )
    ) or 0

    # Most active board (most cards created/updated in last 7 days)
    activity_result = await db.execute(
        select(Card.board_id, func.count().label("cnt"))
        .where(
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.updated_at >= week_ago,
        )
        .group_by(Card.board_id)
        .order_by(func.count().desc())
        .limit(1)
    )
    most_active_row = activity_result.first()
    most_active_board = None
    if most_active_row:
        b = await db.scalar(select(Board).where(Board.id == most_active_row.board_id))
        most_active_board = {"id": most_active_row.board_id, "name": b.name if b else None}

    # ── bugs per board ──
    bpb_result = await db.execute(
        select(Board.id, Board.name, func.count(Card.id).label("cnt"))
        .outerjoin(Card, and_(
            Card.board_id == Board.id,
            Card.is_deleted == False,
            Card.is_archived == False,
        ))
        .where(Board.id.in_(board_ids))
        .group_by(Board.id, Board.name)
        .order_by(func.count(Card.id).desc())
    )
    bugs_per_board = [
        {"board_id": row.id, "board_name": row.name, "count": row.cnt or 0}
        for row in bpb_result.all()
    ]

    # ── severity per board ──
    spb_result = await db.execute(
        select(Card.board_id, Card.severity, func.count().label("cnt"))
        .where(active_base())
        .group_by(Card.board_id, Card.severity)
    )
    severity_map = {}
    for row in spb_result.all():
        bid = row.board_id
        if bid not in severity_map:
            severity_map[bid] = {"board_id": bid, "critical": 0, "high": 0, "medium": 0, "low": 0}
        sev_key = row.severity.value if row.severity else "low"
        if sev_key in severity_map[bid]:
            severity_map[bid][sev_key] = row.cnt

    board_names = {r["board_id"]: r["board_name"] for r in bugs_per_board}
    severity_per_board = []
    for bid, data in severity_map.items():
        data["board_name"] = board_names.get(bid, "")
        severity_per_board.append(data)

    # ── priority per board ──
    ppb_result = await db.execute(
        select(Card.board_id, Card.priority, func.count().label("cnt"))
        .where(active_base())
        .group_by(Card.board_id, Card.priority)
    )
    priority_map = {}
    for row in ppb_result.all():
        bid = row.board_id
        if bid not in priority_map:
            priority_map[bid] = {"board_id": bid, "urgent": 0, "high": 0, "normal": 0, "low": 0}
        pri_key = row.priority.value if row.priority else "normal"
        if pri_key in priority_map[bid]:
            priority_map[bid][pri_key] = row.cnt

    priority_per_board = []
    for bid, data in priority_map.items():
        data["board_name"] = board_names.get(bid, "")
        priority_per_board.append(data)

    # ── global trend ──
    trend_end = now.date()
    trend_start = trend_end - timedelta(days=trend_days - 1)

    g_opened_result = await db.execute(
        select(func.date(Card.created_at).label("d"), func.count().label("cnt"))
        .where(
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.created_at >= datetime.combine(trend_start, datetime.min.time()),
        )
        .group_by(func.date(Card.created_at))
    )
    g_opened = {str(row.d): row.cnt for row in g_opened_result.all()}

    g_closed_result = await db.execute(
        select(func.date(Card.archived_at).label("d"), func.count().label("cnt"))
        .where(
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == True,
            Card.archived_at.isnot(None),
            Card.archived_at >= datetime.combine(trend_start, datetime.min.time()),
        )
        .group_by(func.date(Card.archived_at))
    )
    g_closed = {str(row.d): row.cnt for row in g_closed_result.all()}
    trend = _fill_trend(g_opened, g_closed, trend_start, trend_end)

    # ── top assignees ──
    ta_result = await db.execute(
        select(User.id, User.full_name, User.initials_color, func.count().label("cnt"))
        .join(CardAssignee, CardAssignee.user_id == User.id)
        .join(Card, and_(
            Card.id == CardAssignee.card_id,
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == False,
        ))
        .group_by(User.id, User.full_name, User.initials_color)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_assignees = [
        {"user_id": row.id, "full_name": row.full_name, "initials_color": row.initials_color, "count": row.cnt}
        for row in ta_result.all()
    ]

    # ── label usage ──
    lu_result = await db.execute(
        select(Label.name, Label.color, func.count(CardLabel.card_id).label("cnt"))
        .join(CardLabel, CardLabel.label_id == Label.id)
        .join(Card, and_(
            Card.id == CardLabel.card_id,
            Card.board_id.in_(board_ids),
            Card.is_deleted == False,
            Card.is_archived == False,
        ))
        .where(Label.board_id.in_(board_ids))
        .group_by(Label.name, Label.color)
        .order_by(func.count(CardLabel.card_id).desc())
        .limit(10)
    )
    label_usage = [
        {"label_name": row.name, "color": row.color, "count": row.cnt}
        for row in lu_result.all()
    ]

    return {
        "data": {
            "stats": {
                "total_boards": len(board_ids),
                "total_open_bugs": total_open,
                "critical_bugs_open": critical_open,
                "overdue_bugs": overdue,
                "resolved_this_week": resolved_week,
                "most_active_board": most_active_board,
            },
            "bugs_per_board": bugs_per_board,
            "severity_per_board": severity_per_board,
            "priority_per_board": priority_per_board,
            "trend": trend,
            "top_assignees": top_assignees,
            "label_usage": label_usage,
        }
    }
