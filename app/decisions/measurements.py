"""Small allowlist for independent provider measurements; never log raw telemetry."""

from pydantic import TypeAdapter, ValidationError

from app.decisions.contracts import NonnegativeMetric, TokenCount, Usage

_TOKEN = TypeAdapter(TokenCount)
_METRIC = TypeAdapter(NonnegativeMetric)


def reported_usage(
    raw: object, *, input_key: str = "input_tokens", output_key: str = "output_tokens",
) -> tuple[Usage | None, float | None]:
    """Preserve each valid reported quantity even if another measurement is invalid."""
    if not isinstance(raw, dict):
        return None, None

    def token(key: str) -> int | None:
        try:
            return _TOKEN.validate_python(raw.get(key))
        except ValidationError:
            return None

    input_tokens, output_tokens = token(input_key), token(output_key)
    usage = None if input_tokens is None and output_tokens is None else Usage(
        input_tokens=input_tokens, output_tokens=output_tokens,
    )
    try:
        cost = _METRIC.validate_python(raw.get("cost"))
    except ValidationError:
        cost = None
    return usage, cost
