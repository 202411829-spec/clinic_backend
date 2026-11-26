import logging
import time
from unittest.mock import MagicMock

import pytest

import routers.auth as auth
from main import app

STUDENT_EMAIL = "202311330@gordoncollege.edu.ph"
ADMIN_EMAIL = "bautista.kenneth@gordoncollege.edu.ph"


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture(autouse=True)
def clear_otp_stores():
    auth._verification_codes.clear()
    auth._forgot_codes.clear()
    auth._admin_signup_codes.clear()
    yield
    auth._verification_codes.clear()
    auth._forgot_codes.clear()
    auth._admin_signup_codes.clear()


def capture_smtp_code(monkeypatch, succeed=True):
    calls = []

    def fake_smtp(email, code, *args):
        calls.append((email, code))
        return succeed

    monkeypatch.setattr(auth, "_send_email_via_smtp", fake_smtp)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)
    return calls


def disable_all_providers(monkeypatch):
    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)


def mock_execute(monkeypatch, responses):
    iterator = iter(responses)

    def fake_execute(query):
        return MagicMock(data=next(iterator))

    monkeypatch.setattr(auth, "execute_with_retry", fake_execute)


def mock_auth_user(monkeypatch):
    fake_supabase = MagicMock()
    fake_supabase.auth.admin.create_user.return_value = MagicMock(
        user=MagicMock(id="auth-test-id")
    )
    monkeypatch.setattr(auth, "supabase", fake_supabase)


def mock_student_signup_db(monkeypatch):
    mock_execute(monkeypatch, [[], [], [{}], [{}]])
    mock_auth_user(monkeypatch)


def mock_admin_precheck_db(monkeypatch):
    mock_execute(monkeypatch, [[]])


def mock_admin_signup_db(monkeypatch):
    mock_execute(monkeypatch, [[], [], [{"admin_id": "admin-test-id"}], [{}]])
    mock_auth_user(monkeypatch)


def send_student_code(client, monkeypatch, email=STUDENT_EMAIL):
    calls = capture_smtp_code(monkeypatch, succeed=True)
    response = client.post("/api/auth/send-code", json={"email": email})
    assert response.status_code == 200
    return calls[0][1]


def send_admin_code(client, monkeypatch, email=ADMIN_EMAIL):
    mock_admin_precheck_db(monkeypatch)
    calls = capture_smtp_code(monkeypatch, succeed=True)
    response = client.post("/api/auth/admin/send-code", json={"email": email})
    assert response.status_code == 200
    return calls[0][1]


def send_forgot_code(client, monkeypatch, email=STUDENT_EMAIL):
    mock_execute(monkeypatch, [[{"account_id": "account-test-id"}]])
    calls = capture_smtp_code(monkeypatch, succeed=True)
    response = client.post("/api/auth/forgot/send-code", json={"email": email})

    assert response.status_code == 200
    return calls[0][1]


@pytest.mark.parametrize(
    "email",
    [
        "20231133@gordoncollege.edu.ph",
        "student@gordoncollege.edu.ph",
        "bautista.kenneth@gordoncollege.edu.ph",
    ],
)
def test_student_check_email_rejects_non_numeric_student_formats(client, email):
    response = client.post("/api/auth/check-email", json={"email": email})
    assert response.status_code == 400


@pytest.mark.parametrize(
    "email",
    [
        "202311330@gordoncollege.edu.ph",
        "kenneth@gordoncollege.edu.ph",
        "bautista.kenneth123@gordoncollege.edu.ph",
    ],
)
def test_admin_check_email_rejects_non_admin_formats(client, email):
    response = client.post("/api/auth/admin/check-email", json={"email": email})
    assert response.status_code == 400


def test_student_send_code_does_not_store_code_when_delivery_fails(client, monkeypatch):
    disable_all_providers(monkeypatch)

    response = client.post("/api/auth/send-code", json={"email": STUDENT_EMAIL})

    assert response.status_code == 500
    assert STUDENT_EMAIL not in auth._verification_codes


def test_admin_send_code_does_not_store_code_when_delivery_fails(client, monkeypatch):
    mock_admin_precheck_db(monkeypatch)
    disable_all_providers(monkeypatch)

    response = client.post("/api/auth/admin/send-code", json={"email": ADMIN_EMAIL})

    assert response.status_code == 500
    assert ADMIN_EMAIL not in auth._admin_signup_codes


def test_student_signup_accepts_correct_otp(client, monkeypatch):
    code = send_student_code(client, monkeypatch)
    mock_student_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 201
    assert STUDENT_EMAIL not in auth._verification_codes


def test_student_signup_rejects_incorrect_otp(client, monkeypatch):
    send_student_code(client, monkeypatch)
    mock_student_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": "000000",
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert STUDENT_EMAIL in auth._verification_codes


def test_student_signup_rejects_expired_otp(client, monkeypatch):
    code = send_student_code(client, monkeypatch)
    auth._verification_codes[STUDENT_EMAIL] = (code, time.time() - auth.CODE_TTL_SECONDS - 1)
    mock_student_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400


def test_student_resend_replaces_previous_otp(client, monkeypatch):
    first_code = send_student_code(client, monkeypatch)
    second_code = send_student_code(client, monkeypatch)
    mock_student_signup_db(monkeypatch)

    old_response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": first_code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )
    assert old_response.status_code == 400
    assert second_code in auth._verification_codes[STUDENT_EMAIL][0]


def test_admin_signup_accepts_correct_otp(client, monkeypatch):
    code = send_admin_code(client, monkeypatch)
    mock_admin_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
            "first_name": "Kenneth",
            "last_name": "Bautista",
            "role": "admin",
        },
    )

    assert response.status_code == 201
    assert ADMIN_EMAIL not in auth._admin_signup_codes


def test_admin_signup_rejects_incorrect_otp(client, monkeypatch):
    send_admin_code(client, monkeypatch)
    mock_admin_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": "000000",
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
            "first_name": "Kenneth",
            "last_name": "Bautista",
            "role": "admin",
        },
    )

    assert response.status_code == 400
    assert ADMIN_EMAIL in auth._admin_signup_codes


def test_admin_signup_rejects_expired_otp(client, monkeypatch):
    code = send_admin_code(client, monkeypatch)
    entry = auth._admin_signup_codes[ADMIN_EMAIL]
    entry["expires_at"] = time.time() - 1
    mock_admin_signup_db(monkeypatch)

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
            "first_name": "Kenneth",
            "last_name": "Bautista",
            "role": "admin",
        },
    )

    assert response.status_code == 400


def test_admin_resend_replaces_previous_otp(client, monkeypatch):
    first_code = send_admin_code(client, monkeypatch)
    second_code = send_admin_code(client, monkeypatch)

    assert first_code != second_code
    assert auth._admin_signup_codes[ADMIN_EMAIL]["code"] == second_code


def test_student_otp_cannot_authorize_admin_signup(client, monkeypatch):
    code = send_student_code(client, monkeypatch)

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
            "first_name": "Test",
            "last_name": "Student",
            "role": "admin",
        },
    )

    assert response.status_code == 400
    assert ADMIN_EMAIL not in auth._admin_signup_codes


def test_admin_otp_cannot_authorize_student_signup(client, monkeypatch):
    code = send_admin_code(client, monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert ADMIN_EMAIL in auth._admin_signup_codes


def test_resend_uses_configured_from_address(client, monkeypatch):
    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: False)
    monkeypatch.setenv("RESEND_API_KEY", "re_test_dummy_key")
    monkeypatch.setenv("RESEND_FROM", "Clinic <no-reply@example.edu.ph>")
    monkeypatch.setenv("OTP_ALLOW_RESEND_FALLBACK", "1")
    payloads = []
    fake_resend = MagicMock()
    fake_resend.Emails.send.side_effect = lambda payload: payloads.append(payload)
    monkeypatch.setattr(auth, "resend", fake_resend)

    response = client.post("/api/auth/send-code", json={"email": STUDENT_EMAIL})

    assert response.status_code == 200
    assert payloads[0]["from"] == "Clinic <no-reply@example.edu.ph>"


def test_smtp_uses_configured_from_address(monkeypatch):
    monkeypatch.setenv("SMTP_USER", "sender@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("SMTP_FROM", "Clinic <no-reply@example.edu.ph>")
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
            sent_raw.append((sender, recipients, raw))

    monkeypatch.setattr(auth.smtplib, "SMTP", FakeSMTP)

    assert auth._send_email_via_smtp(STUDENT_EMAIL, "123456") is True
    assert "From: Clinic <no-reply@example.edu.ph>" in sent_raw[0][2]
    assert sent_raw[0][0] == "no-reply@example.edu.ph"


def test_send_code_does_not_log_otp(client, monkeypatch, caplog):
    calls = capture_smtp_code(monkeypatch, succeed=True)

    with caplog.at_level(logging.DEBUG):
        response = client.post("/api/auth/send-code", json={"email": STUDENT_EMAIL})

    assert response.status_code == 200
    assert calls[0][1] not in caplog.text


def test_admin_send_rate_limit_is_enforced(client, monkeypatch):
    mock_execute(monkeypatch, [[], [], [], []])
    capture_smtp_code(monkeypatch, succeed=True)

    statuses = [
        client.post("/api/auth/admin/send-code", json={"email": ADMIN_EMAIL}).status_code
        for _ in range(4)
    ]

    assert statuses == [200, 200, 200, 429]


@pytest.mark.parametrize("email", [STUDENT_EMAIL, ADMIN_EMAIL])
def test_forgot_reset_accepts_correct_otp(client, monkeypatch, email):
    code = send_forgot_code(client, monkeypatch, email=email)
    fake_supabase = MagicMock()
    monkeypatch.setattr(auth, "supabase", fake_supabase)
    monkeypatch.setattr(
        auth,
        "_find_auth_user_by_email",
        lambda _email: MagicMock(id="auth-test-id"),
    )

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": email,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 200
    fake_supabase.auth.admin.update_user_by_id.assert_called_once_with(
        "auth-test-id",
        {"password": "NewPassword123"},
    )
    assert email not in auth._forgot_codes


def test_forgot_reset_rejects_incorrect_otp(client, monkeypatch):
    code = send_forgot_code(client, monkeypatch)
    wrong_code = "000000" if code != "000000" else "111111"

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": wrong_code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert STUDENT_EMAIL in auth._forgot_codes


def test_forgot_reset_rejects_expired_otp(client, monkeypatch):
    code = send_forgot_code(client, monkeypatch)
    auth._forgot_codes[STUDENT_EMAIL] = (
        code,
        time.time() - auth.CODE_TTL_SECONDS - 1,
    )

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert STUDENT_EMAIL not in auth._forgot_codes


def test_forgot_resend_invalidates_previous_otp(client, monkeypatch):
    monkeypatch.setattr(auth, "_generate_code", MagicMock(side_effect=["111111", "222222"]))
    mock_execute(monkeypatch, [[{"account_id": "account-test-id"}]] * 2)
    calls = capture_smtp_code(monkeypatch, succeed=True)

    first = client.post("/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL})
    second = client.post("/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL})

    assert first.status_code == 200
    assert second.status_code == 200
    assert [call[1] for call in calls] == ["111111", "222222"]
    old_code_response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": "111111",
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert old_code_response.status_code == 400
    assert auth._forgot_codes[STUDENT_EMAIL][0] == "222222"


def test_signup_otp_cannot_reset_password(client, monkeypatch):
    code = send_student_code(client, monkeypatch)

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert STUDENT_EMAIL in auth._verification_codes
    assert STUDENT_EMAIL not in auth._forgot_codes


def test_forgot_otp_cannot_complete_signup(client, monkeypatch):
    code = send_forgot_code(client, monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )

    assert response.status_code == 400
    assert STUDENT_EMAIL in auth._forgot_codes
    assert STUDENT_EMAIL not in auth._verification_codes


def test_forgot_send_code_does_not_log_otp(client, monkeypatch, caplog):
    mock_execute(monkeypatch, [[{"account_id": "account-test-id"}]])
    calls = capture_smtp_code(monkeypatch, succeed=True)

    with caplog.at_level(logging.DEBUG):
        response = client.post("/api/auth/forgot/send-code", json={"email": STUDENT_EMAIL})

    assert response.status_code == 200
    assert calls[0][1] not in caplog.text
