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
