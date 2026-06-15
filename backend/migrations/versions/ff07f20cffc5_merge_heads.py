"""merge_heads

Revision ID: ff07f20cffc5
Revises: 9aabba325589, b9f1e2c34d56
Create Date: 2026-06-15 01:19:05.000382

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff07f20cffc5'
down_revision: Union[str, Sequence[str], None] = ('9aabba325589', 'b9f1e2c34d56')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
