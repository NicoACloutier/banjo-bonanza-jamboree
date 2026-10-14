"""initial schema: every table, as of the first production deploy

Revision ID: 0001
Revises:
Create Date: 2026-10-14 19:01:26.954689

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('username', sa.String(length=32), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('hashed_password', sa.String(length=255), nullable=True),
    sa.Column('google_subject_id', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_google_subject_id'), 'users', ['google_subject_id'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
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
    op.create_table('tabs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('song_name', sa.String(length=200), nullable=False),
    sa.Column('artist', sa.String(length=200), nullable=True),
    sa.Column('album', sa.String(length=200), nullable=True),
    sa.Column('tuning_key', sa.String(length=32), nullable=False),
    sa.Column('tempo_bpm', sa.Integer(), nullable=False),
    sa.Column('capo_fret', sa.Integer(), nullable=False),
    sa.Column('bars_per_line', sa.Integer(), nullable=False),
    sa.Column('clawhammer_timing', sa.Boolean(), nullable=False),
    sa.Column('time_signature', sa.String(length=8), nullable=True),
    sa.Column('swing', sa.Boolean(), nullable=False),
    sa.Column('fifth_string_capo_fret', sa.Integer(), nullable=True),
    sa.Column('style', sa.String(length=32), nullable=True),
    sa.Column('song_key', sa.String(length=8), nullable=True),
    sa.Column('difficulty', sa.String(length=16), nullable=True),
    sa.Column('forked_from_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.Enum('draft', 'published', name='tabstatus', native_enum=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['forked_from_id'], ['tabs.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tabs_difficulty'), 'tabs', ['difficulty'], unique=False)
    op.create_index(op.f('ix_tabs_owner_id'), 'tabs', ['owner_id'], unique=False)
    op.create_index(op.f('ix_tabs_song_key'), 'tabs', ['song_key'], unique=False)
    op.create_index(op.f('ix_tabs_song_name'), 'tabs', ['song_name'], unique=False)
    op.create_index(op.f('ix_tabs_status'), 'tabs', ['status'], unique=False)
    op.create_index(op.f('ix_tabs_style'), 'tabs', ['style'], unique=False)
    op.create_table('favorites',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tab_id', 'user_id', name='uq_favorite_tab_user')
    )
    op.create_index(op.f('ix_favorites_tab_id'), 'favorites', ['tab_id'], unique=False)
    op.create_index(op.f('ix_favorites_user_id'), 'favorites', ['user_id'], unique=False)
    op.create_table('notes',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('duration_beats', sa.Float(), nullable=False),
    sa.Column('line_break', sa.Boolean(), nullable=False),
    sa.Column('is_rest', sa.Boolean(), nullable=False),
    sa.Column('thumb_after', sa.Boolean(), nullable=False),
    sa.Column('dotted', sa.Boolean(), nullable=False),
    sa.Column('triplet', sa.Boolean(), nullable=False),
    sa.Column('tied', sa.Boolean(), nullable=False),
    sa.Column('chord', sa.String(length=16), nullable=True),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notes_tab_id'), 'notes', ['tab_id'], unique=False)
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
    op.create_table('tab_revisions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('snapshot_json', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tab_revisions_created_at'), 'tab_revisions', ['created_at'], unique=False)
    op.create_index(op.f('ix_tab_revisions_tab_id'), 'tab_revisions', ['tab_id'], unique=False)
    op.create_table('votes',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tab_id', 'user_id', name='uq_vote_tab_user')
    )
    op.create_index(op.f('ix_votes_tab_id'), 'votes', ['tab_id'], unique=False)
    op.create_index(op.f('ix_votes_user_id'), 'votes', ['user_id'], unique=False)
    op.create_table('lyrics',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tab_id', sa.String(length=36), nullable=False),
    sa.Column('note_id', sa.String(length=36), nullable=False),
    sa.Column('text', sa.String(length=64), nullable=False),
    sa.ForeignKeyConstraint(['note_id'], ['notes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tab_id'], ['tabs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('note_id', name='uq_lyric_note')
    )
    op.create_index(op.f('ix_lyrics_tab_id'), 'lyrics', ['tab_id'], unique=False)
    op.create_table('note_frets',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('note_id', sa.String(length=36), nullable=False),
    sa.Column('string_number', sa.Integer(), nullable=False),
    sa.Column('fret', sa.Integer(), nullable=False),
    sa.Column('technique', sa.Enum('normal', 'hammer_on', 'pull_off', 'slide', 'bend', 'drop_thumb', name='notetechnique', native_enum=False), nullable=False),
    sa.Column('slide_to_fret', sa.Integer(), nullable=True),
    sa.Column('bend_semitones', sa.Integer(), nullable=True),
    sa.Column('right_hand_finger', sa.Enum('thumb', 'index', 'middle', name='righthandfinger', native_enum=False), nullable=True),
    sa.ForeignKeyConstraint(['note_id'], ['notes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('note_id', 'string_number', name='uq_note_fret_string')
    )
    op.create_index(op.f('ix_note_frets_note_id'), 'note_frets', ['note_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_note_frets_note_id'), table_name='note_frets')
    op.drop_table('note_frets')
    op.drop_index(op.f('ix_lyrics_tab_id'), table_name='lyrics')
    op.drop_table('lyrics')
    op.drop_index(op.f('ix_votes_user_id'), table_name='votes')
    op.drop_index(op.f('ix_votes_tab_id'), table_name='votes')
    op.drop_table('votes')
    op.drop_index(op.f('ix_tab_revisions_tab_id'), table_name='tab_revisions')
    op.drop_index(op.f('ix_tab_revisions_created_at'), table_name='tab_revisions')
    op.drop_table('tab_revisions')
    op.drop_index(op.f('ix_setlist_items_tab_id'), table_name='setlist_items')
    op.drop_index(op.f('ix_setlist_items_setlist_id'), table_name='setlist_items')
    op.drop_table('setlist_items')
    op.drop_index(op.f('ix_notes_tab_id'), table_name='notes')
    op.drop_table('notes')
    op.drop_index(op.f('ix_favorites_user_id'), table_name='favorites')
    op.drop_index(op.f('ix_favorites_tab_id'), table_name='favorites')
    op.drop_table('favorites')
    op.drop_index(op.f('ix_tabs_style'), table_name='tabs')
    op.drop_index(op.f('ix_tabs_status'), table_name='tabs')
    op.drop_index(op.f('ix_tabs_song_name'), table_name='tabs')
    op.drop_index(op.f('ix_tabs_song_key'), table_name='tabs')
    op.drop_index(op.f('ix_tabs_owner_id'), table_name='tabs')
    op.drop_index(op.f('ix_tabs_difficulty'), table_name='tabs')
    op.drop_table('tabs')
    op.drop_index(op.f('ix_setlists_owner_id'), table_name='setlists')
    op.drop_table('setlists')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_google_subject_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
