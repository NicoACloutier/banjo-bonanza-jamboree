"""
Password hashing and JWT token utilities.

Security choices (deliberate, per OWASP password storage recommendations):
  * Argon2id (via argon2-cffi) is used for password hashing -- it is the
    current OWASP-recommended algorithm, memory-hard, and resistant to
    GPU/ASIC cracking. We never store plaintext passwords.
  * JWTs are short-lived access tokens signed with HS256 using a secret
    pulled from the environment (never hard-coded). Refresh tokens are
    longer-lived and stored hashed in the database so a stolen DB dump
    cannot be replayed as a valid refresh token.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

settings = get_settings()

_password_hasher = PasswordHasher()


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    try:
        return _password_hasher.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        # Any malformed hash / unexpected error is treated as a failed login.
        return False


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """Create a signed, short-lived JWT access token for `subject` (user id)."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode + validate a JWT access token. Raises jwt.PyJWTError on failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def generate_refresh_token() -> tuple[str, str]:
    """
    Generate a new opaque refresh token.

    Returns a tuple of (raw_token_for_client, sha256_hash_for_storage).
    Only the hash is ever persisted, so a leaked database cannot be used to
    forge valid refresh tokens.
    """
    raw = secrets.token_urlsafe(48)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest


def hash_refresh_token(raw_token: str) -> str:
    """Hash a raw refresh token the same way `generate_refresh_token` does."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
