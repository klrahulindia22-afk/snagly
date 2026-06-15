"""add archived_at to boards

Revision ID: a1b2c3d4e5f6
Revises: f7g8h9i0j1k2
Create Date: 2026-06-14

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('boards', sa.Column('archived_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('boards', 'archived_at')
