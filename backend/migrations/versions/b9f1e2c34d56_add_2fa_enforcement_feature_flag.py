"""add_2fa_enforcement_feature_flag

Revision ID: b9f1e2c34d56
Revises: 64c3138d0829
Create Date: 2026-06-14 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b9f1e2c34d56'
down_revision: Union[str, Sequence[str], None] = '64c3138d0829'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Insert 2fa_enforcement feature flag for each plan (disabled for free/pro, enabled for business/enterprise)
    op.execute("""
        INSERT INTO plan_feature_flags (plan_id, feature_key, is_enabled, limit_value)
        SELECT p.id, '2fa_enforcement',
               CASE p.name
                   WHEN 'business'   THEN 1
                   WHEN 'enterprise' THEN 1
                   ELSE 0
               END,
               NULL
        FROM plans p
        WHERE p.name IN ('free', 'pro', 'business', 'enterprise')
          AND NOT EXISTS (
              SELECT 1 FROM plan_feature_flags f
              WHERE f.plan_id = p.id AND f.feature_key = '2fa_enforcement'
          )
    """)


def downgrade() -> None:
    op.execute("DELETE FROM plan_feature_flags WHERE feature_key = '2fa_enforcement'")
