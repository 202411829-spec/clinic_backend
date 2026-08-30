# tests/test_admin_auth.py
import time
import pytest
from unittest.mock import MagicMock, patch


def test_admin_check_email_not_invited():
    from unittest.mock import patch as _patch
    from main import app
    app.config["TESTING"] = True
    # Mock supabase to return no admin_accounts row
    with _patch("routers.auth.supabase") as mock_sup:
        mock_sup.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
        # Need execute_with_retry to pass through
        with _patch("routers.auth.execute_with_retry", side_effect=lambda q: q.execute()):
            c = app.test_client()
            resp = c.post("/api/auth/admin/check-email", json={"email": "nobody@gordoncollege.edu.ph"})
            assert resp.status_code == 404
            assert resp.get_json()["success"] is False
            assert "Not invited" in resp.get_json()["error"]


def test_admin_signup_rejects_short_password():
    from main import app
    app.config["TESTING"] = True
    c = app.test_client()
    resp = c.post("/api/auth/admin/signup", json={
        "email": "test@gordoncollege.edu.ph",
        "code": "123456",
        "password": "short",
        "confirmPassword": "short"
    })
    assert resp.status_code == 400
