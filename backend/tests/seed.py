"""
Test data seed — idempotent, safe to run multiple times.

Standalone:
    python -m tests.seed

From conftest (tables already created):
    from tests.seed import seed_data
    await seed_data(engine)
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, text

# Import all models so Base.metadata is fully populated
from main import app  # noqa: F401 — triggers all router/model imports
from database import Base
from config import settings
from models.user import User, UserRole
from models.board import Board
from models.board_membership import BoardMembership
from models.list_ import List
from models.card import Card
from services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Test DB URL — replace production DB name with bugtrack_test
# ---------------------------------------------------------------------------
def _make_test_db_url() -> str:
    base, db_and_params = settings.DB_URL.rsplit("/", 1)
    params = db_and_params[len(db_and_params.split("?")[0]):]  # keep "?..." if present
    return f"{base}/bugtrack_test{params}"


TEST_DB_URL = os.getenv("TEST_DB_URL", _make_test_db_url())


# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

async def _ensure_database(db_url: str) -> None:
    """
    Ensure the test database exists.
    Tries three approaches in order:
      1. Connect directly (DB already exists)
      2. CREATE DATABASE via MYSQL_ADMIN_URL env var (if set)
      3. Print manual instructions and exit
    """
    # 1 — Test DB already accessible?
    probe = create_async_engine(db_url, echo=False)
    try:
        async with probe.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return  # DB exists and is reachable
    except Exception:
        pass
    finally:
        await probe.dispose()

    # 2 — Try creating it via an admin URL
    admin_url = os.getenv("MYSQL_ADMIN_URL")
    if admin_url:
        admin_engine = create_async_engine(admin_url, echo=False)
        try:
            async with admin_engine.connect() as conn:
                db_name = db_url.rsplit("/", 1)[1].split("?")[0]
                await conn.execute(
                    text(
                        f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                        f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                )
                # Grant the app user access
                app_user = db_url.split("//")[1].split(":")[0]
                await conn.execute(
                    text(f"GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{app_user}'@'localhost'")
                )
                await conn.execute(text("FLUSH PRIVILEGES"))
                await conn.commit()
            return
        finally:
            await admin_engine.dispose()

    # 3 — Neither worked; print instructions and abort
    db_name = db_url.rsplit("/", 1)[1].split("?")[0]
    app_user = db_url.split("//")[1].split(":")[0]
    print("\n[ERROR] Cannot reach test database and MYSQL_ADMIN_URL is not set.")
    print("   Run these commands once as MySQL root:\n")
    print(f'   CREATE DATABASE IF NOT EXISTS `{db_name}`')
    print(f'     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
    print(f"   GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{app_user}'@'localhost';")
    print(f'   FLUSH PRIVILEGES;\n')
    print("   Or set MYSQL_ADMIN_URL=mysql+aiomysql://root:PASSWORD@localhost:3306/")
    print("   and re-run.\n")
    sys.exit(1)


async def _create_tables(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

async def _get_or_create_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    password: str,
    role: UserRole,
) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        is_verified=True,   # pre-verified — tests should not hit the OTP flow
        email_otp_attempts=0,
    )
    db.add(user)
    await db.flush()
    return user


async def _get_or_create_board(
    db: AsyncSession,
    name: str,
    owner: User,
    description: str = "",
) -> Board:
    board = await db.scalar(
        select(Board).where(Board.name == name, Board.owner_id == owner.id)
    )
    if board:
        return board
    board = Board(name=name, owner_id=owner.id, description=description)
    db.add(board)
    await db.flush()
    return board


async def _ensure_membership(
    db: AsyncSession,
    board: Board,
    user: User,
    role: UserRole,
) -> None:
    exists = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board.id,
            BoardMembership.user_id == user.id,
        )
    )
    if not exists:
        db.add(BoardMembership(board_id=board.id, user_id=user.id, role=role))


async def _get_or_create_list(
    db: AsyncSession,
    board: Board,
    name: str,
    position: int,
) -> List:
    lst = await db.scalar(
        select(List).where(List.board_id == board.id, List.name == name)
    )
    if lst:
        return lst
    lst = List(board_id=board.id, name=name, position=position)
    db.add(lst)
    await db.flush()
    return lst


async def _get_or_create_card(
    db: AsyncSession,
    board: Board,
    list_: List,
    title: str,
    position: int,
    created_by: User,
) -> Card:
    card = await db.scalar(
        select(Card).where(Card.list_id == list_.id, Card.title == title)
    )
    if card:
        return card
    card = Card(
        board_id=board.id,
        list_id=list_.id,
        title=title,
        position=position,
        created_by_id=created_by.id,
    )
    db.add(card)
    await db.flush()
    return card


# ---------------------------------------------------------------------------
# Main seed function (data only — tables must already exist)
# ---------------------------------------------------------------------------

async def seed_data(engine) -> None:
    """Insert all test fixtures. Safe to call multiple times (idempotent)."""
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:

        # ── Users ────────────────────────────────────────────────────────────
        super_admin = await _get_or_create_user(
            db, "admin@test.com", "Super Admin", "Admin@1234", UserRole.super_admin
        )
        board_owner = await _get_or_create_user(
            db, "owner@test.com", "Board Owner", "Owner@1234", UserRole.owner
        )
        team_member = await _get_or_create_user(
            db, "team@test.com", "Team Member", "Team@1234", UserRole.team
        )
        client_user = await _get_or_create_user(
            db, "client@test.com", "Client User", "Client@1234", UserRole.client
        )
        other_owner = await _get_or_create_user(
            db, "other@test.com", "Other Owner", "Other@1234", UserRole.owner
        )
        await db.commit()

        # ── Test Board ───────────────────────────────────────────────────────
        test_board = await _get_or_create_board(
            db, "Test Board", board_owner, "Primary test board"
        )
        await _ensure_membership(db, test_board, board_owner, UserRole.owner)
        await _ensure_membership(db, test_board, team_member, UserRole.team)
        await _ensure_membership(db, test_board, client_user, UserRole.client)
        await db.commit()

        # ── Columns ──────────────────────────────────────────────────────────
        col_names = ["Backlog", "In Progress", "Review", "Done"]
        cols = {}
        for pos, name in enumerate(col_names):
            cols[name] = await _get_or_create_list(db, test_board, name, pos)
        await db.commit()

        # ── Cards in Backlog ─────────────────────────────────────────────────
        backlog_cards = [
            "Login page throws 500 on empty password",
            "Card drag-and-drop breaks on mobile",
            "Email notifications not sending",
        ]
        for pos, title in enumerate(backlog_cards):
            await _get_or_create_card(
                db, test_board, cols["Backlog"], title, pos, board_owner
            )
        await db.commit()

        # ── Other Board (client_user has NO access) ───────────────────────
        other_board = await _get_or_create_board(
            db, "Other Board", other_owner, "Isolation test — client must not see this"
        )
        await _ensure_membership(db, other_board, other_owner, UserRole.owner)
        await db.commit()

    print("[OK] Seed complete")
    print(f"   DB : {engine.url}")
    print("   Users:")
    print("     admin@test.com   / Admin@1234  (super_admin)")
    print("     owner@test.com   / Owner@1234  (board owner - Test Board)")
    print("     team@test.com    / Team@1234   (team member - Test Board)")
    print("     client@test.com  / Client@1234 (client - Test Board only)")
    print("     other@test.com   / Other@1234  (board owner - Other Board)")
    print("   Boards: 'Test Board' (4 columns, 3 cards), 'Other Board' (empty)")


# ---------------------------------------------------------------------------
# Standalone entry point: python -m tests.seed
# ---------------------------------------------------------------------------

async def seed(db_url: str = TEST_DB_URL) -> None:
    """Full standalone seed: create DB → create tables → insert data."""
    await _ensure_database(db_url)
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    try:
        await _create_tables(engine)
        await seed_data(engine)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
