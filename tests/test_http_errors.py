import pytest
from fastapi.testclient import TestClient

from app.api.errors import error_envelope
from app.main import create_app


def test_not_found_envelope_is_machine_readable() -> None:
    assert error_envelope(404, "case not found") == {
        "error": {"code": "not_found", "message": "case not found"}
    }


def test_cors_preflight_allows_only_configured_frontend_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")
    from app.config import get_settings

    get_settings.cache_clear()
    client = TestClient(create_app())

    allowed = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    denied = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert denied.headers.get("access-control-allow-origin") != "https://evil.example"
