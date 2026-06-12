import asyncio
import json
from sqlalchemy.ext.asyncio import AsyncSession
from models.notification import Notification


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
    except Exception:
        pass
