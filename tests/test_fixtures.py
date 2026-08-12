"""Tests for deterministic synthetic fixture catalogues."""

from app.domain.contracts import EvidenceSourceType
from app.fixtures.catalog import load_catalogue


def test_login_500_fixture_catalogues_have_stable_traceable_sources() -> None:
    knowledge = load_catalogue("knowledge/auth-5xx-after-release.json")
    similar_cases = load_catalogue("similar_cases.json")
    service_status = load_catalogue("service_status.json")

    entries = knowledge.entries + similar_cases.entries + service_status.entries

    assert [entry.source_id for entry in entries] == [
        "kb-auth-5xx-after-release",
        "inc-104",
        "status-portal-auth-5xx",
    ]
    assert {entry.source_type for entry in entries} == {
        EvidenceSourceType.KNOWLEDGE,
        EvidenceSourceType.SIMILAR_CASE,
        EvidenceSourceType.SERVICE_STATUS,
    }
    assert all(
        "synthetic" in entry.excerpt.lower()
        or entry.source_type is EvidenceSourceType.KNOWLEDGE
        for entry in entries
    )
