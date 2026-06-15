import asyncio
import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from models.notification import Notification

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    type: str,
    created_by_id: int | None = None,
    payload: dict | None = None,
):
    """Append a notification row. Caller must commit."""
    db.add(Notification(
        user_id=user_id,
        type=type,
        created_by_id=created_by_id,
        payload_json=json.dumps(payload) if payload else None,
    ))
    # Push real-time notification via WebSocket (fire-and-forget)
    asyncio.create_task(_push_ws(user_id, type, created_by_id, payload))


async def _push_ws(user_id: int, notif_type: str, created_by_id: int | None, payload: dict | None) -> None:
    # Brief delay so the caller's db.commit() always finishes before the WS
    # message lands at the client (avoids a race where the client re-polls
    # before the notification row is committed).
    await asyncio.sleep(0.15)
    try:
        from services.ws_manager import manager
        await manager.send_to_user(user_id, {
            "type": "notification",
            "data": {
                "notif_type": notif_type,
                "created_by_id": created_by_id,
                "payload": payload,
            },
        })
        logger.debug("WS push sent: type=%s user_id=%d", notif_type, user_id)
    except Exception as e:
        logger.warning("WS push failed for user %d (type=%s): %s", user_id, notif_type, e)
