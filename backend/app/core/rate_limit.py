"""
In-memory sliding-window rate limiting (used for login).

State lives in this process, which fits the single Fly machine the site runs
on; with several machines each would keep its own counts, so the effective
limit would be multiplied by the machine count.
"""

from __future__ import annotations

import math
import os
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status


class SlidingWindowLimiter:
    """Allows at most `limit` events per `window_seconds` for each key."""

    def __init__(self, limit: int, window_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float]:
        events = self._events.get(key)
        if events is None:
            return deque()
        while events and events[0] <= now - self.window_seconds:
            events.popleft()
        if not events:
            del self._events[key]
        return events

    def retry_after(self, key: str) -> int | None:
        """Seconds until `key` may act again, or None if it's under the limit."""
        now = self._clock()
        events = self._prune(key, now)
        if len(events) < self.limit:
            return None
        return max(1, math.ceil(events[0] + self.window_seconds - now))

    def record(self, key: str) -> None:
        now = self._clock()
        self._prune(key, now)
        self._events.setdefault(key, deque()).append(now)
        # Bound memory: occasionally drop keys whose events have all expired.
        if len(self._events) > 10_000:
            for stale in list(self._events):
                self._prune(stale, now)

    def clear(self, key: str) -> None:
        self._events.pop(key, None)

    def reset(self) -> None:
        self._events.clear()


def client_ip(request: Request) -> str:
    """The visitor's address, as reliably as the host allows."""
    # On Fly, its proxy sets Fly-Client-IP (replacing any value the client
    # sent). request.client can't be used there: uvicorn takes it from the
    # first X-Forwarded-For entry, which the client controls. FLY_APP_NAME is
    # set on every Fly machine, and the header is only trusted there.
    if os.environ.get("FLY_APP_NAME"):
        fly_ip = request.headers.get("fly-client-ip")
        if fly_ip:
            return fly_ip
    return request.client.host if request.client else "unknown"


def too_many_requests(retry_after: int, what: str) -> HTTPException:
    minutes = math.ceil(retry_after / 60)
    wait = f"{minutes} minute{'s' if minutes != 1 else ''}" if retry_after >= 60 else f"{retry_after} seconds"
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many {what}. Try again in {wait}.",
        headers={"Retry-After": str(retry_after)},
    )
