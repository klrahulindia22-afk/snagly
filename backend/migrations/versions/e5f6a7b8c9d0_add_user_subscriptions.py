"""add user_subscriptions table and seed plans

Revision ID: e5f6a7b8c9d0
Revises: a9b8c7d6e5f4, b1c2d3e4f5a6
Create Date: 2026-06-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import BIGINT

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = ('a9b8c7d6e5f4', 'b1c2d3e4f5a6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'user_subscriptions',
        sa.Column('id',            BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column('user_id',       BIGINT(unsigned=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('plan_id',       BIGINT(unsigned=True), sa.ForeignKey('plans.id'), nullable=False, index=True),
        sa.Column('started_at',    sa.DateTime(),   nullable=False),
        sa.Column('expires_at',    sa.DateTime(),   nullable=True),
        sa.Column('amount_paid',   sa.Numeric(10, 2), nullable=True),
        sa.Column('billing_cycle', sa.String(20),   nullable=True),
        sa.Column('is_active',     sa.Boolean(),    default=True, index=True),
        sa.Column('cancelled_at',  sa.DateTime(),   nullable=True),
        sa.Column('notes',         sa.Text(),       nullable=True),
        sa.Column('created_at',    sa.DateTime(),   nullable=True, index=True),
    )

    # Seed plan data so the revenue module has plans to assign
    op.execute("""
        INSERT INTO plans (name, display_name, price_monthly, price_yearly, is_active)
        SELECT * FROM (SELECT 'free' AS name, 'Free' AS display_name, 0.00 AS price_monthly, 0.00 AS price_yearly, 1 AS is_active) AS tmp
        WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'free')
    """)
    op.execute("""
        INSERT INTO plans (name, display_name, price_monthly, price_yearly, is_active)
        SELECT * FROM (SELECT 'pro' AS name, 'Pro' AS display_name, 9.99 AS price_monthly, 99.00 AS price_yearly, 1 AS is_active) AS tmp
        WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'pro')
    """)
    op.execute("""
        INSERT INTO plans (name, display_name, price_monthly, price_yearly, is_active)
        SELECT * FROM (SELECT 'business' AS name, 'Business' AS display_name, 29.99 AS price_monthly, 299.00 AS price_yearly, 1 AS is_active) AS tmp
        WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'business')
    """)
    op.execute("""
        INSERT INTO plans (name, display_name, price_monthly, price_yearly, is_active)
        SELECT * FROM (SELECT 'enterprise' AS name, 'Enterprise' AS display_name, 99.99 AS price_monthly, 999.00 AS price_yearly, 1 AS is_active) AS tmp
        WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'enterprise')
    """)


def downgrade():
    op.drop_table('user_subscriptions')
