"""
Shared pytest fixtures for the Snagly backend test suite.

Fixture hierarchy (all session-scoped except db_session):

  test_db          — creates bugtrack_test DB + drops/recreates all tables
      └── seeded_db    — runs seed_data() once on top of clean tables
              └── async_client — httpx.AsyncClient wired to FastAPI + test DB
                      └── auth_headers — cached login-token factory
  db_session       — per-test DB session with automatic rollback (uses test_db)
"""
import os
import sys

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typing import AsyncGenerator

# Ensure imports resolve from the backend root regardless of cwd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from database import Base, get_db
from main import app  # noqa: F401 — registers all models with Base.metadata


# ---------------------------------------------------------------------------
# Test database URL
# ---------------------------------------------------------------------------

def _test_db_url() -> str:
    base, db_and_params = settings.DB_URL.rsplit("/", 1)
    params = db_and_params[len(db_and_params.split("?")[0]):]
    return f"{base}/bugtrack_test{params}"


TEST_DB_URL: str = os.getenv("TEST_DB_URL", _test_db_url())

# Module-level engine shared across the session
_engine = create_async_engine(TEST_DB_URL, echo=False, pool_pre_ping=True)
_SessionFactory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Session-scoped: schema management
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
async def test_db():
    """
    Create bugtrack_test if missing, then drop + recreate every table.
    Yields the session factory so other fixtures can open DB sessions.
    """
    # Verify the test DB is reachable (user must have pre-created it)
    probe = create_async_engine(TEST_DB_URL, echo=False)
    try:
        async with probe.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_name = TEST_DB_URL.rsplit("/", 1)[1].split("?")[0]
        app_user = TEST_DB_URL.split("//")[1].split(":")[0]
        pytest.exit(
            f"\n✗  Cannot connect to test database '{db_name}'.\n"
            f"   Run once as MySQL root:\n\n"
            f"     CREATE DATABASE IF NOT EXISTS `{db_name}`\n"
            f"       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
            f"     GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{app_user}'@'localhost';\n"
            f"     FLUSH PRIVILEGES;\n\n"
            f"   Original error: {exc}\n",
            returncode=1,
        )
    finally:
        await probe.dispose()

    # Drop all tables, then recreate — clean slate for every test run
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield _SessionFactory

    await _engine.dispose()


# ---------------------------------------------------------------------------
# Session-scoped: seed data
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
async def seeded_db(test_db):
    """
    Runs seed_data() once per session on top of the freshly created tables.
    Tests that need real data should depend on this; tests that only need
    the schema (e.g. testing unique-constraint violations) can use test_db.
    """
    from tests.seed import seed_data
    await seed_data(_engine)
    yield test_db


# ---------------------------------------------------------------------------
# Per-test: isolated DB session
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_session(test_db) -> AsyncGenerator[AsyncSession, None]:
    """
    Fresh session per test. Any writes are rolled back after the test,
    so tests are isolated even when they share the same DB.
    """
    async with test_db() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# Session-scoped: HTTP client wired to the test DB
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
async def async_client(seeded_db) -> AsyncGenerator[httpx.AsyncClient, None]:
    """
    httpx.AsyncClient that drives the FastAPI app in-process.
    All DB calls inside the app are redirected to bugtrack_test via
    the get_db dependency override.
    """
    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with seeded_db() as session:
            yield session

    app.dependency_overrides[get_db] = _override_db

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Session-scoped: cached token factory
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
async def auth_headers(async_client: httpx.AsyncClient):
    """
    Async factory that returns a dict of Bearer auth headers.
    Tokens are cached per email for the duration of the test session.

    Usage:
        async def test_something(async_client, auth_headers):
            headers = await auth_headers("owner@test.com", "Owner@1234")
            resp = await async_client.get("/api/v1/boards", headers=headers)
    """
    _cache: dict[str, dict[str, str]] = {}

    async def _make(email: str, password: str) -> dict[str, str]:
        if email not in _cache:
            resp = await async_client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            assert resp.status_code == 200, (
                f"Login failed for {email}: {resp.status_code} — {resp.text}"
            )
            data = resp.json()["data"]
            assert not data.get("requires_2fa"), (
                f"Seed user {email} has 2FA enabled — disable it in seed_data()"
            )
            _cache[email] = {"Authorization": f"Bearer {data['access_token']}"}
        return _cache[email]

    return _make
