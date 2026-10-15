"""add users.email_verified; accounts from before verification count as verified

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-15 00:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), server_default=sa.false(), nullable=False))
    # Everyone who registered before verification existed keeps posting.
    op.execute(sa.text('UPDATE users SET email_verified = true'))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('email_verified')
