"""Tests for traceable fixture-backed read-only tools."""

from app.domain.contracts import EvidenceSourceType
from app.fixtures.catalog import load_catalogue
from app.tools.read_only import check_service_status, find_similar_cases, search_knowledge

load_catalogue.cache_clear()


def test_login_500_tools_return_one_traceable_source_each() -> None:
    knowledge = search_knowledge("login HTTP 500 after release")
    similar_cases = find_similar_cases("portal login 500 after deployment")
    service_status = check_service_status("portal authentication")

    assert [(item.source_type, item.source_id, item.tool_name) for item in knowledge] == [
        (EvidenceSourceType.KNOWLEDGE, "kb-auth-5xx-after-release", "search_knowledge")
    ]
    assert [(item.source_type, item.source_id, item.tool_name) for item in similar_cases] == [
        (EvidenceSourceType.SIMILAR_CASE, "inc-104", "find_similar_cases")
    ]
    assert [(item.source_type, item.source_id, item.tool_name) for item in service_status] == [
        (EvidenceSourceType.SERVICE_STATUS, "status-portal-auth-5xx", "check_service_status")
    ]


def test_vpn_request_does_not_return_portal_fixtures() -> None:
    query = "Remote VPN users cannot connect after last night's certificate rotation."
    knowledge = search_knowledge(query)
    similar_cases = find_similar_cases(query)
    service_status = check_service_status(query)

    assert [item.source_id for item in knowledge] == ["kb-vpn-certificate-rotation"]
    assert [item.source_id for item in similar_cases] == ["inc-218"]
    assert [item.source_id for item in service_status] == ["status-vpn-gateway"]
