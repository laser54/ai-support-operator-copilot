"""Load and validate versioned synthetic fixture catalogues."""

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from app.domain.contracts import EvidenceSourceType

FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "fixtures"


class FixtureEntry(BaseModel):
    """A read-only fixture source with a stable identifier."""

    model_config = ConfigDict(extra="forbid")

    source_type: EvidenceSourceType
    source_id: str = Field(pattern=r"^[a-z][a-z0-9_-]{2,63}$")
    title: str = Field(min_length=1, max_length=200)
    excerpt: str = Field(min_length=1, max_length=2_000)
    keywords: list[str] = Field(min_length=1)
    observed_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class FixtureCatalogue(BaseModel):
    """Typed collection returned from one fixture JSON file."""

    model_config = ConfigDict(extra="forbid")

    entries: list[FixtureEntry] = Field(min_length=1)


@lru_cache
def load_catalogue(name: str) -> FixtureCatalogue:
    """Load a named fixture JSON file and validate its full schema."""

    fixture_path = (FIXTURE_ROOT / name).resolve()
    if fixture_path.suffix != ".json" or FIXTURE_ROOT not in fixture_path.parents:
        raise ValueError("fixture name must identify a JSON file inside the fixture directory")
    return FixtureCatalogue.model_validate_json(fixture_path.read_text(encoding="utf-8"))
