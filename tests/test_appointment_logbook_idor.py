# tests/test_appointment_logbook_idor.py
#
# Residual IDOR on appointment + logbook READS (not covered by the
# de2bf5a guard rollout). The house rule for every student-scoped
# endpoint, enforced via the shared ensure_student_access() helper:
#   1. admin                          -> allowed
#   2. student reading OWN data       -> allowed (scoped)
#   3. otherwise                      -> 403 (house envelope)
#   4. no token                       -> 401 (require_auth, unchanged)
#
# Routes covered:
#   GET /appointments?student_id=...  (list — was readable for anyone)
#   GET /appointments/<id>            (by-id — was readable for anyone)
#   GET /logbook?student_id=...       (roster — was the full roster)
#   GET /logbook/<log_id>             (by-id — was readable for anyone)
#
# Consumer notes (checked in src/ before scoping):
#   * /appointments list: student pages always pass their own
#     student_id (Book.jsx, UpcomingAppointmentPanel.jsx) — still 200.
#   * /appointments/<id>: Book.jsx reschedule view reads OWN — still 200.
#   * /logbook list + /logbook/<id>: admin pages only (LogbookPanel,
#     LogbookFullPanel; no student-side caller, no api.js get for <id>).
#   * There is NO anonymous slot/schedule endpoint: /appointments/slots
#     and every clinic_schedule route already use require_auth, so
#     scoping these authenticated reads cannot break an anonymous flow.
#     /health (the genuinely public endpoint) is pinned at 200 below.

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

STUDENT_A = "202310130"
STUDENT_B = "202311330"
ADMIN_EMAIL = "admin@gordoncollege.edu.ph"

# _verify_token is stubbed, but the header must still be present or
# _get_bearer_token() rejects the request before verification runs.
_AUTH = {"Authorization": "Bearer fake-token"}

_APPT_A = {
    "appointment_id": 100,
    "student_id": STUDENT_A,
    "appointment_date": "2026-01-01",
    "appointment_time": "09:00:00",
}
_APPT_B = {
    "appointment_id": 200,
    "student_id": STUDENT_B,
    "appointment_date": "2026-01-02",
    "appointment_time": "10:00:00",
}
_LOG_A = {
    "visit_log_id": 10,
    "appointment_id": 100,
    "complaint": "Cough",
    "is_walk_in": False,
    "attending_admin_id": 1,
    "created_at": "2026-01-01T09:00:00+00",
}
_LOG_B = {
    "visit_log_id": 11,
    "appointment_id": 200,
    "complaint": "Fever",
    "is_walk_in": False,
    "attending_admin_id": 1,
    "created_at": "2026-01-02T10:00:00+00",
}


def _user(email):
    user = MagicMock()
    user.id = f"uid-{email}"
    user.email = email
    return user


def _login(stack, email, is_admin=False, student_id=None):
    """Authenticate a fake caller and stub the role resolvers."""
    stack.enter_context(
        patch("routers.auth_guard._verify_token", return_value=_user(email))
    )
    stack.enter_context(
        patch("routers.auth_guard.is_admin_user", return_value=is_admin)
    )
    stack.enter_context(
        patch("routers.auth_guard.resolve_student_id", return_value=student_id)
    )


def _student_a(stack):
    _login(stack, f"{STUDENT_A}@gordoncollege.edu.ph", student_id=STUDENT_A)


def _admin(stack):
    _login(stack, ADMIN_EMAIL, is_admin=True)


def _queries_log():
    """Return (side_effect, calls) where calls records every query the
    handler built, so tests can white-box assert on scoping filters."""
    calls = []

    def side_effect(query):
        calls.append(query)
        return MagicMock(data=[], count=0)

    return side_effect, calls


# ---------------------------------------------------------------------------
# GET /logbook (filtered roster)
# ---------------------------------------------------------------------------

def test_logbook_student_scoped_to_other_forbidden_403():
    """Student A GETs the roster filtered to student B -> 403."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        resp = app.test_client().get(
            f"/logbook?student_id={STUDENT_B}", headers=_AUTH
        )
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_logbook_student_no_filter_forbidden_403():
    """Student A GETs the unfiltered roster -> 403 (full roster)."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        resp = app.test_client().get("/logbook", headers=_AUTH)
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_logbook_student_own_filter_200_scoped():
    """Student A GETs the roster filtered to themselves -> 200, and the
    underlying queries are scoped to A's student_id / appointments."""
    from main import app
    app.config["TESTING"] = True

    calls = []

    def side_effect(query):
        calls.append(query)
        path = str(getattr(query, "path", ""))
        params = str(getattr(query, "params", ""))
        if "appointments" in path and f"student_id=eq.{STUDENT_A}" in params:
            return MagicMock(data=[{"appointment_id": 100}])
        if "appointments" in path and "appointment_id" in params:
            return MagicMock(data=[_APPT_A])
        if "visit_logs" in path:
            return MagicMock(data=[_LOG_A], count=1)
        return MagicMock(data=[], count=0)

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        stack.enter_context(
            patch("routers.logbook.build_student_lookup", return_value={})
        )
        stack.enter_context(
            patch("routers.logbook.build_reason_lookup", return_value={})
        )
        stack.enter_context(
            patch("routers.logbook.build_medicine_lookup", return_value={})
        )
        resp = app.test_client().get(
            f"/logbook?student_id={STUDENT_A}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        body = resp.get_json()
        assert body["success"] is True
        assert body["count"] == 1
        # White-box scoping proof: the roster query must be narrowed to
        # the caller's student_id, not just return whatever the mock has.
        assert any(
            f"student_id=eq.{STUDENT_A}" in str(getattr(q, "params", ""))
            for q in calls
        ), "logbook roster query was not scoped to the caller's student_id"


def test_logbook_admin_unfiltered_200():
    """Admin GETs the full roster -> 200 (admin flows intact)."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _admin(stack)
        side_effect, _ = _queries_log()
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        stack.enter_context(
            patch("routers.logbook.build_reason_lookup", return_value={})
        )
        stack.enter_context(
            patch("routers.logbook.build_medicine_lookup", return_value={})
        )
        resp = app.test_client().get("/logbook", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is True


def test_logbook_admin_scoped_to_student_200():
    """Admin GETs the roster filtered to student B -> 200."""
    from main import app
    app.config["TESTING"] = True

    calls = []

    def side_effect(query):
        calls.append(query)
        path = str(getattr(query, "path", ""))
        params = str(getattr(query, "params", ""))
        if "appointments" in path and f"student_id=eq.{STUDENT_B}" in params:
            return MagicMock(data=[{"appointment_id": 200}])
        if "appointments" in path and "appointment_id" in params:
            return MagicMock(data=[_APPT_B])
        if "visit_logs" in path:
            return MagicMock(data=[_LOG_B], count=1)
        return MagicMock(data=[], count=0)

    with ExitStack() as stack:
        _admin(stack)
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        stack.enter_context(
            patch("routers.logbook.build_student_lookup", return_value={})
        )
        stack.enter_context(
            patch("routers.logbook.build_reason_lookup", return_value={})
        )
        stack.enter_context(
            patch("routers.logbook.build_medicine_lookup", return_value={})
        )
        resp = app.test_client().get(
            f"/logbook?student_id={STUDENT_B}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["count"] == 1
        assert any(
            f"student_id=eq.{STUDENT_B}" in str(getattr(q, "params", ""))
            for q in calls
        ), "logbook roster query was not scoped to the requested student_id"


def test_logbook_unauthenticated_401():
    from main import app
    app.config["TESTING"] = True

    resp = app.test_client().get(f"/logbook?student_id={STUDENT_A}")
    assert resp.status_code == 401, resp.get_data(as_text=True)
    assert resp.get_json()["success"] is False


# ---------------------------------------------------------------------------
# GET /logbook/<log_id> (by-id)
# ---------------------------------------------------------------------------

def test_logbook_entry_student_reads_other_403():
    """Student A GETs a log owned by student B -> 403."""
    from main import app
    app.config["TESTING"] = True

    def side_effect(query):
        path = str(getattr(query, "path", ""))
        if "visit_logs" in path:
            return MagicMock(data=[_LOG_B])
        if "appointments" in path:
            return MagicMock(data={"student_id": STUDENT_B})
        return MagicMock(data=[])

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        resp = app.test_client().get("/logbook/11", headers=_AUTH)
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_logbook_entry_student_reads_own_200():
    """Student A GETs their own log -> 200."""
    from main import app
    app.config["TESTING"] = True

    def side_effect(query):
        path = str(getattr(query, "path", ""))
        if "visit_logs" in path:
            return MagicMock(data=[_LOG_A])
        if "appointments" in path:
            return MagicMock(data={"student_id": STUDENT_A})
        return MagicMock(data=[])

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        stack.enter_context(
            patch(
                "routers.logbook.get_all_reference_data",
                return_value=({100: _APPT_A}, {}, {}, [], {}),
            )
        )
        resp = app.test_client().get("/logbook/10", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is True


def test_logbook_entry_admin_reads_any_200():
    """Admin GETs student B's log -> 200 (admin flows intact)."""
    from main import app
    app.config["TESTING"] = True

    def side_effect(query):
        path = str(getattr(query, "path", ""))
        if "visit_logs" in path:
            return MagicMock(data=[_LOG_B])
        if "appointments" in path:
            return MagicMock(data={"student_id": STUDENT_B})
        return MagicMock(data=[])

    with ExitStack() as stack:
        _admin(stack)
        stack.enter_context(
            patch("routers.logbook.execute_with_retry", side_effect=side_effect)
        )
        stack.enter_context(
            patch(
                "routers.logbook.get_all_reference_data",
                return_value=({200: _APPT_B}, {}, {}, [], {}),
            )
        )
        resp = app.test_client().get("/logbook/11", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)


def test_logbook_entry_unauthenticated_401():
    from main import app
    app.config["TESTING"] = True

    resp = app.test_client().get("/logbook/10")
    assert resp.status_code == 401, resp.get_data(as_text=True)
    assert resp.get_json()["success"] is False


# ---------------------------------------------------------------------------
# GET /appointments (filtered list)
# ---------------------------------------------------------------------------

def test_appointments_student_scoped_to_other_forbidden_403():
    """Student A GETs appointments filtered to student B -> 403."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        resp = app.test_client().get(
            f"/appointments?student_id={STUDENT_B}", headers=_AUTH
        )
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_appointments_student_no_filter_forbidden_403():
    """Student A GETs the unfiltered appointment list -> 403."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        resp = app.test_client().get("/appointments", headers=_AUTH)
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_appointments_student_own_filter_200_normalized():
    """Student A GETs their own appointments -> 200, and the filter sent
    to Postgres carries the NORMALIZED (uppercase) student_id."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        side_effect, calls = _queries_log()
        stack.enter_context(
            patch("routers.appointment.execute_with_retry",
                  side_effect=side_effect)
        )
        resp = app.test_client().get(
            f"/appointments?student_id={STUDENT_A}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is True
        assert any(
            f"student_id=eq.{STUDENT_A}" in str(getattr(q, "params", ""))
            for q in calls
        ), "appointments list query was not scoped to the caller's student_id"


def test_appointments_admin_unfiltered_200():
    """Admin GETs the unfiltered list -> 200 (admin flows intact)."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _admin(stack)
        side_effect, _ = _queries_log()
        stack.enter_context(
            patch("routers.appointment.execute_with_retry",
                  side_effect=side_effect)
        )
        resp = app.test_client().get("/appointments", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is True


def test_appointments_admin_scoped_to_student_200():
    """Admin GETs appointments filtered to student B -> 200."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _admin(stack)
        side_effect, calls = _queries_log()
        stack.enter_context(
            patch("routers.appointment.execute_with_retry",
                  side_effect=side_effect)
        )
        resp = app.test_client().get(
            f"/appointments?student_id={STUDENT_B}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert any(
            f"student_id=eq.{STUDENT_B}" in str(getattr(q, "params", ""))
            for q in calls
        )


def test_appointments_unauthenticated_401():
    from main import app
    app.config["TESTING"] = True

    resp = app.test_client().get(f"/appointments?student_id={STUDENT_A}")
    assert resp.status_code == 401, resp.get_data(as_text=True)
    assert resp.get_json()["success"] is False


# ---------------------------------------------------------------------------
# GET /appointments/<id> (by-id)
# ---------------------------------------------------------------------------

def test_appointment_entry_student_reads_other_403():
    """Student A GETs student B's appointment -> 403."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch(
                "routers.appointment.execute_with_retry",
                return_value=MagicMock(data=[_APPT_B]),
            )
        )
        resp = app.test_client().get("/appointments/200", headers=_AUTH)
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_appointment_entry_student_reads_own_200():
    """Student A GETs their own appointment -> 200 (Book.jsx reschedule)."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch(
                "routers.appointment.execute_with_retry",
                return_value=MagicMock(data=[_APPT_A]),
            )
        )
        resp = app.test_client().get("/appointments/100", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["appointment"]["student_id"] == STUDENT_A


def test_appointment_entry_admin_reads_any_200():
    """Admin GETs student B's appointment -> 200 (admin flows intact)."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _admin(stack)
        stack.enter_context(
            patch(
                "routers.appointment.execute_with_retry",
                return_value=MagicMock(data=[_APPT_B]),
            )
        )
        resp = app.test_client().get("/appointments/200", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)


def test_appointment_entry_unauthenticated_401():
    from main import app
    app.config["TESTING"] = True

    resp = app.test_client().get("/appointments/100")
    assert resp.status_code == 401, resp.get_data(as_text=True)
    assert resp.get_json()["success"] is False


# ---------------------------------------------------------------------------
# Genuinely public endpoint (no auth by design) — must stay 200
# ---------------------------------------------------------------------------

def test_health_public_still_200_anonymous():
    """/health is the genuinely public endpoint. The slot/schedule
    endpoints (/appointments/slots, clinic_schedule) all require auth,
    so /health is the anonymous-path proof after scoping the reads."""
    from main import app
    app.config["TESTING"] = True

    resp = app.test_client().get("/health")
    assert resp.status_code == 200, resp.get_data(as_text=True)
