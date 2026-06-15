"""Integration tests for Phase 16d + 16e subscription and admin endpoints.

Test cases:
1.  GET /plans returns all active plans with feature flags
2.  GET /subscriptions/me (no subscription) returns Free plan + correct limits
3.  POST /subscriptions/cancel sets cancel_at_period_end=True
4.  POST /subscriptions/apply-coupon with invalid code → 404
5.  POST /subscriptions/apply-coupon with depleted code → 409
6.  POST /subscriptions/upgrade as client role → 403
7.  GET /admin/subscriptions as non-admin → 403
8.  PATCH /admin/subscriptions/:id writes to AdminAuditLog
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.admin_audit_log import AdminAuditLog
from models.coupon import Coupon
from models.plan import Plan, PlanFeatureFlag
from models.subscription import Subscription, SubscriptionGateway, SubscriptionStatus
from models.user import User, UserRole
from services.auth_service import hash_password


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _uemail(suffix: str = "subtest") -> str:
    return f"test_{uuid.uuid4().hex[:8]}@{suffix}.example.com"


async def _make_user(
    db: AsyncSession,
    *,
    email: str | None = None,
    role: UserRole = UserRole.owner,
) -> User:
    u = User(
        email=email or _uemail(),
        password_hash=hash_password("Password1"),
        full_name="Sub Test User",
        is_verified=True,
        is_active=True,
        role=role,
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
    assert not data.get("requires_2fa")
    return {"Authorization": f"Bearer {data['access_token']}"}


async def _ensure_free_plan(db: AsyncSession) -> Plan:
    """Return the free plan, creating it (and feature flags) if it doesn't exist."""
    plan = await db.scalar(select(Plan).where(Plan.name == "free"))
    if plan is None:
        plan = Plan(
            name="free",
            display_name="Free",
            price_monthly=Decimal("0.00"),
            price_yearly=Decimal("0.00"),
            is_active=True,
            sort_order=0,
        )
        db.add(plan)
        await db.flush()

        for key, is_enabled, limit in [
            ("max_boards", True, 1),
            ("max_members_per_board", True, 3),
            ("storage_gb", True, 0),
        ]:
            db.add(PlanFeatureFlag(plan_id=plan.id, feature_key=key,
                                  is_enabled=is_enabled, limit_value=limit))
        await db.commit()
        await db.refresh(plan)
    return plan


async def _ensure_pro_plan(db: AsyncSession) -> Plan:
    plan = await db.scalar(select(Plan).where(Plan.name == "pro"))
    if plan is None:
        plan = Plan(
            name="pro",
            display_name="Pro",
            price_monthly=Decimal("9.99"),
            price_yearly=Decimal("99.00"),
            is_active=True,
            sort_order=1,
        )
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
    return plan


# ─── Test 1: GET /plans returns active plans with feature flags ───────────────

class TestListPlans:
    async def test_returns_active_plans_with_feature_flags(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        await _ensure_free_plan(raw_db)

        r = await client.get("/api/v1/plans")
        assert r.status_code == 200

        body = r.json()
        plans = body["data"]
        assert len(plans) >= 1, "Expected at least the Free plan"

        # Every plan must have a feature_flags list
        for plan in plans:
            assert "feature_flags" in plan
            assert isinstance(plan["feature_flags"], list)

        # Cache-Control must be set
        assert "cache-control" in r.headers
        assert "max-age=60" in r.headers["cache-control"]

    async def test_inactive_plans_not_returned(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        draft = Plan(
            name=f"draft_{uuid.uuid4().hex[:6]}",
            display_name="Draft Plan",
            price_monthly=Decimal("0.00"),
            price_yearly=Decimal("0.00"),
            is_active=False,
            sort_order=99,
        )
        raw_db.add(draft)
        await raw_db.commit()

        r = await client.get("/api/v1/plans")
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["data"]]
        assert draft.name not in names


# ─── Test 2: GET /subscriptions/me — no subscription → Free plan + limits ─────

class TestMySubscription:
    async def test_no_subscription_returns_free_plan(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        await _ensure_free_plan(raw_db)
        user = await _make_user(raw_db)
        headers = await _login(client, user.email)

        r = await client.get("/api/v1/subscriptions/me", headers=headers)
        assert r.status_code == 200

        body = r.json()["data"]
        assert body["subscription"] is None
        assert body["plan"]["name"] == "free"

        usage = body["usage"]
        assert usage["boards_used"] == 0
        assert usage["boards_limit"] is not None
        assert usage["members_limit"] is not None
        assert usage["storage_used_bytes"] == 0

    async def test_requires_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/subscriptions/me")
        assert r.status_code == 401


# ─── Test 3: POST /subscriptions/cancel sets cancel_at_period_end ─────────────

class TestCancelSubscription:
    @pytest_asyncio.fixture
    async def user_with_sub(self, raw_db: AsyncSession):
        plan = await _ensure_pro_plan(raw_db)
        user = await _make_user(raw_db)
        sub = Subscription(
            user_id=user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.active,
            gateway=SubscriptionGateway.stripe,
            gateway_subscription_id=f"sub_test_{uuid.uuid4().hex[:8]}",
            cancel_at_period_end=False,
        )
        raw_db.add(sub)
        await raw_db.commit()
        await raw_db.refresh(sub)
        return user, sub

    async def test_cancel_sets_flag(
        self, client: AsyncClient, user_with_sub
    ):
        user, sub = user_with_sub
        headers = await _login(client, user.email)

        with patch("services.stripe_service.cancel_subscription", new_callable=AsyncMock):
            r = await client.post(
                "/api/v1/subscriptions/cancel",
                json={"reason": "too expensive"},
                headers=headers,
            )

        assert r.status_code == 200, r.text
        # Check the response directly — avoids MySQL REPEATABLE_READ snapshot issues
        data = r.json()["data"]
        assert data["cancel_at_period_end"] is True


# ─── Test 4: Apply coupon — invalid code → 404 ────────────────────────────────

class TestApplyCoupon:
    async def test_invalid_code_returns_404(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db)
        headers = await _login(client, user.email)

        r = await client.post(
            "/api/v1/subscriptions/apply-coupon",
            json={"code": "DOESNOTEXIST"},
            headers=headers,
        )
        assert r.status_code == 404

    async def test_depleted_coupon_returns_409(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        coupon = Coupon(
            code=f"USED{uuid.uuid4().hex[:6].upper()}",
            discount_type="percent",
            discount_value=Decimal("10.00"),
            max_uses=1,
            times_used=1,
            is_active=True,
        )
        raw_db.add(coupon)
        await raw_db.commit()

        user = await _make_user(raw_db)
        headers = await _login(client, user.email)

        r = await client.post(
            "/api/v1/subscriptions/apply-coupon",
            json={"code": coupon.code},
            headers=headers,
        )
        assert r.status_code == 409


# ─── Test 5: Upgrade as client role → 403 ────────────────────────────────────

class TestClientRoleBlocked:
    async def test_upgrade_blocked_for_client(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        plan = await _ensure_pro_plan(raw_db)
        user = await _make_user(raw_db, role=UserRole.client)
        headers = await _login(client, user.email)

        r = await client.post(
            "/api/v1/subscriptions/upgrade",
            json={"plan_id": plan.id},
            headers=headers,
        )
        assert r.status_code == 403

    async def test_checkout_blocked_for_client(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        plan = await _ensure_pro_plan(raw_db)
        user = await _make_user(raw_db, role=UserRole.client)
        headers = await _login(client, user.email)

        r = await client.post(
            "/api/v1/subscriptions/checkout",
            json={"plan_id": plan.id, "billing_cycle": "monthly"},
            headers=headers,
        )
        assert r.status_code == 403


# ─── Test 6: GET /admin/subscriptions as non-admin → 403 ─────────────────────

class TestAdminSubscriptions:
    async def test_non_admin_cannot_list_subscriptions(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        user = await _make_user(raw_db, role=UserRole.team)
        headers = await _login(client, user.email)

        r = await client.get("/api/v1/admin/subscriptions", headers=headers)
        assert r.status_code == 403

    async def test_unauthenticated_gets_401(self, client: AsyncClient):
        r = await client.get("/api/v1/admin/subscriptions")
        assert r.status_code == 401

    async def test_admin_can_list_subscriptions(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        admin = await _make_user(raw_db, role=UserRole.super_admin)
        headers = await _login(client, admin.email)

        r = await client.get("/api/v1/admin/subscriptions", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert "meta" in body


# ─── Test 7: PATCH /admin/subscriptions/:id writes AdminAuditLog ──────────────

class TestAdminSubscriptionPatch:
    @pytest_asyncio.fixture
    async def admin_and_sub(self, raw_db: AsyncSession):
        admin = await _make_user(raw_db, role=UserRole.super_admin)
        plan_a = await _ensure_free_plan(raw_db)
        plan_b = await _ensure_pro_plan(raw_db)
        target_user = await _make_user(raw_db)
        sub = Subscription(
            user_id=target_user.id,
            plan_id=plan_a.id,
            status=SubscriptionStatus.active,
            gateway=SubscriptionGateway.stripe,
            gateway_subscription_id=f"sub_admin_{uuid.uuid4().hex[:8]}",
        )
        raw_db.add(sub)
        await raw_db.commit()
        await raw_db.refresh(sub)
        return admin, sub, plan_b

    async def test_patch_writes_audit_log(
        self, client: AsyncClient, raw_db: AsyncSession, admin_and_sub
    ):
        admin, sub, plan_b = admin_and_sub
        headers = await _login(client, admin.email)

        r = await client.patch(
            f"/api/v1/admin/subscriptions/{sub.id}",
            json={"plan_id": plan_b.id},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # Commit to end the REPEATABLE_READ snapshot so we see the endpoint's commit
        await raw_db.commit()
        log = await raw_db.scalar(
            select(AdminAuditLog).where(
                AdminAuditLog.admin_id == admin.id,
                AdminAuditLog.action == "override_subscription_plan",
                AdminAuditLog.target_id == sub.id,
            )
        )
        assert log is not None, "AdminAuditLog entry must be written"
        assert "new_plan_id" in log.detail_json

    async def test_patch_404_on_missing_subscription(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        admin = await _make_user(raw_db, role=UserRole.super_admin)
        headers = await _login(client, admin.email)

        r = await client.patch(
            "/api/v1/admin/subscriptions/9999999",
            json={"plan_id": 1},
            headers=headers,
        )
        assert r.status_code == 404
