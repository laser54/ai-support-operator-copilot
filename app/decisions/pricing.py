"""Reviewed price snapshot: estimates require exact provider/model and real usage.

Source: https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints
Retrieved 2026-10-08: TypeSafe | typesafe/jev-1.13-20260917, prompt USD
0.000000042/token, completion USD 0/token. This is a pinned historical
snapshot, not a live quote. Aliases and arbitrary compatible endpoints are
intentionally not priced. Changes require human review and a new table version.
"""

from decimal import Decimal
from types import MappingProxyType

from app.decisions.contracts import CostEstimate, ModelCallMetadata

PRICE_TABLE_VERSION = "openrouter-typesafe-2026-10-08-v1"
# USD per million tokens, input then output; exact resolved model only.
PRICE_TABLE = MappingProxyType({
    ("openrouter/TypeSafe", "typesafe/jev-1.13-20260917"): (Decimal("0.042"), Decimal("0")),
})


def with_cost_estimate(metadata: ModelCallMetadata) -> ModelCallMetadata:
    """Estimate non-fatally; unavailable estimates never alter reported cost/source."""
    usage = metadata.usage
    price = PRICE_TABLE.get((metadata.provider, metadata.model or ""))
    if (price is None or usage is None
            or usage.input_tokens is None or usage.output_tokens is None):
        return metadata.model_copy(update={"cost_estimate": None})
    input_price, output_price = price
    try:
        amount = (usage.input_tokens * input_price + usage.output_tokens * output_price) / 1_000_000
        float_amount = float(amount)
        if amount != 0 and float_amount == 0:
            # A nonzero amount outside float range is unknown, not a free call.
            return metadata.model_copy(update={"cost_estimate": None})
        estimate = CostEstimate(
            amount=float_amount, currency="USD", source="versioned_price_table_estimate",
            price_table_version=PRICE_TABLE_VERSION,
            priced_provider=metadata.provider, priced_model=metadata.model or "",
            input_usd_per_million_tokens=float(input_price),
            output_usd_per_million_tokens=float(output_price),
        )
    except (ArithmeticError, TypeError, ValueError):
        # Decimal/float range errors and estimate validation cannot abort analysis.
        return metadata.model_copy(update={"cost_estimate": None})
    return metadata.model_copy(update={"cost_estimate": estimate})
