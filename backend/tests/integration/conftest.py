"""
Shared fixtures for integration tests.

DB selection (in order of preference):
  1. TEST_DB_URL env var (explicit override)
  2. bugtrack_test database using the same credentials as DB_URL
  3. Falls back to main bugtrack DB if bugtrack_test is inaccessible

Each test creates users with emails prefixed `test_<uuid>@` so they
never collide with real data. A session-scoped teardown deletes them.
"""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from main import app
from database import get_db
from config import settings

# ── Derive test DB URL ────────────────────────────────────────────────────────

def _build_test_db_url() -> str:
    explicit = os.environ.get("TEST_DB_URL")
    if explicit:
        return explicit
    # Swap only the database name (last path segment)
    return settings.DB_URL.rsplit("/", 1)[0] + "/bugtrack_test"


TEST_DB_URL = _build_test_db_url()

_engine = create_async_engine(TEST_DB_URL, echo=False)
_TestSession = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db():
    async with _TestSession() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


# ── Cleanup: remove test users after the session ──────────────────────────────

@pytest_asyncio.fixture(autouse=True, scope="session")
async def _cleanup_test_users():
    yield
    async with _TestSession() as session:
        # Delete child records before users to avoid FK constraint failures.
        # webhook_events have no FK to users, so order within these is safe.
        await session.execute(text(
            "DELETE FROM admin_audit_logs WHERE admin_id IN "
            "(SELECT id FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\')"
        ))
        await session.execute(text(
            "DELETE FROM invoices WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\')"
        ))
        await session.execute(text(
            "DELETE FROM coupon_redemptions WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\')"
        ))
        await session.execute(text(
            "DELETE FROM payment_methods WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\')"
        ))
        # Clear subscription FK on user before deleting subscriptions
        await session.execute(text(
            "UPDATE users SET subscription_id = NULL "
            "WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\'"
        ))
        await session.execute(text(
            "DELETE FROM subscriptions WHERE user_id IN "
            "(SELECT id FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\')"
        ))
        await session.execute(text(
            "DELETE FROM users WHERE email LIKE 'test\\_%%@%%' ESCAPE '\\\\'"
        ))
        await session.commit()


# ── HTTP client ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Raw DB access for test setup ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def raw_db():
    """Direct session for injecting known state (OTPs, reset tokens, etc.)."""
    async with _TestSession() as session:
        yield session
