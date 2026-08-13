"""Load, validate, and manage versioned synthetic fixture catalogues."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from app.domain.contracts import EvidenceSourceType

FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "fixtures"

_CATALOGUE_FILES = [
    "knowledge/auth-5xx-after-release.json",
    "similar_cases.json",
    "service_status.json",
]


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


# In-memory store initialized from fixture files
_IN_MEMORY_CATALOGUES: dict[str, FixtureCatalogue] = {}


def _get_in_memory_catalogues() -> dict[str, FixtureCatalogue]:
    if not _IN_MEMORY_CATALOGUES:
        for name in _CATALOGUE_FILES:
            fixture_path = (FIXTURE_ROOT / name).resolve()
            if fixture_path.exists():
                _IN_MEMORY_CATALOGUES[name] = FixtureCatalogue.model_validate_json(
                    fixture_path.read_text(encoding="utf-8")
                )
    return _IN_MEMORY_CATALOGUES


def load_catalogue(name: str) -> FixtureCatalogue:
    """Load a named fixture JSON file or get its in-memory state."""

    catalogues = _get_in_memory_catalogues()
    if name in catalogues:
        return catalogues[name]

    fixture_path = (FIXTURE_ROOT / name).resolve()
    if fixture_path.suffix != ".json" or FIXTURE_ROOT not in fixture_path.parents:
        raise ValueError("fixture name must identify a JSON file inside the fixture directory")
    cat = FixtureCatalogue.model_validate_json(fixture_path.read_text(encoding="utf-8"))
    catalogues[name] = cat
    return cat


def _clear_catalogue_cache() -> None:
    """Reset mutable fixture state for tests and explicit local refreshes."""

    _IN_MEMORY_CATALOGUES.clear()


# Backward-compatible public reset hook used by fixture consumers and tests.
setattr(load_catalogue, "cache_clear", _clear_catalogue_cache)


def list_all_artifacts() -> list[FixtureEntry]:
    """Return all entries across all fixture catalogues."""

    catalogues = _get_in_memory_catalogues()
    all_entries: list[FixtureEntry] = []
    for cat in catalogues.values():
        all_entries.extend(cat.entries)
    return all_entries


def add_or_update_artifact(entry: FixtureEntry) -> FixtureEntry:
    """Add a new artifact or update an existing one by source_id."""

    catalogues = _get_in_memory_catalogues()
    target_file = (
        "knowledge/auth-5xx-after-release.json"
        if entry.source_type == "knowledge"
        else "similar_cases.json"
        if entry.source_type == "similar_case"
        else "service_status.json"
    )

    cat = catalogues.get(target_file)
    if not cat:
        cat = load_catalogue(target_file)

    updated = False
    for catalogue_obj in catalogues.values():
        for i, existing in enumerate(catalogue_obj.entries):
            if existing.source_id == entry.source_id:
                catalogue_obj.entries[i] = entry
                updated = True
                break
        if updated:
            break

    if not updated:
        cat.entries.append(entry)

    return entry
