# tests/test_auth_email_delivery.py
"""Honest-failure behavior for OTP email delivery.

When providers fail — including soft failures such as SMTP refused
recipients or a Resend error response body — the OTP endpoints used by
student/admin signup and student/admin forgot-password must return HTTP
500 with an error envelope, never a fake HTTP 200.
All code-email subjects must be exactly "GCCAS OTP".
"""
import logging
import smtplib
from unittest.mock import MagicMock

import pytest

from main import app

GCCAS_OTP_SUBJECT = "GCCAS OTP"
SEND_FAILURE_MESSAGE = "Could not send the verification email"


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _force_all_providers_down(monkeypatch):
    """SMTP returns False; Resend is configured but its send raises."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    fake_resend = MagicMock()
    fake_resend.Emails.send.side_effect = Exception("resend unavailable")
    monkeypatch.setattr(auth, "resend", fake_resend)


def _force_no_provider(monkeypatch):
    """SMTP returns False; no Resend key and no resend module at all."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)


def _assert_honest_failure(resp):
    assert resp.status_code == 500, f"expected 500, got {resp.status_code}"
    body = resp.get_json()
    assert body["success"] is False
    assert SEND_FAILURE_MESSAGE in body["error"]


def _post_send_code(client, monkeypatch, flow, email):
    """Send an OTP through one of the four frontend-facing OTP flows."""
    import routers.auth as auth

    if flow == "student_signup":
        return client.post("/api/auth/send-code", json={"email": email})
    if flow == "admin_signup":
        monkeypatch.setattr(
            auth,
            "execute_with_retry",
            MagicMock(return_value=MagicMock(data=[])),
        )
        return client.post("/api/auth/admin/send-code", json={"email": email})
    if flow in ("student_forgot", "admin_forgot"):
        monkeypatch.setattr(
            auth,
            "execute_with_retry",
            MagicMock(return_value=MagicMock(data=[{"account_id": "acc-1"}])),
        )
        return client.post("/api/auth/forgot/send-code", json={"email": email})
    raise AssertionError(f"unknown flow: {flow}")


OTP_FLOWS = (
    ("student_signup", "202311340@gordoncollege.edu.ph"),
    ("admin_signup", "dela.test@gordoncollege.edu.ph"),
    ("student_forgot", "202311341@gordoncollege.edu.ph"),
    ("admin_forgot", "reyes.test@gordoncollege.edu.ph"),
)


# ------------------------------------------------------------------
# (a) Send failure -> honest 500
# ------------------------------------------------------------------

def test_student_send_code_returns_500_when_email_send_fails(client, monkeypatch):
    _force_all_providers_down(monkeypatch)
    resp = client.post(
        "/api/auth/send-code",
        json={"email": "202311330@gordoncollege.edu.ph"},
    )
    _assert_honest_failure(resp)


def test_student_send_code_returns_500_when_no_provider_configured(client, monkeypatch):
    _force_no_provider(monkeypatch)
    resp = client.post(
        "/api/auth/send-code",
        json={"email": "202311331@gordoncollege.edu.ph"},
    )
    _assert_honest_failure(resp)


def test_admin_send_code_returns_500_when_email_send_fails(client, monkeypatch):
    _force_all_providers_down(monkeypatch)
    import routers.auth as auth

    # No existing admin row for this email -> passes the pre-send checks.
    monkeypatch.setattr(
        auth, "execute_with_retry", MagicMock(return_value=MagicMock(data=[]))
    )
    resp = client.post(
        "/api/auth/admin/send-code",
        json={"email": "dela.cruz@gordoncollege.edu.ph"},
    )
    _assert_honest_failure(resp)


def test_forgot_send_code_returns_500_when_email_send_fails(client, monkeypatch):
    _force_all_providers_down(monkeypatch)
    import routers.auth as auth

    # Account exists -> passes the existence check and reaches the send step.
    monkeypatch.setattr(
        auth,
        "execute_with_retry",
        MagicMock(return_value=MagicMock(data=[{"account_id": "acc-1"}])),
    )
    resp = client.post(
        "/api/auth/forgot/send-code",
        json={"email": "202399992@gordoncollege.edu.ph"},
    )
    _assert_honest_failure(resp)


def test_forgot_send_code_sanitizes_transport_exceptions(client, monkeypatch, caplog):
    """A raw socket error must be logged safely, not returned to the browser."""
    import routers.auth as auth

    monkeypatch.setattr(
        auth,
        "execute_with_retry",
        MagicMock(side_effect=ConnectionRefusedError(
            10061, "No connection could be made because the target machine actively refused it"
        )),
    )

    with caplog.at_level(logging.ERROR):
        resp = client.post(
            "/api/auth/forgot/send-code",
            json={"email": "202399995@gordoncollege.edu.ph"},
        )

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["success"] is False
    assert "10061" not in body["error"]
    assert "winerror" not in body["error"].lower()
    assert "actively refused" not in body["error"].lower()
    assert "ConnectionRefusedError" in caplog.text
    assert "code=10061" in caplog.text


# ------------------------------------------------------------------
# (a2) Provider "soft failures" must not advance users to code entry
# ------------------------------------------------------------------

def _otp_store(auth, flow):
    if flow == "student_signup":
        return auth._verification_codes
    if flow == "admin_signup":
        return auth._admin_signup_codes
    return auth._forgot_codes


@pytest.mark.parametrize(("flow", "email"), OTP_FLOWS)
def test_smtp_refused_recipient_is_honest_failure(
    client, monkeypatch, flow, email
):
    """smtplib reports refused recipients in its return value, not by raising."""
    import routers.auth as auth

    known_code = "246802"
    monkeypatch.setattr(auth, "_generate_code", lambda: known_code)
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class RefusingSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def sendmail(self, sender, recipients, raw):
            return {email: (550, b"5.1.1 recipient rejected")}

    monkeypatch.setattr(auth.smtplib, "SMTP", RefusingSMTP)
    store = _otp_store(auth, flow)
    store.pop(email, None)

    resp = _post_send_code(client, monkeypatch, flow, email)

    _assert_honest_failure(resp)
    assert email not in store, "OTP was stored despite recipient refusal"
    assert known_code not in resp.get_data(as_text=True)


@pytest.mark.parametrize(("flow", "email"), OTP_FLOWS)
def test_resend_error_body_is_honest_failure(
    client, monkeypatch, flow, email
):
    """Resend can return an error body instead of raising; that is not success."""
    import routers.auth as auth

    known_code = "864209"
    monkeypatch.setattr(auth, "_generate_code", lambda: known_code)
    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    monkeypatch.setenv("OTP_ALLOW_RESEND_FALLBACK", "1")
    fake_resend = MagicMock()
    fake_resend.Emails.send.return_value = {
        "error": {"message": "domain not verified"}
    }
    monkeypatch.setattr(auth, "resend", fake_resend)
    store = _otp_store(auth, flow)
    store.pop(email, None)

    resp = _post_send_code(client, monkeypatch, flow, email)

    _assert_honest_failure(resp)
    assert fake_resend.Emails.send.called
    assert email not in store, "OTP was stored despite Resend error body"
    assert known_code not in resp.get_data(as_text=True)


# ------------------------------------------------------------------
# (a3) Recipient, envelope, headers, and provider reply captured
# ------------------------------------------------------------------

@pytest.mark.parametrize(("flow", "email"), OTP_FLOWS)
def test_otp_uses_entered_recipient_not_configured_sender(
    client, monkeypatch, flow, email
):
    """The configured sender must never replace the user-entered recipient."""
    import routers.auth as auth

    decoy_sender = "configured-sender@example.test"
    monkeypatch.setenv("SMTP_FROM", decoy_sender)
    captured = []
    monkeypatch.setattr(
        auth,
        "_send_verification_email",
        lambda to_email, code, *args: captured.append(to_email) or True,
    )

    resp = _post_send_code(client, monkeypatch, flow, email)

    assert resp.status_code == 200
    assert captured == [email]
    assert captured[0] != decoy_sender


def test_admin_invitation_uses_invited_recipient_not_configured_sender(
    client, monkeypatch
):
    """Invitation tokens keep their canonical invited email as the recipient."""
    import routers.auth as auth

    invited_email = "santos.maria@gordoncollege.edu.ph"
    decoy_sender = "configured-sender@example.test"
    monkeypatch.setenv("SMTP_FROM", decoy_sender)
    monkeypatch.setattr(
        auth,
        "_resolve_admin_invitation",
        lambda token: (None, invited_email, None),
    )
    captured = []
    monkeypatch.setattr(
        auth,
        "_send_verification_email",
        lambda to_email, code, *args: captured.append(to_email) or True,
    )

    resp = client.post(
        "/api/auth/admin/send-code",
        json={"email": "stale.person@gordoncollege.edu.ph", "invitation_token": "tok"},
    )

    assert resp.status_code == 200
    assert captured == [invited_email]
    assert captured[0] != decoy_sender


def test_otp_smtp_message_has_text_alternative_and_traceable_headers(
    client, monkeypatch, caplog
):
    """Capture the real OTP envelope/headers without logging or asserting the code."""
    import logging
    import os
    from email import message_from_string
    from email.utils import parseaddr

    import routers.auth as auth

    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_FROM", "Clinic <no-reply@example.edu.ph>")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    captured = {"rcpt": [], "envelope": None, "raw": None}

    class CapturingSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def rcpt(self, address):
            captured["rcpt"].append(address)
            return (250, b"recipient ok")

        def data(self, raw_message):
            captured["raw"] = raw_message
            return (250, b"queued")

        def sendmail(self, sender, recipients, raw):
            recipient_list = [recipients] if isinstance(recipients, str) else list(recipients)
            captured["envelope"] = (sender, recipient_list)
            for recipient in recipient_list:
                self.rcpt(recipient)
            self.data(raw)
            return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", CapturingSMTP)
    recipient = "202311399@gordoncollege.edu.ph"

    with caplog.at_level(logging.INFO):
        resp = client.post("/api/auth/send-code", json={"email": recipient})

    assert resp.status_code == 200
    msg = message_from_string(captured["raw"])
    expected_sender = parseaddr(os.environ["SMTP_FROM"])[1]
    assert msg["To"] == recipient
    assert parseaddr(msg["From"])[1] == expected_sender
    assert msg["Subject"] == "GCCAS OTP"
    assert msg["Message-ID"]
    assert msg["Date"]
    assert sorted(part.get_content_type() for part in msg.get_payload()) == [
        "text/html",
        "text/plain",
    ]
    assert captured["rcpt"] == [recipient]
    assert captured["envelope"] == (expected_sender, [recipient])
    assert "message_id=" in caplog.text
    assert "data_code=250" in caplog.text


@pytest.mark.parametrize(("flow", "email"), OTP_FLOWS)
def test_smtp_deferred_data_reply_is_honest_failure(
    client, monkeypatch, caplog, flow, email
):
    """A 4xx DATA reply must not be treated as provider acceptance."""
    import logging

    import routers.auth as auth

    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class DeferringSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def rcpt(self, address):
            return (250, b"recipient ok")

        def data(self, raw_message):
            return (451, b"temporary provider failure")

        def sendmail(self, sender, recipients, raw):
            recipient_list = [recipients] if isinstance(recipients, str) else list(recipients)
            for recipient in recipient_list:
                self.rcpt(recipient)
            self.data(raw)
            return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", DeferringSMTP)
    store = _otp_store(auth, flow)
    store.pop(email, None)

    with caplog.at_level(logging.INFO):
        resp = _post_send_code(client, monkeypatch, flow, email)

    _assert_honest_failure(resp)
    assert email not in store
    assert "SMTP send failed" in caplog.text
    assert "data_code=451" in caplog.text


# ------------------------------------------------------------------
# (b) Success -> subject is exactly "GCCAS OTP"
# ------------------------------------------------------------------

def test_smtp_email_subject_is_gccas_otp(client, monkeypatch):
    """Real _send_email_via_smtp builds the message; capture it at sendmail."""
    import routers.auth as auth
    from email import message_from_string

    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")

    sent_raw = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def sendmail(self, sender, recipients, raw):
            sent_raw.append(raw)

    monkeypatch.setattr(auth.smtplib, "SMTP", FakeSMTP)

    resp = client.post(
        "/api/auth/send-code",
        json={"email": "202311332@gordoncollege.edu.ph"},
    )
    assert resp.status_code == 200
    assert sent_raw, "SMTP sendmail was never called"
    msg = message_from_string(sent_raw[0])
    assert msg["Subject"] == GCCAS_OTP_SUBJECT


def _capture_resend_payloads(monkeypatch):
    """SMTP fails, Resend configured and succeeding; return the payload list."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    monkeypatch.setenv("OTP_ALLOW_RESEND_FALLBACK", "1")
    payloads = []
    fake_resend = MagicMock()
    fake_resend.Emails.send.side_effect = lambda payload: payloads.append(payload)
    monkeypatch.setattr(auth, "resend", fake_resend)
    return payloads


def test_resend_subject_is_gccas_otp_student(client, monkeypatch):
    payloads = _capture_resend_payloads(monkeypatch)
    resp = client.post(
        "/api/auth/send-code",
        json={"email": "202311333@gordoncollege.edu.ph"},
    )
    assert resp.status_code == 200
    assert payloads, "Resend send() was never called"
    assert payloads[0]["subject"] == GCCAS_OTP_SUBJECT


def test_resend_subject_is_gccas_otp_admin(client, monkeypatch):
    payloads = _capture_resend_payloads(monkeypatch)
    import routers.auth as auth

    monkeypatch.setattr(
        auth, "execute_with_retry", MagicMock(return_value=MagicMock(data=[]))
    )
    resp = client.post(
        "/api/auth/admin/send-code",
        json={"email": "santos.maria@gordoncollege.edu.ph"},
    )
    assert resp.status_code == 200
    assert payloads, "Resend send() was never called"
    assert payloads[0]["subject"] == GCCAS_OTP_SUBJECT


def test_resend_subject_is_gccas_otp_forgot(client, monkeypatch):
    payloads = _capture_resend_payloads(monkeypatch)
    import routers.auth as auth

    monkeypatch.setattr(
        auth,
        "execute_with_retry",
        MagicMock(return_value=MagicMock(data=[{"account_id": "acc-1"}])),
    )
    resp = client.post(
        "/api/auth/forgot/send-code",
        json={"email": "reyes.juan@gordoncollege.edu.ph"},
    )
    assert resp.status_code == 200
    assert payloads, "Resend send() was never called"
    assert payloads[0]["subject"] == GCCAS_OTP_SUBJECT


# ------------------------------------------------------------------
# (c) Failure diagnostics -> log names the failing stage, never the OTP
# ------------------------------------------------------------------

def test_forgot_send_code_failure_logs_failing_stage_without_otp(
    client, monkeypatch, caplog
):
    """A forgot-password 500 must be traceable in backend logs.

    When delivery fails, an error-level log identifies the failing
    provider stage(s) and the flow, while neither the logs nor the
    response expose the OTP itself.
    """
    import routers.auth as auth

    known_code = "135791"
    monkeypatch.setattr(auth, "_generate_code", lambda: known_code)
    _force_all_providers_down(monkeypatch)
    monkeypatch.setattr(
        auth,
        "execute_with_retry",
        MagicMock(return_value=MagicMock(data=[{"account_id": "acc-1"}])),
    )

    with caplog.at_level(logging.DEBUG):
        resp = client.post(
            "/api/auth/forgot/send-code",
            json={"email": "202399994@gordoncollege.edu.ph"},
        )

    _assert_honest_failure(resp)

    error_logs = [
        record.getMessage()
        for record in caplog.records
        if record.levelno >= logging.ERROR
    ]
    stage_log = next(
        (
            message
            for message in error_logs
            if "smtp" in message.lower() and "resend" in message.lower()
        ),
        None,
    )
    assert stage_log, (
        "expected an error-level log naming the failing email stages; "
        f"got: {error_logs or 'none'}"
    )
    # The log must identify which flow failed (password reset).
    assert "password reset" in stage_log
    # The OTP must never appear anywhere in the logs.
    assert known_code not in caplog.text


# ------------------------------------------------------------------
# (d) Provider exceptions must never leak the OTP into logs
# ------------------------------------------------------------------

KNOWN_OTP = "135791"


def _smtp_class_failing_at(stage, exc):
    """Build a FakeSMTP whose login() or sendmail() raises *exc*."""

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            if stage == "login":
                raise exc

        def sendmail(self, sender, recipients, raw):
            if stage == "sendmail":
                raise exc

    return FakeSMTP


def _post_student_send_code(client):
    return client.post(
        "/api/auth/send-code",
        json={"email": "202311335@gordoncollege.edu.ph"},
    )


def test_smtp_auth_failure_logs_do_not_leak_otp(client, monkeypatch, caplog):
    """The SMTP auth-failure log must not echo an exception that embeds the OTP."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_generate_code", lambda: KNOWN_OTP)
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)
    auth_error = smtplib.SMTPAuthenticationError(
        535, f"5.7.8 credentials rejected for code {KNOWN_OTP}".encode()
    )
    monkeypatch.setattr(
        auth.smtplib, "SMTP", _smtp_class_failing_at("login", auth_error)
    )

    with caplog.at_level(logging.DEBUG):
        resp = _post_student_send_code(client)

    _assert_honest_failure(resp)
    # The stage diagnostic survives...
    assert "SMTP authentication failed" in caplog.text
    # ...but the OTP embedded in the exception never reaches the logs.
    assert KNOWN_OTP not in caplog.text


def test_smtp_send_failure_logs_do_not_leak_otp(client, monkeypatch, caplog):
    """The SMTP send-failure log must not echo an exception that embeds the OTP."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_generate_code", lambda: KNOWN_OTP)
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)
    send_error = RuntimeError(f"provider echoed the request body: {KNOWN_OTP}")
    monkeypatch.setattr(
        auth.smtplib, "SMTP", _smtp_class_failing_at("sendmail", send_error)
    )

    with caplog.at_level(logging.DEBUG):
        resp = _post_student_send_code(client)

    _assert_honest_failure(resp)
    # The stage diagnostic survives...
    assert "SMTP send failed" in caplog.text
    # ...but the OTP embedded in the exception never reaches the logs.
    assert KNOWN_OTP not in caplog.text


def test_smtp_connection_failure_logs_stage_and_config_without_code(
    client, monkeypatch, caplog
):
    """Connection failures should identify host/port/mode without secrets or OTP."""
    import routers.auth as auth

    known_code = "246813"
    monkeypatch.setattr(auth, "_generate_code", lambda: known_code)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "do-not-log-me")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class RefusingSMTP:
        def __init__(self, host, port, timeout=None):
            raise ConnectionRefusedError(10061, "actively refused")

    monkeypatch.setattr(auth.smtplib, "SMTP", RefusingSMTP)

    with caplog.at_level(logging.DEBUG):
        resp = _post_student_send_code(client)

    _assert_honest_failure(resp)
    assert "SMTP send failed at connect" in caplog.text
    assert "smtp.example.test:2525 (STARTTLS)" in caplog.text
    assert "ConnectionRefusedError code=10061" in caplog.text
    assert known_code not in caplog.text
    assert "do-not-log-me" not in caplog.text


def test_resend_failure_logs_do_not_leak_otp(client, monkeypatch, caplog):
    """The Resend-failure log must not echo an exception that embeds the OTP."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_generate_code", lambda: KNOWN_OTP)
    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    monkeypatch.setenv("OTP_ALLOW_RESEND_FALLBACK", "1")
    fake_resend = MagicMock()
    fake_resend.Emails.send.side_effect = Exception(
        f"request payload {KNOWN_OTP} rejected"
    )
    monkeypatch.setattr(auth, "resend", fake_resend)

    with caplog.at_level(logging.DEBUG):
        resp = _post_student_send_code(client)

    _assert_honest_failure(resp)
    # The stage diagnostic survives...
    assert "Resend email failed" in caplog.text
    # ...but the OTP embedded in the exception never reaches the logs.
    assert KNOWN_OTP not in caplog.text


def test_send_code_success_message_mentions_possible_delay(client, monkeypatch):
    """Success response should set expectation that inbox delivery may lag."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_generate_code", lambda: "135790")
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class AcceptingSMTP:
        def __init__(self, host, port, timeout=None):
            pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def ehlo(self): pass
        def starttls(self): pass
        def login(self, user, password): pass
        def sendmail(self, sender, recipients, raw): return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", AcceptingSMTP)
    resp = client.post("/api/auth/send-code", json={"email": "202311332@gordoncollege.edu.ph"})
    assert resp.status_code == 200
    msg = resp.get_json().get("message", "").lower()
    assert "may take a minute" in msg


def test_admin_send_code_success_message_mentions_possible_delay(client, monkeypatch):
    import routers.auth as auth

    monkeypatch.setattr(auth, "_generate_code", lambda: "135790")
    monkeypatch.setattr(auth, "execute_with_retry", MagicMock(return_value=MagicMock(data=[])))
    monkeypatch.setenv("SMTP_USER", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    class AcceptingSMTP:
        def __init__(self, host, port, timeout=None): pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False
        def ehlo(self): pass
        def starttls(self): pass
        def login(self, user, password): pass
        def sendmail(self, sender, recipients, raw): return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", AcceptingSMTP)
    resp = client.post("/api/auth/admin/send-code", json={"email": "santos.maria@gordoncollege.edu.ph"})
    assert resp.status_code == 200
    msg = resp.get_json().get("message", "").lower()
    assert "may take a minute" in msg


def test_resend_fallback_is_disabled_by_default(monkeypatch):
    """A failed SMTP attempt must not add a second provider delay by default."""
    import routers.auth as auth

    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    monkeypatch.delenv("OTP_ALLOW_RESEND_FALLBACK", raising=False)
    fake_resend = MagicMock()
    monkeypatch.setattr(auth, "resend", fake_resend)

    assert auth._send_verification_email("student@gordoncollege.edu.ph", "135790") is False
    assert not fake_resend.Emails.send.called


def test_smtp_timeout_environment_value_is_applied(monkeypatch):
    import routers.auth as auth

    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_TIMEOUT_SECONDS", "2.5")
    captured = {}

    class TimeoutSMTP:
        def __init__(self, host, port, timeout=None):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def sendmail(self, sender, recipients, raw):
            return {}

    monkeypatch.setattr(auth.smtplib, "SMTP", TimeoutSMTP)

    assert auth._send_email_via_smtp("student@gordoncollege.edu.ph", "135790") is True
    assert captured["timeout"] == 2.5

