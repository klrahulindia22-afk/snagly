"""extend_bg_color_to_500

Revision ID: f7g8h9i0j1k2
Revises: e3f4a5b6c7d8
Create Date: 2026-06-13 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f7g8h9i0j1k2'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'boards',
        'bg_color',
        existing_type=sa.String(7),
        type_=sa.String(500),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'boards',
        'bg_color',
        existing_type=sa.String(500),
        type_=sa.String(7),
        nullable=True,
    )
