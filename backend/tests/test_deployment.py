"""Tests for production deployment concerns: database URLs and migrations."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from app.core.config import Settings, _env, check_production_settings, normalize_database_url
from app.core.database import Base
from app.models import orm  # noqa: F401  (registers the models on Base.metadata)

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_normalizes_hosted_postgres_urls_for_asyncpg():
    neon = "postgresql://user:pw@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert normalize_database_url(neon) == "postgresql+asyncpg://user:pw@ep-x.us-east-2.aws.neon.tech/neondb?ssl=require"
    assert normalize_database_url("postgres://u:p@host:5432/db") == "postgresql+asyncpg://u:p@host:5432/db"


def test_leaves_other_urls_alone():
    for url in [
        "postgresql+asyncpg://u:p@host/db?ssl=require",
        "sqlite+aiosqlite:///./banjo_tabs.db",
        "sqlite+aiosqlite:///:memory:",
    ]:
        assert normalize_database_url(url) == url


def test_migrations_build_exactly_the_models_schema(tmp_path):
    """`alembic upgrade head` on an empty database must match the ORM models,
    so a model change without a migration fails here rather than in production."""
    db_file = tmp_path / "migrated.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db_file.as_posix()}", "ENVIRONMENT": "production"}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    try:
        with engine.connect() as connection:
            differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    finally:
        engine.dispose()
    assert differences == []


def test_blank_environment_values_fall_back_to_defaults(monkeypatch):
    monkeypatch.setenv("BBJ_TEST_BLANK", "")
    monkeypatch.setenv("BBJ_TEST_SPACES", "   ")
    monkeypatch.setenv("BBJ_TEST_SET", " value ")
    monkeypatch.delenv("BBJ_TEST_MISSING", raising=False)
    assert _env("BBJ_TEST_BLANK", "default") == "default"
    assert _env("BBJ_TEST_SPACES", "default") == "default"
    assert _env("BBJ_TEST_MISSING", "default") == "default"
    assert _env("BBJ_TEST_SET", "default") == "value"


def test_production_requires_a_jwt_secret():
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        check_production_settings(Settings(environment="production", jwt_secret_key=""))
    check_production_settings(Settings(environment="production", jwt_secret_key="s3cret"))
    check_production_settings(Settings(environment="development", jwt_secret_key=""))
