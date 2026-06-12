"""
Email digest service.
Queries overdue/assigned/active cards per user and sends a summary email.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.user import User
from models.card import Card
from models.card import CardAssignee
from models.board import Board
from models.board_membership import BoardMembership
from models.list_ import List
from models.digest_preference import DigestPreference, DigestFrequency
from models.activity_log import ActivityLog
from services.email_service import send_email
from database import AsyncSessionLocal


async def _get_user_boards(user_id: int, db: AsyncSession) -> list:
    result = await db.execute(
        select(BoardMembership, Board)
        .join(Board, BoardMembership.board_id == Board.id)
        .where(BoardMembership.user_id == user_id, Board.is_archived == False)
    )
    return [(m, b) for m, b in result.all()]


async def _build_digest_data(user: User, db: AsyncSession, since: datetime) -> dict:
    memberships = await _get_user_boards(user.id, db)
    board_ids = [b.id for _, b in memberships]

    if not board_ids:
        return None

    now = datetime.now(timezone.utc)

    # Cards assigned to this user
    assigned_result = await db.execute(
        select(CardAssignee, Card, Board)
        .join(Card, CardAssignee.card_id == Card.id)
        .join(Board, Card.board_id == Board.id)
        .where(
            CardAssignee.user_id == user.id,
            Card.is_archived == False,
            Card.is_deleted == False,
            Card.board_id.in_(board_ids),
        )
    )
    assigned_rows = assigned_result.all()

    # Overdue assigned to me
    overdue = []
    for _, card, board in assigned_rows:
        if card.due_date and card.due_date < now:
            list_obj = await db.scalar(select(List).where(List.id == card.list_id))
            overdue.append({
                "title": card.title,
                "board": board.name,
                "list": list_obj.name if list_obj else "—",
                "due_date": card.due_date.strftime("%d %b %Y"),
                "card_id": card.id,
            })

    # Newly assigned since last digest
    newly_assigned = []
    for _, card, board in assigned_rows:
        if card.created_at and card.created_at >= since:
            newly_assigned.append({
                "title": card.title,
                "board": board.name,
                "card_id": card.id,
            })

    # My cards with new activity since last digest
    my_card_ids = [card.id for _, card, _ in assigned_rows]
    recent_activity = []
    if my_card_ids:
        activity_result = await db.execute(
            select(ActivityLog, Card, Board)
            .join(Card, ActivityLog.card_id == Card.id)
            .join(Board, Card.board_id == Board.id)
            .where(
                ActivityLog.card_id.in_(my_card_ids),
                ActivityLog.actor_id != user.id,
                ActivityLog.created_at >= since,
            )
            .order_by(ActivityLog.created_at.desc())
        )
        seen_cards = set()
        for log, card, board in activity_result.all():
            if card.id not in seen_cards:
                seen_cards.add(card.id)
                recent_activity.append({
                    "title": card.title,
                    "board": board.name,
                    "action": log.action_type,
                    "card_id": card.id,
                })

    # Board snapshots
    board_snapshots = []
    for _, board in memberships:
        total_open = await db.scalar(
            select(__import__("sqlalchemy", fromlist=["func"]).func.count())
            .select_from(Card)
            .where(Card.board_id == board.id, Card.is_archived == False, Card.is_deleted == False)
        ) or 0
        critical = await db.scalar(
            select(__import__("sqlalchemy", fromlist=["func"]).func.count())
            .select_from(Card)
            .where(Card.board_id == board.id, Card.is_archived == False,
                   Card.is_deleted == False, Card.severity == "critical")
        ) or 0
        board_snapshots.append({"name": board.name, "open": total_open, "critical": critical})

    return {
        "overdue": overdue,
        "newly_assigned": newly_assigned,
        "recent_activity": recent_activity,
        "board_snapshots": board_snapshots,
    }


def _render_digest_html(user: User, data: dict, frontend_url: str) -> str:
    def card_link(card_id: int) -> str:
        return f"{frontend_url}/boards?openCard={card_id}"

    rows_overdue = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #2a2f40'>"
        f"<a href='{card_link(c['card_id'])}' style='color:#6c63ff;text-decoration:none'>{c['title']}</a>"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#9ca3af'>{c['board']} / {c['list']}"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#ef4444'>{c['due_date']}</td></tr>"
        for c in data["overdue"]
    ) or "<tr><td colspan='3' style='padding:12px;color:#6b7280;text-align:center'>None 🎉</td></tr>"

    rows_new = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #2a2f40'>"
        f"<a href='{card_link(c['card_id'])}' style='color:#6c63ff;text-decoration:none'>{c['title']}</a>"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#9ca3af'>{c['board']}</td></tr>"
        for c in data["newly_assigned"]
    ) or "<tr><td colspan='2' style='padding:12px;color:#6b7280;text-align:center'>None</td></tr>"

    rows_activity = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #2a2f40'>"
        f"<a href='{card_link(c['card_id'])}' style='color:#6c63ff;text-decoration:none'>{c['title']}</a>"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#9ca3af'>{c['board']}"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#6b7280'>{c['action']}</td></tr>"
        for c in data["recent_activity"]
    ) or "<tr><td colspan='3' style='padding:12px;color:#6b7280;text-align:center'>No new activity</td></tr>"

    board_rows = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#e5e7eb'>{b['name']}"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#e5e7eb'>{b['open']}"
        f"</td><td style='padding:6px 12px;border-bottom:1px solid #2a2f40;color:#ef4444'>{b['critical']}</td></tr>"
        for b in data["board_snapshots"]
    )

    table_style = "width:100%;border-collapse:collapse;font-size:13px"
    th_style = "padding:8px 12px;background:#1e2435;color:#9ca3af;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em"

    return f"""
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#111827;font-family:system-ui,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#1a1f2e;border-radius:12px;overflow:hidden;border:1px solid #2a2f40">
  <div style="background:#6c63ff;padding:24px 32px">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Snagly Digest</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.7);font-size:13px">Hi {user.full_name} — here's your summary</p>
  </div>

  <div style="padding:24px 32px">
    <h2 style="color:#ef4444;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em">⚠ Overdue bugs assigned to you</h2>
    <table style="{table_style}"><thead><tr>
      <th style="{th_style}">Card</th><th style="{th_style}">Board / List</th><th style="{th_style}">Due</th>
    </tr></thead><tbody>{rows_overdue}</tbody></table>

    <h2 style="color:#6c63ff;font-size:14px;font-weight:700;margin:24px 0 12px;text-transform:uppercase;letter-spacing:.05em">🆕 Newly assigned to you</h2>
    <table style="{table_style}"><thead><tr>
      <th style="{th_style}">Card</th><th style="{th_style}">Board</th>
    </tr></thead><tbody>{rows_new}</tbody></table>

    <h2 style="color:#6b7280;font-size:14px;font-weight:700;margin:24px 0 12px;text-transform:uppercase;letter-spacing:.05em">💬 New activity on your cards</h2>
    <table style="{table_style}"><thead><tr>
      <th style="{th_style}">Card</th><th style="{th_style}">Board</th><th style="{th_style}">Action</th>
    </tr></thead><tbody>{rows_activity}</tbody></table>

    <h2 style="color:#9ca3af;font-size:14px;font-weight:700;margin:24px 0 12px;text-transform:uppercase;letter-spacing:.05em">📊 Board snapshot</h2>
    <table style="{table_style}"><thead><tr>
      <th style="{th_style}">Board</th><th style="{th_style}">Open bugs</th><th style="{th_style}">Critical</th>
    </tr></thead><tbody>{board_rows}</tbody></table>
  </div>

  <div style="padding:16px 32px;border-top:1px solid #2a2f40;text-align:center">
    <a href="{frontend_url}" style="color:#6c63ff;font-size:12px;text-decoration:none">Open Snagly</a>
    <span style="color:#374151;margin:0 8px">·</span>
    <a href="{frontend_url}/profile" style="color:#6b7280;font-size:12px;text-decoration:none">Manage digest preferences</a>
  </div>
</div>
</body></html>
"""


def _render_digest_text(user: User, data: dict) -> str:
    lines = [f"Snagly Digest for {user.full_name}", "=" * 40, ""]
    lines.append("OVERDUE BUGS ASSIGNED TO YOU")
    for c in data["overdue"]:
        lines.append(f"  - {c['title']} [{c['board']}] due {c['due_date']}")
    if not data["overdue"]:
        lines.append("  None — great work!")
    lines.append("")
    lines.append("NEWLY ASSIGNED TO YOU")
    for c in data["newly_assigned"]:
        lines.append(f"  - {c['title']} [{c['board']}]")
    if not data["newly_assigned"]:
        lines.append("  None")
    lines.append("")
    lines.append("NEW ACTIVITY ON YOUR CARDS")
    for c in data["recent_activity"]:
        lines.append(f"  - {c['title']} [{c['board']}]: {c['action']}")
    if not data["recent_activity"]:
        lines.append("  No new activity")
    lines.append("")
    lines.append("BOARD SNAPSHOT")
    for b in data["board_snapshots"]:
        lines.append(f"  {b['name']}: {b['open']} open, {b['critical']} critical")
    return "\n".join(lines)


async def send_digest_for_user(user_id: int, force: bool = False, frontend_url: str = "http://localhost:5173"):
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.id == user_id, User.is_active == True))
        if not user:
            return False

        pref = await db.scalar(select(DigestPreference).where(DigestPreference.user_id == user_id))
        if not pref or pref.frequency == DigestFrequency.off:
            return False

        now = datetime.now(timezone.utc)

        # Skip if recently logged in (active session within 2h) unless forced
        if not force and user.last_login_at and (now - user.last_login_at) < timedelta(hours=2):
            return False

        since = pref.last_sent_at or (now - timedelta(days=7))
        data = await _build_digest_data(user, db, since)

        if not data:
            return False

        # Skip if there's nothing meaningful to report (unless forced)
        has_content = any([data["overdue"], data["newly_assigned"], data["recent_activity"]])
        if not force and not has_content:
            return False

        html_body = _render_digest_html(user, data, frontend_url)
        text_body = _render_digest_text(user, data)

        try:
            await send_email(
                to_email=user.email,
                subject=f"Snagly digest — {now.strftime('%d %b %Y')}",
                html_body=html_body,
                text_body=text_body,
            )
        except Exception:
            return False

        # Update last_sent_at
        if pref:
            from sqlalchemy import update
            await db.execute(
                update(DigestPreference)
                .where(DigestPreference.user_id == user_id)
                .values(last_sent_at=now)
            )
            await db.commit()

        return True
