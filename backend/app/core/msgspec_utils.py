"""
Integration helpers that let FastAPI (which speaks Starlette `Response`
objects) use `msgspec` -- a fast, strictly-typed serialization library --
instead of Pydantic for our request/response payloads.

`MsgspecResponse` encodes any msgspec.Struct (or list/dict thereof) directly
to JSON bytes using msgspec's C-accelerated encoder.

`parse_json_body` reads the raw request body and converts it into a given
msgspec.Struct type, raising a 422 HTTPException with a clear message on
validation failure (mirroring FastAPI's default behaviour for bad input).
"""

from __future__ import annotations

from typing import Any, TypeVar

import msgspec
from fastapi import HTTPException, Request, status
from starlette.responses import Response

T = TypeVar("T")


class MsgspecResponse(Response):
    """A Starlette Response that serializes msgspec Structs to JSON."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return msgspec.json.encode(content)


async def parse_json_body(request: Request, struct_type: type[T]) -> T:
    """Read the request body and strictly decode it into `struct_type`."""
    raw = await request.body()
    try:
        return msgspec.json.decode(raw, type=struct_type)
    except msgspec.ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid request body: {exc}",
        ) from exc
    except msgspec.DecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed JSON: {exc}",
        ) from exc
