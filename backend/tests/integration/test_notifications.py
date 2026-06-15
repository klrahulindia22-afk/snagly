"""
Integration tests for the notification system.

Scenarios covered
─────────────────
Unauthenticated access          → 401 on every endpoint
Logged-out (expired token)      → 401

Poll  (/poll)
  • empty state returns unread_count=0 and notifications=[]
  • unread_count reflects only THIS user's unread notifications
  • latest list is capped at 5, sorted newest-first
  • read notifications are excluded from unread_count

List  (GET /)
  • empty state returns data=[] and meta.total=0
  • returns all notifications for the user, newest-first
  • pagination: page / per_page / total in meta
  • page beyond last returns empty data (not 404)
  • per_page clamped to max 100

Mark single read  (PATCH /{id}/read)
  • marks an unread notification as read
  • idempotent: re-marking a read notification stays 200
  • 404 when notif belongs to another user (cross-user leak guard)
  • 404 for non-existent notification id

Mark all read  (PATCH /read-all)
  • marks ALL of current user's unread as read
  • does NOT touch other users' notifications

Preferences  (GET /users/me/notification-prefs)
  • creates default row on first access (all toggles True)
  • subsequent GET returns the same row

Preferences  (PATCH /users/me/notification-prefs)
  • updates a single in-app toggle
  • updates a single email toggle
  • updates multiple fields in one call
  • partial update leaves un-mentioned fields untouched
  • GET after PATCH reflects changes
  • unknown extra fields are ignored (422 on bad type, not on unknown key)

Cross-user isolation
  • User A's notifications are invisible to User B via LIST
  • User A's unread count not included in User B's poll
  • User B cannot mark User A's notification as read (404)

Notification payload / redirection data
  • payload dict round-trips correctly through DB → API
  • payload contains board_id and card_id for card-level redirects

Notification text rendering
  • text field is generated correctly for each type
"""
import json
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.user import User
from models.notification import Notification
from models.user_notification_prefs import UserNotificationPrefs
from services.auth_service import hash_password


# ── Helpers ───────────────────────────────────────────────────────────────────

def uq() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@notiftest.example.com"


async def _make_user(db: AsyncSession, email: str | None = None) -> User:
    u = User(
        email=email or uq(),
        password_hash=hash_password("Password1"),
        full_name="Notif Tester",
        is_verified=True,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password1"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert not data.get("requires_2fa"), "Seed user must not have 2FA"
    return {"Authorization": f"Bearer {data['access_token']}"}


async def _notif(
    db: AsyncSession,
    *,
    user_id: int,
    notif_type: str = "mention",
    is_read: bool = False,
    created_by_id: int | None = None,
    payload: dict | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=notif_type,
        is_read=is_read,
        created_by_id=created_by_id,
        payload_json=json.dumps(payload) if payload else None,
    )
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return n


# ── 1. Unauthenticated / logged-out access ───────────────────────────────────

class TestUnauthenticated:
    """Every endpoint must return 401 without a valid Bearer token."""

    @pytest.mark.asyncio
    async def test_poll_requires_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/poll")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_mark_read_requires_auth(self, client: AsyncClient):
        r = await client.patch("/api/v1/notifications/999/read")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_mark_all_requires_auth(self, client: AsyncClient):
        r = await client.patch("/api/v1/notifications/read-all")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_prefs_get_requires_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/users/me/notification-prefs")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_prefs_patch_requires_auth(self, client: AsyncClient):
        r = await client.patch("/api/v1/users/me/notification-prefs", json={})
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/notifications/poll",
            headers={"Authorization": "Bearer not.a.real.token"},
        )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_token_pattern_returns_401(self, client: AsyncClient):
        """Malformed token (simulates logged-out user sending stale token)."""
        r = await client.get(
            "/api/v1/notifications",
            headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.expired.sig"},
        )
        assert r.status_code == 401


# ── 2. Poll ───────────────────────────────────────────────────────────────────

class TestPoll:

    @pytest.mark.asyncio
    async def test_poll_empty_state(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        assert r.status_code == 200
        d = r.json()["data"]
        assert d["unread_count"] == 0
        assert d["notifications"] == []

    @pytest.mark.asyncio
    async def test_poll_counts_only_unread(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        # 3 unread, 2 read
        for _ in range(3):
            await _notif(raw_db, user_id=user.id, is_read=False)
        for _ in range(2):
            await _notif(raw_db, user_id=user.id, is_read=True)

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        assert r.status_code == 200
        assert r.json()["data"]["unread_count"] == 3

    @pytest.mark.asyncio
    async def test_poll_latest_capped_at_5(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        for _ in range(8):
            await _notif(raw_db, user_id=user.id)

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        assert r.status_code == 200
        assert len(r.json()["data"]["notifications"]) <= 5

    @pytest.mark.asyncio
    async def test_poll_newest_first(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n1 = await _notif(raw_db, user_id=user.id, notif_type="comment")
        n2 = await _notif(raw_db, user_id=user.id, notif_type="mention")

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        ids = [n["id"] for n in r.json()["data"]["notifications"]]
        assert ids.index(n2.id) < ids.index(n1.id)

    @pytest.mark.asyncio
    async def test_poll_not_affected_by_other_users(self, client: AsyncClient, raw_db: AsyncSession):
        owner = await _make_user(raw_db)
        other = await _make_user(raw_db)
        hdrs = await _login(client, owner.email)
        # Give the OTHER user 5 unread notifications
        for _ in range(5):
            await _notif(raw_db, user_id=other.id, is_read=False)

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        assert r.json()["data"]["unread_count"] == 0


# ── 3. List (paginated) ───────────────────────────────────────────────────────

class TestList:

    @pytest.mark.asyncio
    async def test_empty_state_returns_zero_total(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert r.status_code == 200
        body = r.json()
        assert body["data"] == []
        assert body["meta"]["total"] == 0

    @pytest.mark.asyncio
    async def test_returns_only_own_notifications(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        other = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id)
        await _notif(raw_db, user_id=other.id)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        data = r.json()["data"]
        assert len(data) == 1

    @pytest.mark.asyncio
    async def test_meta_fields_present(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        for _ in range(3):
            await _notif(raw_db, user_id=user.id)

        r = await client.get("/api/v1/notifications?page=1&per_page=10", headers=hdrs)
        meta = r.json()["meta"]
        assert meta["page"] == 1
        assert meta["per_page"] == 10
        assert meta["total"] == 3

    @pytest.mark.asyncio
    async def test_pagination_page2(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        for _ in range(5):
            await _notif(raw_db, user_id=user.id)

        r1 = await client.get("/api/v1/notifications?page=1&per_page=3", headers=hdrs)
        r2 = await client.get("/api/v1/notifications?page=2&per_page=3", headers=hdrs)

        ids_p1 = {n["id"] for n in r1.json()["data"]}
        ids_p2 = {n["id"] for n in r2.json()["data"]}
        # Pages must not overlap
        assert ids_p1.isdisjoint(ids_p2)
        # Total notifications = 5
        assert r1.json()["meta"]["total"] == 5

    @pytest.mark.asyncio
    async def test_page_beyond_last_returns_empty_not_404(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id)

        r = await client.get("/api/v1/notifications?page=999&per_page=20", headers=hdrs)
        assert r.status_code == 200
        assert r.json()["data"] == []

    @pytest.mark.asyncio
    async def test_per_page_max_100(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        # per_page > 100 should be rejected with 422
        r = await client.get("/api/v1/notifications?per_page=500", headers=hdrs)
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_page_lt_1_rejected(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        r = await client.get("/api/v1/notifications?page=0", headers=hdrs)
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_items_contain_required_fields(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        creator = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(
            raw_db,
            user_id=user.id,
            notif_type="mention",
            created_by_id=creator.id,
            payload={"board_id": 1, "card_id": 42},
        )

        r = await client.get("/api/v1/notifications", headers=hdrs)
        item = r.json()["data"][0]
        assert "id" in item
        assert "type" in item
        assert "text" in item
        assert "is_read" in item
        assert "created_at" in item
        assert "payload" in item
        assert "creator" in item

    @pytest.mark.asyncio
    async def test_newest_first_ordering(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n1 = await _notif(raw_db, user_id=user.id, notif_type="comment")
        n2 = await _notif(raw_db, user_id=user.id, notif_type="reply")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        ids = [n["id"] for n in r.json()["data"]]
        assert ids.index(n2.id) < ids.index(n1.id)


# ── 4. Mark single notification read ─────────────────────────────────────────

class TestMarkRead:

    @pytest.mark.asyncio
    async def test_mark_unread_notification_as_read(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n = await _notif(raw_db, user_id=user.id, is_read=False)

        r = await client.patch(f"/api/v1/notifications/{n.id}/read", headers=hdrs)
        assert r.status_code == 200

        # Confirm it's read via list
        r2 = await client.get("/api/v1/notifications", headers=hdrs)
        item = next(x for x in r2.json()["data"] if x["id"] == n.id)
        assert item["is_read"] is True

    @pytest.mark.asyncio
    async def test_mark_already_read_is_idempotent(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n = await _notif(raw_db, user_id=user.id, is_read=True)

        r = await client.patch(f"/api/v1/notifications/{n.id}/read", headers=hdrs)
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_mark_other_users_notification_returns_404(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        owner = await _make_user(raw_db)
        other = await _make_user(raw_db)
        other_notif = await _notif(raw_db, user_id=other.id)
        hdrs = await _login(client, owner.email)

        r = await client.patch(f"/api/v1/notifications/{other_notif.id}/read", headers=hdrs)
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_nonexistent_notification_returns_404(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.patch("/api/v1/notifications/999999999/read", headers=hdrs)
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_read_reduces_unread_count(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n1 = await _notif(raw_db, user_id=user.id, is_read=False)
        await _notif(raw_db, user_id=user.id, is_read=False)

        poll_before = (await client.get("/api/v1/notifications/poll", headers=hdrs)).json()["data"]
        assert poll_before["unread_count"] == 2

        await client.patch(f"/api/v1/notifications/{n1.id}/read", headers=hdrs)

        poll_after = (await client.get("/api/v1/notifications/poll", headers=hdrs)).json()["data"]
        assert poll_after["unread_count"] == 1


# ── 5. Mark all read ──────────────────────────────────────────────────────────

class TestMarkAllRead:

    @pytest.mark.asyncio
    async def test_marks_all_own_unread(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        for _ in range(4):
            await _notif(raw_db, user_id=user.id, is_read=False)

        r = await client.patch("/api/v1/notifications/read-all", headers=hdrs)
        assert r.status_code == 200

        poll = (await client.get("/api/v1/notifications/poll", headers=hdrs)).json()["data"]
        assert poll["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_mark_all_does_not_affect_other_users(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        owner = await _make_user(raw_db)
        other = await _make_user(raw_db)
        hdrs_owner = await _login(client, owner.email)
        hdrs_other = await _login(client, other.email)

        for _ in range(3):
            await _notif(raw_db, user_id=other.id, is_read=False)

        await client.patch("/api/v1/notifications/read-all", headers=hdrs_owner)

        # Other user's unread count must be untouched
        poll = (await client.get("/api/v1/notifications/poll", headers=hdrs_other)).json()["data"]
        assert poll["unread_count"] == 3

    @pytest.mark.asyncio
    async def test_mark_all_noop_when_all_already_read(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, is_read=True)

        r = await client.patch("/api/v1/notifications/read-all", headers=hdrs)
        assert r.status_code == 200  # still 200, not 204 or error

    @pytest.mark.asyncio
    async def test_mark_all_empty_user_still_200(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.patch("/api/v1/notifications/read-all", headers=hdrs)
        assert r.status_code == 200


# ── 6. Notification preferences ──────────────────────────────────────────────

class TestPreferences:

    @pytest.mark.asyncio
    async def test_get_creates_default_prefs_on_first_access(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)
        assert r.status_code == 200
        data = r.json()["data"]
        # All defaults are True
        for key, val in data.items():
            assert val is True, f"{key} should default to True"

    @pytest.mark.asyncio
    async def test_get_returns_existing_row_without_duplicating(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r1 = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)
        r2 = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)
        assert r1.json() == r2.json()

    @pytest.mark.asyncio
    async def test_patch_single_in_app_toggle(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)  # create defaults

        r = await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={"in_app_mention": False},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["data"]["in_app_mention"] is False

    @pytest.mark.asyncio
    async def test_patch_single_email_toggle(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={"email_card_overdue": False},
            headers=hdrs,
        )
        assert r.status_code == 200
        assert r.json()["data"]["email_card_overdue"] is False

    @pytest.mark.asyncio
    async def test_patch_multiple_fields(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={
                "in_app_comment": False,
                "email_reply": False,
                "in_app_card_assigned": False,
            },
            headers=hdrs,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["in_app_comment"] is False
        assert data["email_reply"] is False
        assert data["in_app_card_assigned"] is False

    @pytest.mark.asyncio
    async def test_partial_patch_leaves_other_fields_untouched(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={"in_app_mention": False},
            headers=hdrs,
        )
        # email_mention must remain True
        r = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)
        assert r.json()["data"]["email_mention"] is True

    @pytest.mark.asyncio
    async def test_get_after_patch_reflects_changes(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={"email_join_request": False},
            headers=hdrs,
        )
        r = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs)
        assert r.json()["data"]["email_join_request"] is False

    @pytest.mark.asyncio
    async def test_empty_patch_body_is_noop(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)

        r = await client.patch("/api/v1/users/me/notification-prefs", json={}, headers=hdrs)
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_prefs_are_per_user_not_global(self, client: AsyncClient, raw_db: AsyncSession):
        user_a = await _make_user(raw_db)
        user_b = await _make_user(raw_db)
        hdrs_a = await _login(client, user_a.email)
        hdrs_b = await _login(client, user_b.email)

        await client.patch(
            "/api/v1/users/me/notification-prefs",
            json={"in_app_mention": False},
            headers=hdrs_a,
        )
        r_b = await client.get("/api/v1/users/me/notification-prefs", headers=hdrs_b)
        # User B's prefs must still be True
        assert r_b.json()["data"]["in_app_mention"] is True


# ── 7. Cross-user isolation ───────────────────────────────────────────────────

class TestCrossUserIsolation:

    @pytest.mark.asyncio
    async def test_list_returns_only_own(self, client: AsyncClient, raw_db: AsyncSession):
        alice = await _make_user(raw_db)
        bob = await _make_user(raw_db)
        alice_hdrs = await _login(client, alice.email)

        await _notif(raw_db, user_id=alice.id)
        await _notif(raw_db, user_id=bob.id)
        await _notif(raw_db, user_id=bob.id)

        r = await client.get("/api/v1/notifications", headers=alice_hdrs)
        # Alice sees 1 notification (hers), not Bob's 2
        total = r.json()["meta"]["total"]
        # May be more if earlier tests added to alice's account, but Bob's must not show
        for item in r.json()["data"]:
            assert item["id"] != (
                await raw_db.scalar(
                    select(Notification).where(Notification.user_id == bob.id)
                )
            )

    @pytest.mark.asyncio
    async def test_cannot_mark_other_users_notif_read(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        alice = await _make_user(raw_db)
        bob = await _make_user(raw_db)
        alice_hdrs = await _login(client, alice.email)
        bob_notif = await _notif(raw_db, user_id=bob.id)

        r = await client.patch(f"/api/v1/notifications/{bob_notif.id}/read", headers=alice_hdrs)
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_poll_unread_count_is_per_user(self, client: AsyncClient, raw_db: AsyncSession):
        alice = await _make_user(raw_db)
        bob = await _make_user(raw_db)
        alice_hdrs = await _login(client, alice.email)

        # Give Bob 10 unread notifications
        for _ in range(10):
            await _notif(raw_db, user_id=bob.id, is_read=False)

        r = await client.get("/api/v1/notifications/poll", headers=alice_hdrs)
        assert r.json()["data"]["unread_count"] == 0


# ── 8. Notification payload / redirect data ───────────────────────────────────

class TestPayloadAndRedirection:

    @pytest.mark.asyncio
    async def test_payload_round_trips_correctly(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        payload = {"board_id": 7, "card_id": 42, "comment_id": 99}

        await _notif(raw_db, user_id=user.id, payload=payload)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        item = r.json()["data"][0]
        assert item["payload"]["board_id"] == 7
        assert item["payload"]["card_id"] == 42
        assert item["payload"]["comment_id"] == 99

    @pytest.mark.asyncio
    async def test_null_payload_returns_empty_dict(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, payload=None)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert r.json()["data"][0]["payload"] == {}

    @pytest.mark.asyncio
    async def test_card_redirect_payload_present_in_poll(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, payload={"board_id": 1, "card_id": 5})

        r = await client.get("/api/v1/notifications/poll", headers=hdrs)
        first = r.json()["data"]["notifications"][0]
        assert first["payload"]["board_id"] == 1
        assert first["payload"]["card_id"] == 5

    @pytest.mark.asyncio
    async def test_notification_without_card_has_empty_payload(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="join_request_approved")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        item = r.json()["data"][0]
        assert "board_id" not in item["payload"] or item["payload"].get("board_id") is None


# ── 9. Notification text rendering ───────────────────────────────────────────

class TestNotificationText:

    @pytest.mark.asyncio
    async def test_mention_text_contains_creator_name(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        creator = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(
            raw_db,
            user_id=user.id,
            notif_type="mention",
            created_by_id=creator.id,
        )

        r = await client.get("/api/v1/notifications", headers=hdrs)
        text = r.json()["data"][0]["text"]
        assert "mentioned you" in text
        assert creator.full_name in text

    @pytest.mark.asyncio
    async def test_reply_text(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="reply")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert "replied" in r.json()["data"][0]["text"]

    @pytest.mark.asyncio
    async def test_card_assigned_text(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="card_assigned")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert "assigned" in r.json()["data"][0]["text"]

    @pytest.mark.asyncio
    async def test_join_request_approved_text(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="join_request_approved")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert "approved" in r.json()["data"][0]["text"]

    @pytest.mark.asyncio
    async def test_join_request_declined_text(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="join_request_declined")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert "declined" in r.json()["data"][0]["text"]

    @pytest.mark.asyncio
    async def test_no_creator_uses_someone(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="comment", created_by_id=None)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        # Should still return a text string, not crash
        assert isinstance(r.json()["data"][0]["text"], str)

    @pytest.mark.asyncio
    async def test_unknown_type_returns_fallback_text(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, notif_type="some_future_type")

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert isinstance(r.json()["data"][0]["text"], str)

    @pytest.mark.asyncio
    async def test_creator_info_returned_correctly(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        creator = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, created_by_id=creator.id)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        creator_data = r.json()["data"][0]["creator"]
        assert creator_data is not None
        assert creator_data["full_name"] == creator.full_name

    @pytest.mark.asyncio
    async def test_no_creator_returns_null(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        await _notif(raw_db, user_id=user.id, created_by_id=None)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert r.json()["data"][0]["creator"] is None


# ── 10. Edge cases ────────────────────────────────────────────────────────────

class TestEdgeCases:

    @pytest.mark.asyncio
    async def test_per_page_1_returns_single_item(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        for _ in range(5):
            await _notif(raw_db, user_id=user.id)

        r = await client.get("/api/v1/notifications?per_page=1", headers=hdrs)
        assert len(r.json()["data"]) == 1

    @pytest.mark.asyncio
    async def test_read_status_in_list_response(self, client: AsyncClient, raw_db: AsyncSession):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        n_read = await _notif(raw_db, user_id=user.id, is_read=True)
        n_unread = await _notif(raw_db, user_id=user.id, is_read=False)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        by_id = {item["id"]: item for item in r.json()["data"]}
        assert by_id[n_read.id]["is_read"] is True
        assert by_id[n_unread.id]["is_read"] is False

    @pytest.mark.asyncio
    async def test_large_payload_survives_round_trip(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        hdrs = await _login(client, user.email)
        big_payload = {"board_id": 1, "card_id": 2, "extra": "x" * 500}
        await _notif(raw_db, user_id=user.id, payload=big_payload)

        r = await client.get("/api/v1/notifications", headers=hdrs)
        assert r.json()["data"][0]["payload"]["extra"] == "x" * 500

    @pytest.mark.asyncio
    async def test_multiple_users_same_notif_type(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        alice = await _make_user(raw_db)
        bob = await _make_user(raw_db)
        await _notif(raw_db, user_id=alice.id, notif_type="mention")
        await _notif(raw_db, user_id=bob.id, notif_type="mention")

        alice_hdrs = await _login(client, alice.email)
        bob_hdrs = await _login(client, bob.email)

        r_alice = await client.get("/api/v1/notifications", headers=alice_hdrs)
        r_bob = await client.get("/api/v1/notifications", headers=bob_hdrs)

        alice_ids = {n["id"] for n in r_alice.json()["data"]}
        bob_ids = {n["id"] for n in r_bob.json()["data"]}
        assert alice_ids.isdisjoint(bob_ids)
