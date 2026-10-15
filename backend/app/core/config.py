"""
Application configuration.

All settings are loaded from environment variables (see `.env.example` in the
repository root for the full list). We deliberately avoid hard-coding any
secrets, hostnames, or credentials here -- everything flows through the
environment so the same code can run locally, in CI, and on AWS free-tier
infrastructure (e.g. an EC2 micro instance + RDS free-tier PostgreSQL).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

# Load `backend/.env` if present. Real environment variables take precedence.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _env(name: str, default: str = "") -> str:
    """An environment variable, with blank values (e.g. `KEY=` copied from
    `.env.example`) treated as unset so the default applies."""
    value = os.getenv(name)
    return default if value is None or not value.strip() else value.strip()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_database_url(url: str) -> str:
    """
    Adapt a plain PostgreSQL URL, as hosts like Neon hand out
    (``postgres://`` or ``postgresql://...?sslmode=require``), for
    SQLAlchemy's asyncpg driver: use the ``postgresql+asyncpg`` scheme,
    rename ``sslmode`` to asyncpg's ``ssl``, and drop ``channel_binding``
    (which asyncpg doesn't accept). Other URLs (e.g. SQLite) pass through.
    """
    parts = urlsplit(url)
    scheme = "postgresql+asyncpg" if parts.scheme in ("postgres", "postgresql") else parts.scheme
    if scheme != "postgresql+asyncpg":
        return url
    query = [
        ("ssl" if key == "sslmode" else key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "channel_binding"
    ]
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable, process-wide application settings."""

    # --- Core ---
    environment: str = _env("ENVIRONMENT", "development")
    debug: bool = _env("DEBUG", "false").lower() == "true"

    # --- Database ---
    # Example: postgresql+asyncpg://user:password@host:5432/banjo_tabs
    database_url: str = normalize_database_url(_env("DATABASE_URL", "sqlite+aiosqlite:///./banjo_tabs.db"))

    # --- Auth / JWT ---
    jwt_secret_key: str = _env("JWT_SECRET_KEY")
    jwt_algorithm: str = _env("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(_env("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    refresh_token_expire_days: int = int(_env("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

    # --- Google OAuth2 ---
    google_client_id: str = _env("GOOGLE_CLIENT_ID")
    google_client_secret: str = _env("GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = _env("GOOGLE_REDIRECT_URI")

    # --- CORS ---
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(_env("CORS_ORIGINS", "http://localhost:5173"))
    )
    # Optional regex for extra allowed origins, e.g. Cloudflare Pages preview
    # deploys: ^https://([a-z0-9-]+\.)?my-site\.pages\.dev$
    cors_origin_regex: str | None = _env("CORS_ORIGIN_REGEX") or None

    # --- Links in emails ---
    # The site's address, for links such as password resets. Defaults to the
    # first CORS origin, which is normally the same site.
    frontend_url: str = (
        _env("FRONTEND_URL") or (_split_csv(_env("CORS_ORIGINS", "http://localhost:5173")) or [""])[0]
    ).rstrip("/")

    # --- Email (SMTP) ---
    # Without SMTP_HOST no email is sent; in development the message is
    # logged instead, so links can be copied from the server output.
    smtp_host: str = _env("SMTP_HOST")
    smtp_port: int = int(_env("SMTP_PORT", "587"))
    smtp_username: str = _env("SMTP_USERNAME")
    smtp_password: str = _env("SMTP_PASSWORD")
    # "starttls" (usually port 587), "ssl" (usually port 465) or "none".
    smtp_security: str = _env("SMTP_SECURITY", "starttls").lower()
    email_from: str = _env("EMAIL_FROM")

    # --- App info ---
    app_name: str = _env("APP_NAME", "Banjo Bonanza Jamboree")


def check_production_settings(settings: Settings) -> None:
    """Refuse to run outside development/tests without a JWT secret, rather
    than signing everyone's login tokens with an empty key."""
    if settings.environment not in ("development", "test") and not settings.jwt_secret_key:
        raise RuntimeError("JWT_SECRET_KEY must be set when ENVIRONMENT is not development or test.")


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once per process)."""
    return Settings()
