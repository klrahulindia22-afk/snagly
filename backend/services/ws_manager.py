import asyncio
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # user_id → list[WebSocket]  (same user can have multiple tabs)
        self.user_connections: dict[int, list[WebSocket]] = {}
        # board_id → set[user_id]  (who is currently subscribed to board events)
        self.board_viewers: dict[int, set[int]] = {}

    async def connect(self, ws: WebSocket, user_id: int) -> None:
        await ws.accept()
        self.user_connections.setdefault(user_id, []).append(ws)

    def disconnect(self, ws: WebSocket, user_id: int) -> None:
        conns = self.user_connections.get(user_id, [])
        try:
            conns.remove(ws)
        except ValueError:
            pass
        if not conns:
            self.user_connections.pop(user_id, None)
        # Remove from all board subscriptions
        for viewers in self.board_viewers.values():
            viewers.discard(user_id)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        conns = list(self.user_connections.get(user_id, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self.user_connections[user_id].remove(ws)
            except (ValueError, KeyError):
                pass

    async def broadcast_to_board(self, board_id: int, message: dict) -> None:
        viewers = list(self.board_viewers.get(board_id, set()))
        if not viewers:
            return
        await asyncio.gather(
            *[self.send_to_user(uid, message) for uid in viewers],
            return_exceptions=True,
        )

    def subscribe_board(self, user_id: int, board_id: int) -> None:
        self.board_viewers.setdefault(board_id, set()).add(user_id)

    def unsubscribe_board(self, user_id: int, board_id: int) -> None:
        self.board_viewers.get(board_id, set()).discard(user_id)

    @property
    def connected_users(self) -> int:
        return len(self.user_connections)


manager = ConnectionManager()
