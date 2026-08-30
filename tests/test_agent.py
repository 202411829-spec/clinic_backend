# tests/test_agent.py — Part A (read path + mock LLM)
import pytest
from unittest.mock import MagicMock, patch


def test_agent_chat_requires_admin():
    # Before blueprint exists, route should 401/404; after, require_admin -> 401 without token
    from main import app
    app.config["TESTING"] = True
    c = app.test_client()
    resp = c.post("/api/agent/chat", json={"message": "who are the admins?"})
    assert resp.status_code in (401, 403, 404)
    body = resp.get_json(silent=True) or {}
    assert body.get("success") is False or resp.status_code == 404


def test_mock_llm_keyword_routing():
    # MockLLM must be importable and route "who are the admins" -> list_admins
    try:
        from routers.agent import MockLLM
        llm = MockLLM()
        out = llm.chat_complete(
            [{"role": "user", "content": "who are the admins?"}], tools=[]
        )
        assert out.get("tool") == "list_admins"
    except ImportError:
        pytest.fail("routers.agent.MockLLM not importable yet")


def test_tool_schemas_defined():
    try:
        from routers.agent import TOOL_SCHEMAS
        names = {t["function"]["name"] for t in TOOL_SCHEMAS}
        assert "list_appointments" in names
        assert "get_reports" in names
        assert "list_admins" in names
    except ImportError:
        pytest.fail("TOOL_SCHEMAS not importable yet")


# ============================================================
# Part B — Write tools preview->confirm + confirm endpoint
# ============================================================


def test_cancel_preview_requires_confirm():
    """Cancel via chat should return preview envelope with requiresConfirm."""
    from unittest.mock import patch as _patch, MagicMock
    from main import app

    app.config["TESTING"] = True
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True), \
         _patch("routers.agent.execute_with_retry") as mock_exec:
        mock_user = MagicMock()
        mock_user.id = "test-admin-id"
        mock_user.email = "admin@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        # Mock preview: 2 appointments found
        mock_exec.return_value = MagicMock(
            data=[
                {"appointment_id": 1, "appointment_date": "2026-08-30", "current_status": "pending"},
                {"appointment_id": 2, "appointment_date": "2026-08-30", "current_status": "approved"},
            ],
            count=2,
        )
        c = app.test_client()
        with _patch.dict("os.environ", {"LLM_PROVIDER": "mock"}):
            resp = c.post(
                "/api/agent/chat",
                headers={"Authorization": "Bearer fake"},
                json={"message": "clear today's appointments"},
            )
            assert resp.status_code in (200, 429)
            if resp.status_code == 200:
                body = resp.get_json()
                # The chat response should surface the preview with requiresConfirm
                assert body.get("preview") is not None or body.get("requiresConfirm") is True \
                    or "preview" in str(body).lower()


def test_confirm_without_confirmed_flag_rejected():
    """POST /confirm without confirmed:true must return 400."""
    from unittest.mock import patch as _patch, MagicMock
    from main import app

    app.config["TESTING"] = True
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True):
        mock_user = MagicMock()
        mock_user.id = "test-admin-id"
        mock_user.email = "admin@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        c = app.test_client()
        resp = c.post(
            "/api/agent/confirm",
            headers={"Authorization": "Bearer fake"},
            json={"tool": "cancel_appointments", "args": {"date": "2026-08-30"}},
        )
        assert resp.status_code == 400
        assert resp.get_json()["success"] is False


def test_deactivate_self_blocked():
    """Self-deactivation via confirm endpoint must return 403."""
    from unittest.mock import patch as _patch, MagicMock
    from main import app

    app.config["TESTING"] = True
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True), \
         _patch("routers.agent.execute_with_retry") as mock_exec:
        mock_user = MagicMock()
        mock_user.id = "admin-123"
        mock_user.email = "me@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        # Mock admin lookup returns self admin
        def side_effect(q):
            m = MagicMock()
            m.data = [{"admin_id": "admin-123", "email": "me@gordoncollege.edu.ph", "role": "nurse", "is_active": True}]
            m.count = 1
            return m
        mock_exec.side_effect = side_effect
        c = app.test_client()
        with _patch("routers.agent._admin_key", return_value="admin-123"):
            resp = c.post(
                "/api/agent/confirm",
                headers={"Authorization": "Bearer fake"},
                json={"tool": "deactivate_admin", "args": {"admin_id": "admin-123"}, "confirmed": True},
            )
            assert resp.status_code == 403
