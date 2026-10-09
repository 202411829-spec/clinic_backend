# tests/test_auth_email_delivery.py
#
# Email-delivery contract for the three verification-code endpoints:
#   POST /api/auth/send-code          (student signup)
#   POST /api/auth/forgot/send-code   (forgot password)
#   POST /api/auth/admin/send-code    (admin signup)
#
# A 200 "code sent" response must mean a provider actually accepted the
# mail. When SMTP and Resend are BOTH unavailable, the endpoint must
# return the house error envelope ({"success": false, "error": ...})
# instead of fake-succeeding.
#
# Also pins the Gmail-compatible SMTP path: host/port defaults, STARTTLS
# on 587, login with SMTP_USER/SMTP_PASSWORD, From taken from SMTP_FROM.

from unittest.mock import MagicMock

import routers.auth as auth_module

EMAIL = "202411829@gordoncollege.edu.ph"


def _client():
    from main import app
    app.config["TESTING"] = True
    return app.test_client()


def _no_provider(monkeypatch):
    """Force both delivery paths to be unavailable."""
    monkeypatch.setattr(auth_module, "_send_email_via_smtp", lambda email, code: False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)


def _smtp_recorder(monkeypatch, captured):
    """Replace _send_email_via_smtp with a recorder that reports success."""
    def fake_smtp(to_email, code):
        captured["email"] = to_email
        captured["code"] = code
        return True
    monkeypatch.setattr(auth_module, "_send_email_via_smtp", fake_smtp)


def _stub_account_exists(monkeypatch):
    """forgot/send-code checks app_accounts before issuing a code."""
    result = MagicMock()
    result.data = [{"account_id": "acct-1"}]
    monkeypatch.setattr(auth_module, "execute_with_retry", lambda q: result)


def _stub_no_admin_record(monkeypatch):
    """admin/send-code only gates on existing active admin / app accounts."""
    result = MagicMock()
    result.data = []
    monkeypatch.setattr(auth_module, "execute_with_retry", lambda q: result)


def _assert_honest_failure(resp):
    assert resp.status_code != 200, "fake success: endpoint returned 200 with no provider"
    body = resp.get_json()
    assert body["success"] is False
    assert body["error"], "error envelope must carry a frontend-readable message"


# ---------------------------------------------------------------------------
# POST /api/auth/send-code (student signup)
# ---------------------------------------------------------------------------

def test_send_code_success_when_smtp_ok(monkeypatch):
    captured = {}
    _smtp_recorder(monkeypatch, captured)

    resp = _client().post("/api/auth/send-code", json={"email": EMAIL})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    # the code that was "sent" must be stored and valid for signup
    assert auth_module._is_code_valid(EMAIL, captured["code"])


def test_send_code_returns_error_when_all_providers_fail(monkeypatch):
    _no_provider(monkeypatch)

    resp = _client().post("/api/auth/send-code", json={"email": EMAIL})

    _assert_honest_failure(resp)


# ---------------------------------------------------------------------------
# POST /api/auth/forgot/send-code (password reset)
# ---------------------------------------------------------------------------

def test_forgot_send_code_success_when_smtp_ok(monkeypatch):
    captured = {}
    _smtp_recorder(monkeypatch, captured)
    _stub_account_exists(monkeypatch)

    resp = _client().post("/api/auth/forgot/send-code", json={"email": EMAIL})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert auth_module._is_forgot_code_valid(EMAIL, captured["code"])


def test_forgot_send_code_returns_error_when_all_providers_fail(monkeypatch):
    _no_provider(monkeypatch)
    _stub_account_exists(monkeypatch)

    resp = _client().post("/api/auth/forgot/send-code", json={"email": EMAIL})

    _assert_honest_failure(resp)


# ---------------------------------------------------------------------------
# POST /api/auth/admin/send-code (admin signup)
# ---------------------------------------------------------------------------

def test_admin_send_code_success_when_smtp_ok(monkeypatch):
    captured = {}
    _smtp_recorder(monkeypatch, captured)
    _stub_no_admin_record(monkeypatch)

    resp = _client().post("/api/auth/admin/send-code", json={"email": EMAIL})

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert auth_module._is_admin_code_valid(EMAIL, captured["code"])


def test_admin_send_code_returns_error_when_all_providers_fail(monkeypatch):
    _no_provider(monkeypatch)
    _stub_no_admin_record(monkeypatch)

    resp = _client().post("/api/auth/admin/send-code", json={"email": EMAIL})

    _assert_honest_failure(resp)


# ---------------------------------------------------------------------------
# _send_email_via_smtp unit behavior
# ---------------------------------------------------------------------------

def test_smtp_send_requires_credentials(monkeypatch):
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)

    assert auth_module._send_email_via_smtp(EMAIL, "123456") is False


def test_smtp_send_success_invokes_smtplib(monkeypatch):
    # Gmail path: smtp.gmail.com:587 + STARTTLS + login + SMTP_FROM as From.
    monkeypatch.setenv("SMTP_USER", "sender@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password-token")
    monkeypatch.setenv("SMTP_FROM", "clinic@gordoncollege.edu.ph")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_PORT", raising=False)

    calls = {}

    class FakeSMTP:
        def __init__(self, host, port):
            calls["host"] = host
            calls["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            calls["starttls"] = True

        def login(self, user, password):
            calls["login"] = (user, password)

        def sendmail(self, from_addr, to_addrs, message):
            calls["sendmail"] = (from_addr, to_addrs, message)

    monkeypatch.setattr(auth_module.smtplib, "SMTP", FakeSMTP)

    ok = auth_module._send_email_via_smtp(EMAIL, "482916")

    assert ok is True
    assert calls["host"] == "smtp.gmail.com"
    assert calls["port"] == 587
    assert calls["starttls"] is True
    assert calls["login"] == ("sender@gmail.com", "app-password-token")
    from_addr, to_addrs, message = calls["sendmail"]
    assert from_addr == "clinic@gordoncollege.edu.ph"
    assert EMAIL in to_addrs
    assert "482916" in message
