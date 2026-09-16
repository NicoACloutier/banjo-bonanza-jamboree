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


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable, process-wide application settings."""

    # --- Core ---
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    # --- Database ---
    # Example: postgresql+asyncpg://user:password@host:5432/banjo_tabs
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./banjo_tabs.db")

    # --- Auth / JWT ---
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    refresh_token_expire_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

    # --- Google OAuth2 ---
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "")

    # --- CORS ---
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(os.getenv("CORS_ORIGINS", "http://localhost:5173"))
    )

    # --- App info ---
    app_name: str = os.getenv("APP_NAME", "Banjo Bonanza Jamboree")


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once per process)."""
    return Settings()
