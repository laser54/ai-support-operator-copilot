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
    """Return synthetic service status evidence matching the request text."""

    return _search("service_status.json", service or "", "check_service_status")


def _search(catalogue_name: str, query: str, tool_name: str) -> list[Evidence]:
    matches = [entry for entry in load_catalogue(catalogue_name).entries if _matches(entry, query)]
    return [_to_evidence(entry, tool_name) for entry in matches]


def _matches(entry: FixtureEntry, query: str) -> bool:
    haystack = query.lower()
    return any(keyword.lower() in haystack for keyword in entry.keywords)


def _to_evidence(entry: FixtureEntry, tool_name: str) -> Evidence:
    return Evidence(
        source_type=entry.source_type,
        source_id=entry.source_id,
        excerpt=entry.excerpt,
        tool_name=tool_name,
        observed_at=datetime.fromisoformat(entry.observed_at.replace("Z", "+00:00")),
    )
