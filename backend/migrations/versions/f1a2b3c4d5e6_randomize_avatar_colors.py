"""randomize_avatar_colors

Revision ID: f1a2b3c4d5e6
Revises: 64c3138d0829
Create Date: 2026-06-13 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '64c3138d0829'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 15-color palette — maps user_id % 15 → color
_PALETTE = [
    "#2563eb",
    "#0d9488",
    "#dc2626",
    "#1e40af",
    "#16a34a",
    "#7c3aed",
    "#c2410c",
    "#0891b2",
    "#b45309",
    "#be185d",
    "#4f46e5",
    "#059669",
    "#9333ea",
    "#0f766e",
    "#b91c1c",
]


def upgrade() -> None:
    # Assign a deterministic color from the palette to every user whose
    # initials_color is still the old default '#6c63ff' or NULL.
    case_clauses = " ".join(
        f"WHEN MOD(id, 15) = {i} THEN '{color}'"
        for i, color in enumerate(_PALETTE)
    )
    op.execute(
        f"""
        UPDATE users
        SET initials_color = CASE {case_clauses} END
        WHERE initials_color = '#6c63ff' OR initials_color IS NULL
        """
    )


def downgrade() -> None:
    op.execute("UPDATE users SET initials_color = '#6c63ff'")
