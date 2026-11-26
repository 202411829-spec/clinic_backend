from datetime import date
from unittest.mock import MagicMock, patch

from routers import agent, reports


def test_reports_rpc_uses_live_date_range_contract():
    response = MagicMock()
    response.data = {
        "current_status": [{"current_status": "Completed", "count": 2}]
    }

    with patch.object(reports, "supabase") as mock_supabase:
        with patch.object(reports, "execute_with_retry", return_value=response):
            data = reports._fetch_breakdowns(date(2026, 11, 25), 7)

    mock_supabase.rpc.assert_called_once_with(
        "report_breakdown",
        {
            "p_date_from": "2026-11-25",
            "p_date_to": "2026-11-25",
            "p_department_id": 7,
        },
    )
    assert data == response.data


def test_agent_reports_rpc_uses_live_date_range_contract():
    response = MagicMock()
    response.data = {
        "current_status": [{"current_status": "Completed", "count": 1}]
    }

    with patch("supabase_client.supabase") as mock_supabase:
        with patch.object(agent, "execute_with_retry", return_value=response):
            result, status = agent._handle_get_reports(
                {"date": "2026-11-25", "department_id": 3}
            )

    mock_supabase.rpc.assert_called_once_with(
        "report_breakdown",
        {
            "p_date_from": "2026-11-25",
            "p_date_to": "2026-11-25",
            "p_department_id": 3,
        },
    )
    assert status == 200
    assert result["success"] is True
    assert result["total_appointments"] == 1


def test_clinic_schedule_collection_route_is_registered():
    from main import app

    rules = {str(rule) for rule in app.url_map.iter_rules()}
    assert "/clinic-schedule" in rules
    assert "/clinic-schedule/<working_date>" in rules
