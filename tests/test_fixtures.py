"""Tests for deterministic synthetic fixture catalogues."""

from app.domain.contracts import EvidenceSourceType
from app.fixtures.catalog import load_catalogue

load_catalogue.cache_clear()


def test_fixture_catalogues_have_stable_traceable_sources() -> None:
    knowledge = load_catalogue("knowledge/auth-5xx-after-release.json")
    similar_cases = load_catalogue("similar_cases.json")
    service_status = load_catalogue("service_status.json")

    entries = knowledge.entries + similar_cases.entries + service_status.entries

    assert [entry.source_id for entry in knowledge.entries] == [
        "kb-auth-5xx-after-release",
        "kb-vpn-certificate-rotation",
        "kb-invoice-pdf-timeout",
        "kb-outbound-email-delay",
        "kb-sso-mfa-loop",
    ]
    assert [entry.source_id for entry in similar_cases.entries] == [
        "inc-104",
        "inc-218",
        "inc-311",
        "inc-402",
        "inc-155",
    ]
    assert [entry.source_id for entry in service_status.entries] == [
        "status-portal-auth-5xx",
        "status-vpn-gateway",
        "status-billing-export",
        "status-smtp-queue",
        "status-idp-sso",
    ]
    assert {entry.source_type for entry in entries} == {
        EvidenceSourceType.KNOWLEDGE,
        EvidenceSourceType.SIMILAR_CASE,
        EvidenceSourceType.SERVICE_STATUS,
    }
    assert all("synthetic" in entry.excerpt.lower() for entry in entries)
