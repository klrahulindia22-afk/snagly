import json
from sqlalchemy.ext.asyncio import AsyncSession
from models.activity_log import ActivityLog


async def log_activity(
    db: AsyncSession,
    *,
    board_id: int,
    user_id: int,
    action: str,
    card_id: int | None = None,
    detail: dict | None = None,
):
    """Append an activity entry. Caller must commit."""
    db.add(ActivityLog(
        board_id=board_id,
        card_id=card_id,
        user_id=user_id,
        action=action,
        detail_json=json.dumps(detail) if detail else None,
    ))
