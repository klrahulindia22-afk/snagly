"""Create idempotent, isolated E2E users and functional test data.

Run only against a non-production database:
    E2E_SEED_CONFIRMATION=SEED_E2E_DATA E2E_PASSWORD='<strong test password>' \
      python -m seeds.e2e
"""
import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings
from seeds.plans import _seed as seed_plans
from database import AsyncSessionLocal
from models.user import User, UserRole
from models.board import Board
from models.board_membership import BoardMembership
from models.list_ import List
from models.card import Card, CardSource, Priority, Severity
from models.label import Label
from models.card_label import CardLabel
from models.card_assignee import CardAssignee
from models.checklist import Checklist
from models.checklist_item import ChecklistItem
from models.comment import Comment
from services.auth_service import hash_password


CONFIRMATION = "SEED_E2E_DATA"
E2E_DOMAIN = "e2e.snagly.test"


def _credentials() -> dict[str, tuple[str, str]]:
    password = os.getenv("E2E_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("E2E_PASSWORD must contain at least 12 characters")
    return {
        "admin": (f"admin@{E2E_DOMAIN}", password),
        "owner": (f"owner@{E2E_DOMAIN}", password),
        "team": (f"team@{E2E_DOMAIN}", password),
        "client": (f"client@{E2E_DOMAIN}", password),
        "other_owner": (f"isolated-owner@{E2E_DOMAIN}", password),
    }


async def main() -> None:
    if os.getenv("E2E_SEED_CONFIRMATION") != CONFIRMATION:
        raise RuntimeError("Set E2E_SEED_CONFIRMATION=SEED_E2E_DATA before seeding")
    if settings.APP_ENV.lower() == "production":
        raise RuntimeError("Refusing to seed E2E data when APP_ENV=production")

    credentials = _credentials()
    async with AsyncSessionLocal() as session:
        await seed_plans(session)

    engine = create_async_engine(settings.DB_URL, pool_pre_ping=True)
    try:
        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as db:
            users: dict[str, User] = {}
            for key, (email, password) in credentials.items():
                user = await db.scalar(select(User).where(User.email == email))
                if not user:
                    roles = {
                        "admin": UserRole.super_admin, "owner": UserRole.owner,
                        "team": UserRole.team, "client": UserRole.client,
                        "other_owner": UserRole.owner,
                    }
                    user = User(email=email, full_name=f"E2E {key.replace('_', ' ').title()}",
                                password_hash=hash_password(password), role=roles[key],
                                is_active=True, is_verified=True)
                    db.add(user)
                    await db.flush()
                users[key] = user

            board = await db.scalar(select(Board).where(Board.slug == "e2e-regression-board"))
            if not board:
                board = Board(name="E2E Regression Board", slug="e2e-regression-board",
                              description="Isolated data for automated regression", owner_id=users["owner"].id)
                db.add(board)
                await db.flush()

            for key, role in (("owner", UserRole.owner), ("team", UserRole.team), ("client", UserRole.client)):
                member = await db.scalar(select(BoardMembership).where(
                    BoardMembership.board_id == board.id, BoardMembership.user_id == users[key].id))
                if not member:
                    db.add(BoardMembership(board_id=board.id, user_id=users[key].id, role=role))

            lists: dict[str, List] = {}
            for position, name in enumerate(("Backlog", "In Progress", "Review", "Done")):
                item = await db.scalar(select(List).where(List.board_id == board.id, List.name == name))
                if not item:
                    item = List(board_id=board.id, name=name, position=position)
                    db.add(item)
                    await db.flush()
                lists[name] = item

            label = await db.scalar(select(Label).where(Label.board_id == board.id, Label.name == "E2E Regression"))
            if not label:
                label = Label(board_id=board.id, name="E2E Regression", color="#6c63ff")
                db.add(label)
                await db.flush()

            specs = (
                ("Backlog", "E2E: invalid-login validation", Priority.urgent, Severity.critical, CardSource.client, "client"),
                ("In Progress", "E2E: board card edit", Priority.high, Severity.high, CardSource.internal, "team"),
                ("Review", "E2E: CSV export", Priority.normal, Severity.medium, CardSource.internal, "owner"),
                ("Done", "E2E: archived card restore", Priority.low, Severity.low, CardSource.internal, "owner"),
            )
            for position, (column, title, priority, severity, source, creator) in enumerate(specs):
                card = await db.scalar(select(Card).where(Card.list_id == lists[column].id, Card.title == title))
                if not card:
                    card = Card(board_id=board.id, list_id=lists[column].id, title=title, position=position,
                                priority=priority, severity=severity, source=source,
                                created_by_id=users[creator].id, is_complete=(column == "Done"))
                    db.add(card)
                    await db.flush()
                if not await db.scalar(select(CardLabel).where(CardLabel.card_id == card.id, CardLabel.label_id == label.id)):
                    db.add(CardLabel(card_id=card.id, label_id=label.id))
                if not await db.scalar(select(CardAssignee).where(CardAssignee.card_id == card.id, CardAssignee.user_id == users["team"].id)):
                    db.add(CardAssignee(card_id=card.id, user_id=users["team"].id))
                if title.startswith("E2E: invalid-login"):
                    checklist = await db.scalar(select(Checklist).where(Checklist.card_id == card.id, Checklist.title == "E2E checklist"))
                    if not checklist:
                        checklist = Checklist(card_id=card.id, title="E2E checklist", position=0)
                        db.add(checklist)
                        await db.flush()
                    if not await db.scalar(select(ChecklistItem).where(ChecklistItem.checklist_id == checklist.id, ChecklistItem.text == "Reproduce")):
                        db.add(ChecklistItem(checklist_id=checklist.id, text="Reproduce", position=0, is_checked=False))
                    if not await db.scalar(select(Comment).where(Comment.card_id == card.id, Comment.body == "E2E seeded comment")):
                        db.add(Comment(card_id=card.id, user_id=users["client"].id, body="E2E seeded comment"))
            await db.commit()

    finally:
        await engine.dispose()

    print("[OK] E2E seed complete")
    print("Roles: admin, owner, team, client, isolated-owner")
    print(f"Domain: @{E2E_DOMAIN}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as error:
        print(f"[ERROR] {error}", file=sys.stderr)
        raise SystemExit(1)
