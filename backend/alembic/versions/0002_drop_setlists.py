"""drop setlists: the feature was removed

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14 21:45:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f('ix_setlist_items_tab_id'), table_name='setlist_items')
    op.drop_index(op.f('ix_setlist_items_setlist_id'), table_name='setlist_items')
    op.drop_table('setlist_items')
    op.drop_index(op.f('ix_setlists_owner_id'), table_name='setlists')
    op.drop_table('setlists')


def downgrade() -> None:
    # Recreates the (empty) tables; the setlists themselves are gone.
    op.create_table('setlists',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_setlists_owner_id'), 'setlists', ['owner_id'], unique=False)
    op.create_table('setlist_items',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('setlist_id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['setlist_id'], ['setlists.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_setlist_items_setlist_id'), 'setlist_items', ['setlist_id'], unique=False)
    op.create_index(op.f('ix_setlist_items_tab_id'), 'setlist_items', ['tab_id'], unique=False)
