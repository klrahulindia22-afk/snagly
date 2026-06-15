"""add board event in-app notif prefs

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-06-14

"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_notification_prefs', sa.Column('in_app_board_archived', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('user_notification_prefs', sa.Column('in_app_board_restored', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('user_notification_prefs', 'in_app_board_restored')
    op.drop_column('user_notification_prefs', 'in_app_board_archived')
