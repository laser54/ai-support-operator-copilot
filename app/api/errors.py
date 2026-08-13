"""Machine-readable HTTP error envelopes for the case API."""

from typing import Any

_STATUS_CODES = {
    404: "not_found",
    409: "conflict",
    422: "validation_error",
}


def error_envelope(status_code: int, detail: object) -> dict[str, Any]:
    """Return a stable error body for expected HTTP failures."""

    message = detail if isinstance(detail, str) else "request failed"
    return {
        "error": {
            "code": _STATUS_CODES.get(status_code, "http_error"),
            "message": message,
        }
    }
