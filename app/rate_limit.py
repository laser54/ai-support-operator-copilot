"""In-memory, per-client limiter for the cost-bearing case-intake route."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status


@dataclass
class IntakeRateLimiter:
    """Reject clients that exceed a fixed intake count in a rolling window."""

    limit: int
    window_seconds: int
    _requests: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))
    _lock: Lock = field(default_factory=Lock)

    def check(self, client_id: str, *, now: float | None = None) -> None:
        """Record one attempt or return a retryable 429 before LLM work begins."""
        current = monotonic() if now is None else now
        with self._lock:
            attempts = self._requests[client_id]
            while attempts and attempts[0] <= current - self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (current - attempts[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Intake limit reached. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            attempts.append(current)


def client_id_from_request(request: Request) -> str:
    """Use Traefik's appended right-most peer address, not client-provided hops."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.rsplit(",", maxsplit=1)[-1].strip()
    return request.client.host if request.client else "unknown"
