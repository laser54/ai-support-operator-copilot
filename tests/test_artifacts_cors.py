"""Browser CORS coverage for mutable artifact catalogue endpoints."""

from fastapi.testclient import TestClient


def test_artifact_preflight_allows_catalog_mutations_from_public_frontend(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://copilot.larin.work")

    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    response = TestClient(create_app()).options(
        "/artifacts/kb-auth-5xx-after-release",
        headers={
            "Origin": "https://copilot.larin.work",
            "Access-Control-Request-Method": "DELETE",
        },
    )

    assert response.status_code == 200
    assert "DELETE" in response.headers["access-control-allow-methods"]
