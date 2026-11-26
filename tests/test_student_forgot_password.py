# tests/test_student_forgot_password.py
"""Student Forgot Password-only recipient resolution and SMTP diagnostics.

Admin forgot-password and both signup OTP flows are intentionally out of scope.
"""
import logging
import smtplib
from unittest.mock import MagicMock

import pytest

from main import app

STUDENT_EMAIL = "202311340@gordoncollege.edu.ph"
MASKED_STUDENT_EMAIL = "2***@gordoncollege.edu.ph"
REGISTERED_EMAIL = "202399991@gordoncollege.edu.ph"
MASKED_REGISTERED_EMAIL = "2***@gordoncollege.edu.ph"


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture(autouse=True)
def clear_codes():
    import routers.auth as auth

    auth._forgot_codes.clear()
    yield
    auth._forgot_codes.clear()


def _mock_student_account(monkeypatch, row):
    import routers.auth as auth

    execute = MagicMock(return_value=MagicMock(data=[row]))
    monkeypatch.setattr(auth, "execute_with_retry", execute)
    return execute


def _capture_verification_email(monkeypatch, succeed=True):
    import routers.auth as auth

    calls = []

    def fake_send(to_email, code, code_label="verification", flow_context=None):
        calls.append((to_email, code, code_label, flow_context))
        return succeed

    monkeypatch.setattr(auth, "_send_verification_email", fake_send)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)
    return calls


def test_student_forgot_sends_to_registered_email_from_lookup(client, monkeypatch):
    """The OTP recipient comes from the student account row, not the input string."""
    import routers.auth as auth

    _mock_student_account(monkeypatch, {
        "account_id": "acc-student",
        "email": REGISTERED_EMAIL,
        "account_type": "student",
    })
    calls = _capture_verification_email(monkeypatch)

    response = client.post(
        "/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL}
    )

    assert response.status_code == 200
    assert response.get_json()["message"] == auth.FORGOT_GENERIC_MESSAGE
    assert len(calls) == 1
    assert calls[0][0] == REGISTERED_EMAIL
    assert calls[0][2] == "password reset"
    assert calls[0][3] == "student_forgot"
    assert STUDENT_EMAIL in auth._forgot_codes


def test_student_forgot_missing_account_does_not_send(client, monkeypatch, caplog):
    """No account returns a clear error, sends nothing, and stores no OTP."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "execute_with_retry", lambda _q: MagicMock(data=[]))
    calls = _capture_verification_email(monkeypatch)

    with caplog.at_level(logging.WARNING):
        response = client.post(
            "/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL}
        )

    body = response.get_json()
    assert response.status_code == 404
    assert body["success"] is False
    assert body["error"] == auth.STUDENT_FORGOT_ACCOUNT_NOT_FOUND_MESSAGE
    assert "no account" in body["error"].lower()
    assert calls == []
    assert STUDENT_EMAIL not in auth._forgot_codes
    assert "Student forgot OTP lookup no account" in caplog.text
    assert f"masked_email={MASKED_STUDENT_EMAIL}" in caplog.text
    assert STUDENT_EMAIL not in caplog.text


def test_student_forgot_provider_rejection_returns_500(client, monkeypatch):
    """The endpoint cannot report success unless the provider accepts the message."""
    import routers.auth as auth

    _mock_student_account(monkeypatch, {
        "account_id": "acc-student",
        "email": STUDENT_EMAIL,
        "account_type": "student",
    })
    monkeypatch.setattr(
        auth, "_send_verification_email", lambda *args, **kwargs: False
    )

    response = client.post(
        "/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL}
    )

    assert response.status_code == 500
    assert "Could not send the verification email" in response.get_json()["error"]
    assert STUDENT_EMAIL not in auth._forgot_codes


def test_student_forgot_lookup_exception_is_logged_safely(client, monkeypatch, caplog):
    """Lookup failures are logged with a masked address and no provider text."""
    import routers.auth as auth

    monkeypatch.setattr(
        auth,
        "execute_with_retry",
        lambda _q: (_ for _ in ()).throw(
            ConnectionRefusedError(
                10061, f"secret detail for {STUDENT_EMAIL}"
            )
        ),
    )

    with caplog.at_level(logging.ERROR):
        response = client.post(
            "/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL}
        )

    assert response.status_code == 500
    assert "Student forgot OTP lookup failed" in caplog.text
    assert f"masked_email={MASKED_STUDENT_EMAIL}" in caplog.text
    assert "error=ConnectionRefusedError" in caplog.text
    assert "secret detail" not in caplog.text
    assert STUDENT_EMAIL not in caplog.text


def test_student_forgot_smtp_logs_masked_recipient_and_acceptance(
    client, monkeypatch, caplog
):
    """SMTP logs carry flow, masked recipient, RCPT/DATA codes, and message ID."""
    import routers.auth as auth

    _mock_student_account(monkeypatch, {
        "account_id": "acc-student",
        "email": STUDENT_EMAIL,
        "account_type": "student",
    })
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("OTP_ALLOW_RESEND_FALLBACK", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            self.recipients = []

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def ehlo(self):
            return (250, b"ok")

        def starttls(self):
            return (220, b"ready")

        def login(self, user, password):
            return (235, b"ok")

        def rcpt(self, address, *args, **kwargs):
            self.recipients.append(address)
            return (250, b"ok")

        def data(self, raw_message):
            return (250, b"queued")

        def sendmail(self, sender, recipients, raw_message):
            if isinstance(recipients, str):
                recipients = [recipients]
            for recipient in recipients:
                reply = self.rcpt(recipient)
                if reply[0] != 250:
                    return {recipient: reply}
            reply = self.data(raw_message)
            if reply[0] != 250:
                raise smtplib.SMTPDataError(reply[0], reply[1])
            return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", FakeSMTP)

    with caplog.at_level(logging.INFO):
        response = client.post(
            "/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL}
        )

    assert response.status_code == 200
    assert "flow=student_forgot" in caplog.text
    assert f"masked_recipient={MASKED_REGISTERED_EMAIL}" in caplog.text
    assert "rcpt_codes=[250]" in caplog.text
    assert "data_code=250" in caplog.text
    assert "message_id=" in caplog.text
    assert STUDENT_EMAIL not in caplog.text
