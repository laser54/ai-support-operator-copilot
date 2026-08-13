"""Unit tests for the public intake rate limiter."""

from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import HTTPException, Request

from app.rate_limit import IntakeRateLimiter, client_id_from_request


def test_limiter_rejects_the_next_request_in_its_rolling_window() -> None:
    limiter = IntakeRateLimiter(limit=2, window_seconds=60)

    limiter.check("203.0.113.10", now=100.0)
    limiter.check("203.0.113.10", now=101.0)
    with pytest.raises(HTTPException) as error:
        limiter.check("203.0.113.10", now=102.0)

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "58"}


def test_limiter_expires_old_attempts() -> None:
    limiter = IntakeRateLimiter(limit=1, window_seconds=60)

    limiter.check("203.0.113.10", now=100.0)
    limiter.check("203.0.113.10", now=160.0)


def test_client_id_prefers_the_original_forwarded_client() -> None:
    request = SimpleNamespace(
        headers={"x-forwarded-for": "203.0.113.10, 172.18.0.2"},
        client=SimpleNamespace(host="172.18.0.2"),
    )

    assert client_id_from_request(cast(Request, request)) == "172.18.0.2"
