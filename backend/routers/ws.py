from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from services.ws_manager import manager

ws_router = APIRouter(tags=["websocket"])


async def _authenticate_ws(token: str) -> int | None:
    """Validate JWT and return user_id, or None on failure."""
    from jose import JWTError, jwt
    from config import settings
    from database import AsyncSessionLocal
    from models.user import User

    try:
        payload = jwt.decode(token, settings.APP_SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            return None
        async with AsyncSessionLocal() as db:
            user = await db.scalar(
                select(User).where(User.id == user_id, User.is_active == True)
            )
        return user.id if user else None
    except (JWTError, Exception):
        return None


async def _is_board_member(user_id: int, board_id: int) -> bool:
    from database import AsyncSessionLocal
    from models.board_membership import BoardMembership

    async with AsyncSessionLocal() as db:
        m = await db.scalar(
            select(BoardMembership).where(
                BoardMembership.board_id == board_id,
                BoardMembership.user_id == user_id,
            )
        )
    return m is not None


@ws_router.websocket("/api/v1/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(...),
):
    user_id = await _authenticate_ws(token)
    if not user_id:
        await ws.close(code=4001)
        return

    await manager.connect(ws, user_id)
    try:
        while True:
            try:
                data = await ws.receive_json()
            except Exception:
                break

            msg_type = data.get("type")
            board_id = data.get("board_id")

            if msg_type == "subscribe_board" and board_id:
                bid = int(board_id)
                if await _is_board_member(user_id, bid):
                    manager.subscribe_board(user_id, bid)
                    await ws.send_json({"type": "subscribed", "board_id": bid})
                else:
                    await ws.send_json({"type": "error", "message": "Not a board member"})

            elif msg_type == "unsubscribe_board" and board_id:
                manager.unsubscribe_board(user_id, int(board_id))

            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws, user_id)
