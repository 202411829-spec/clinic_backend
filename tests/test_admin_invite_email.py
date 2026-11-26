# tests/test_admin_invite_email.py
"""Admin invite email delivery and existing-request handling.

No real network calls or emails are sent: SMTP is replaced with an in-memory
fake and the invite sender is patched at the route boundary where needed.
"""
import smtplib
from email import message_from_string
from types import SimpleNamespace

import pytest

import routers.admin_mgmt as admin_mgmt
import routers.auth_guard as auth_guard
from main import app

INVITEE = "josephramos0254@gmail.com"
SUPER_EMAIL = "super.admin@gordoncollege.edu.ph"
AUTH_HEADERS = {"Authorization": "Bearer test-token"}


class FakeQuery:
    def __init__(self, state, table):
        self.state = state
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = {}

    def select(self, *columns):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, count):
        return self

    def execute(self):
        return SimpleNamespace(data=self.state.run(self), error=None)


class FakeState:
    def __init__(self):
        self.admins = []

    def table(self, name):
        return FakeQuery(self, name)

    def _matches(self, row, filters):
        # Supabase .eq() is exact/case-sensitive. Keeping the fake strict is
        # deliberate: the route must normalize legacy casing itself.
        for key, expected in filters.items():
            if row.get(key) != expected:
                return False
        return True

    def run(self, query):
        rows = self.admins
        if query.op == "select":
            return [dict(row) for row in rows if self._matches(row, query.filters)]

        if query.op == "insert":
            row = dict(query.payload)
            row.setdefault("admin_id", f"adm-{len(rows) + 1}")
            rows.append(row)
            return [dict(row)]

        if query.op == "update":
            matched = [row for row in rows if self._matches(row, query.filters)]
            for row in matched:
                row.update(query.payload)
            return [dict(row) for row in matched]

        raise AssertionError(f"Unexpected fake DB operation: {query.op}")


def seed_pending_invite(state, sent_at=None, role="admin", email=INVITEE):
    state.admins.append({
        "admin_id": "adm-existing",
        "email": email,
        "username": "josephramos0254",
        "first_name": "",
        "last_name": "",
        "role": role,
        "is_active": False,
        "invite_email_sent_at": sent_at,
    })


@pytest.fixture
def env(monkeypatch):
    app.config["TESTING"] = True
    state = FakeState()

    fake_supabase = SimpleNamespace(table=state.table)
    monkeypatch.setattr(admin_mgmt, "supabase", fake_supabase)
    monkeypatch.setattr(
        admin_mgmt, "execute_with_retry", lambda query: query.execute()
    )
    monkeypatch.setattr(
        auth_guard,
        "_verify_token",
        lambda token: SimpleNamespace(id="super-auth-id", email=SUPER_EMAIL),
    )
    monkeypatch.setattr(auth_guard, "is_admin_user", lambda user: True)
    monkeypatch.setattr(auth_guard, "is_super_admin_user", lambda user: True)

    yield app.test_client(), state, monkeypatch


def patch_sender(monkeypatch, result=True):
    calls = []

    def sender(email, role, invite_token=None):
        calls.append((email, role, invite_token))
        return result

    monkeypatch.setattr(admin_mgmt, "_send_admin_invite_email", sender)
    return calls


def test_frontend_signup_url_uses_explicit_frontend_url_and_preserves_query(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://clinic.example.edu/")
    monkeypatch.setenv("FRONTEND_ORIGINS", "http://localhost:5173")

    url = admin_mgmt._frontend_signup_url({
        "invite_token": "abc123",
        "source": "email",
    })

    assert url == (
        "https://clinic.example.edu/admin/signup"
        "?invite_token=abc123&source=email"
    )


def test_frontend_signup_url_defaults_to_absolute_local_vite_url(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)

    assert admin_mgmt._frontend_signup_url() == "http://localhost:5173/admin/signup"


def test_frontend_signup_url_prefers_deployed_origin_over_localhost(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173, https://clinic.example.edu",
    )

    assert admin_mgmt._frontend_signup_url() == "https://clinic.example.edu/admin/signup"


def test_successful_email_submission_uses_expected_recipient_and_template(monkeypatch):
    sent = []

    class FakeSMTP:
        def __init__(self, host, port):
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            return None

        def login(self, user, password):
            return None

        def sendmail(self, sender, recipients, raw):
            sent.append((sender, recipients, raw))

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_FROM", "Clinic <sender@example.com>")
    monkeypatch.setenv("FRONTEND_URL", "https://clinic.example.edu")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(admin_mgmt, "resend", None)
    monkeypatch.setattr(admin_mgmt.smtplib, "SMTP", FakeSMTP)

    assert admin_mgmt._send_admin_invite_email(
        INVITEE, "super_admin", "tok-abc123"
    ) is True
    assert len(sent) == 1
    sender, recipients, raw = sent[0]
    msg = message_from_string(raw)
    text_body = msg.get_payload(0).get_payload(decode=True).decode()
    html_body = msg.get_payload(1).get_payload(decode=True).decode()
    expected_url = (
        "https://clinic.example.edu/admin/signup"
        "?email=josephramos0254%40gmail.com"
        "&invite_token=tok-abc123&role=super_admin"
    )

    assert sender == "sender@example.com"
    assert recipients == INVITEE
    assert msg["Subject"] == "GCCAS admin invitation"
    assert msg["To"] == INVITEE
    assert "Super Admin" in text_body
    assert INVITEE in text_body
    assert f"Sign up here: {expected_url}" in text_body
    assert f'href="{expected_url.replace("&", "&amp;")}"' in html_body
    assert "activated automatically" in text_body


def test_smtp_failure_returns_false_without_falling_back_to_configured_resend(monkeypatch):
    class FailingSMTP:
        def __init__(self, host, port):
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            raise smtplib.SMTPException("simulated smtp failure")

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_FROM", "Clinic <sender@example.com>")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(admin_mgmt, "resend", None)
    monkeypatch.setattr(admin_mgmt.smtplib, "SMTP", FailingSMTP)

    assert admin_mgmt._send_admin_invite_email(INVITEE, "admin") is False


def test_smtp_refused_recipient_does_not_confirm_submission(monkeypatch):
    class RefusingSMTP:
        def __init__(self, host, port):
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            return None

        def login(self, user, password):
            return None

        def sendmail(self, sender, recipients, raw):
            # smtplib signals a refused recipient through its return value.
            return {INVITEE: (550, b"simulated refusal")}

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_FROM", "Clinic <sender@example.com>")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(admin_mgmt, "resend", None)
    monkeypatch.setattr(admin_mgmt.smtplib, "SMTP", RefusingSMTP)

    assert admin_mgmt._send_admin_invite_email(INVITEE, "admin") is False


def test_resend_error_response_does_not_confirm_submission(monkeypatch):
    class FakeResend:
        api_key = None

        class Emails:
            @staticmethod
            def send(payload):
                return {"error": {"message": "simulated provider rejection"}}

    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "dummy-key")
    monkeypatch.setenv("RESEND_FROM", "Clinic <sender@example.com>")
    monkeypatch.setattr(admin_mgmt, "resend", FakeResend)

    assert admin_mgmt._send_admin_invite_email(INVITEE, "admin") is False


def test_new_invite_sends_email_and_reports_real_success(env, monkeypatch):
    client, state, monkeypatch = env
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin"},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["email_sent"] is True
    assert body["created"] is True
    assert body["message"] == "Invite sent."
    assert len(state.admins) == 1
    assert state.admins[0]["invite_email_sent_at"]
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "admin")]


def test_new_invite_stores_token_and_uses_it_in_email_link(env, monkeypatch):
    client, state, monkeypatch = env
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "super_admin"},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 201, resp.get_json()
    token = state.admins[0].get("invitation_token")
    assert token and len(token) >= 32
    assert "invitation_token" not in resp.get_json()["admin"]
    assert calls == [(INVITEE, "super_admin", token)]


def test_existing_request_without_email_sends_without_duplicate(env, monkeypatch):
    client, state, monkeypatch = env
    seed_pending_invite(state, sent_at=None)
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin"},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["email_sent"] is True
    assert body["created"] is False
    assert len(state.admins) == 1
    assert state.admins[0]["invite_email_sent_at"]
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "admin")]


def test_existing_request_already_sent_does_not_resend_without_flag(env, monkeypatch):
    client, state, monkeypatch = env
    seed_pending_invite(state, sent_at="2026-11-25T10:00:00+00:00")
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin"},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["email_sent"] is False
    assert body["already_sent"] is True
    assert "already sent" in body["message"].lower()
    assert calls == []
    assert len(state.admins) == 1


def test_explicit_resend_sends_again_without_creating_duplicate(env, monkeypatch):
    client, state, monkeypatch = env
    seed_pending_invite(
        state,
        sent_at="2026-11-25T10:00:00+00:00",
        role="super_admin",
    )
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin", "resend": True},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["email_sent"] is True
    assert body["resent"] is True
    assert body["created"] is False
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "super_admin")]
    assert len(state.admins) == 1


def test_smtp_failure_returns_failure_and_preserves_request_for_retry(env, monkeypatch):
    client, state, monkeypatch = env
    calls = patch_sender(monkeypatch, False)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin"},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 502, resp.get_json()
    body = resp.get_json()
    assert body["success"] is False
    assert body["email_sent"] is False
    assert body["created"] is True
    assert "could not be sent" in body["error"].lower()
    assert len(state.admins) == 1
    assert state.admins[0]["is_active"] is False
    assert state.admins[0].get("invite_email_sent_at") is None
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "admin")]


def test_explicit_resend_failure_returns_real_error_and_preserves_request(env, monkeypatch):
    client, state, monkeypatch = env
    seed_pending_invite(state, sent_at="2026-11-25T10:00:00+00:00")
    calls = patch_sender(monkeypatch, False)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin", "resend": True},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 502, resp.get_json()
    body = resp.get_json()
    assert body["success"] is False
    assert body["email_sent"] is False
    assert body["resent"] is True
    assert body["created"] is False
    assert "could not be sent" in body["error"].lower()
    assert len(state.admins) == 1
    assert state.admins[0]["is_active"] is False
    assert state.admins[0]["invite_email_sent_at"] == "2026-11-25T10:00:00+00:00"
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "admin")]


def test_resend_reuses_mixed_case_request_without_duplicate(env, monkeypatch):
    client, state, monkeypatch = env
    seed_pending_invite(state, sent_at=None, email=INVITEE.upper())
    calls = patch_sender(monkeypatch, True)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE, "role": "admin", "resend": True},
        headers=AUTH_HEADERS,
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["email_sent"] is True
    assert body["created"] is False
    assert len(state.admins) == 1
    assert state.admins[0]["invite_email_sent_at"]
    assert [(email, role) for email, role, _ in calls] == [(INVITEE, "admin")]
