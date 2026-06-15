"""add_slug_to_boards

Revision ID: e3f4a5b6c7d8
Revises: 64c3138d0829
Create Date: 2026-06-13 12:00:00.000000

"""
import re
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'a9b8c7d6e5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "board"


def upgrade() -> None:
    op.add_column("boards", sa.Column("slug", sa.String(255), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, name FROM boards ORDER BY id")).fetchall()

    used: set = set()
    for board_id, name in rows:
        base = _slugify(name)
        candidate = base
        n = 1
        while candidate in used:
            candidate = f"{base}-{n}"
            n += 1
        used.add(candidate)
        conn.execute(
            text("UPDATE boards SET slug = :slug WHERE id = :id"),
            {"slug": candidate, "id": board_id},
        )

    op.create_index("ix_boards_slug", "boards", ["slug"], unique=True)
    op.alter_column("boards", "slug", existing_type=sa.String(255), nullable=False)


def downgrade() -> None:
    op.drop_index("ix_boards_slug", table_name="boards")
    op.drop_column("boards", "slug")
