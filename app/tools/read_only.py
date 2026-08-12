"""Deterministic read-only tools over the synthetic fixture catalogues."""

from datetime import datetime

from app.domain.contracts import Evidence
from app.fixtures.catalog import FixtureEntry, load_catalogue


def search_knowledge(query: str, filters: dict[str, str] | None = None) -> list[Evidence]:
    """Return matching synthetic knowledge entries without any external access."""

    del filters
    return _search("knowledge/auth-5xx-after-release.json", query, "search_knowledge")


def find_similar_cases(summary: str) -> list[Evidence]:
    """Return matching synthetic prior incidents without any external access."""

    return _search("similar_cases.json", summary, "find_similar_cases")


def check_service_status(service: str | None = None) -> list[Evidence]:
    """Return synthetic service status evidence for the requested service."""

    return _search("service_status.json", service or "", "check_service_status", match_all=True)


def _search(
    catalogue_name: str, query: str, tool_name: str, *, match_all: bool = False
) -> list[Evidence]:
    terms = {term.lower() for term in query.split() if term}
    entries = load_catalogue(catalogue_name).entries
    matches = [entry for entry in entries if match_all or _matches(entry, terms)]
    return [_to_evidence(entry, tool_name) for entry in matches]


def _matches(entry: FixtureEntry, terms: set[str]) -> bool:
    searchable = " ".join([entry.title, entry.excerpt, *entry.keywords]).lower()
    return not terms or any(term in searchable for term in terms)


def _to_evidence(entry: FixtureEntry, tool_name: str) -> Evidence:
    return Evidence(
        source_type=entry.source_type,
        source_id=entry.source_id,
        excerpt=entry.excerpt,
        tool_name=tool_name,
        observed_at=datetime.fromisoformat(entry.observed_at.replace("Z", "+00:00")),
    )
