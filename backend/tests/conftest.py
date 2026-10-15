"""Pytest fixtures: isolated async SQLite DB + FastAPI test client per test."""

from __future__ import annotations

import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api import auth as auth_api
from app.api import email_verification, password_reset
from app.core.database import Base, get_db
from app.core.deps import get_current_user, get_verified_user
from app.main import app

_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSessionLocal = async_sessionmaker(bind=_engine, expire_on_commit=False, class_=AsyncSession)


async def _override_get_db():
    async with _TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    auth_api.login_attempts_per_ip.reset()
    auth_api.login_failures_per_account.reset()
    password_reset.reset_requests_per_ip.reset()
    password_reset.reset_requests_per_email.reset()
    email_verification.resends_per_account.reset()


@pytest.fixture(autouse=True)
def _skip_email_verification(request):
    """Most tests post as freshly registered (so unverified) users; let them,
    except in tests marked `email_verification`, which check the real rule."""
    if request.node.get_closest_marker("email_verification"):
        yield
        return
    app.dependency_overrides[get_verified_user] = get_current_user
    yield
    app.dependency_overrides.pop(get_verified_user, None)


@pytest_asyncio.fixture(autouse=True)
async def _prepare_database():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture
async def author_headers(client):
    """Auth headers for a registered user ("tab_author"), for creating tabs."""
    resp = await client.post(
        "/api/auth/register",
        json={"username": "tab_author", "email": "tab_author@example.com", "password": "Str0ngPassw0rd!"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def anyio_backend():
    return "asyncio"
