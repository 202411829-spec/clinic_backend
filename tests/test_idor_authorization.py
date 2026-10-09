# tests/test_idor_authorization.py
#
# IDOR / authorization coverage for student-scoped GET endpoints.
#
# `require_auth` proves identity, not authorization. These tests pin
# the required rule for every endpoint that returns data scoped to a
# student_id:
#   1. admin            -> allowed (admins legitimately see all students)
#   2. self (path sid == resolve_student_id(caller)) -> allowed
#   3. otherwise        -> 403 (not 401: caller IS authenticated;
#                          not 404: would leak existence)
#   4. no token         -> 401 (regression guard)
#
# Roster endpoints (/students, /api/masterlist/students) have no
# student-side consumer (only src/pages/admin/Masterlist.jsx:104 calls
# masterlistApi.listStudents), so they are admin-only -> student gets
# 403, admin gets 200.

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

STUDENT_A = "202310130"
STUDENT_B = "202311330"
ADMIN_EMAIL = "admin@gordoncollege.edu.ph"

# _verify_token is stubbed, but the header must still be present or
# _get_bearer_token() rejects the request before verification runs.
_AUTH = {"Authorization": "Bearer fake-token"}


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


# ---------------------------------------------------------------------------
# Triple for each of the three probed detail routes:
# GET /api/records/<sid>, GET /logbook/student/<sid>,
# GET /api/masterlist/students/<sid>
# ---------------------------------------------------------------------------

DETAIL_ROUTES = [
    # (path template, module whose execute_with_retry to stub, mock data)
    ("/api/records/{}", "routers.student_record.execute_with_retry",
     [{"year_label": "Year I", "student_id": STUDENT_A}]),
    ("/logbook/student/{}", "routers.logbook.execute_with_retry", []),
    ("/api/masterlist/students/{}", "routers.masterlist.execute_with_retry",
     {"student_id": STUDENT_A}),
]


def test_detail_student_reads_other_student_403():
    """Student A GETs student B's record -> 403 on every detail route."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, _, _ in DETAIL_ROUTES:
        with ExitStack() as stack:
            _student_a(stack)
            resp = app.test_client().get(path_tpl.format(STUDENT_B), headers=_AUTH)
            assert resp.status_code == 403, (
                f"{path_tpl}: {resp.status_code} {resp.get_data(as_text=True)}"
            )
            body = resp.get_json()
            assert body["success"] is False
            assert "error" in body


def test_detail_student_reads_own_record_200():
    """Student A GETs their own record -> 200 on every detail route."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, exec_patch, mock_data in DETAIL_ROUTES:
        with ExitStack() as stack:
            _student_a(stack)
            stack.enter_context(patch(exec_patch, return_value=MagicMock(data=mock_data)))
            resp = app.test_client().get(path_tpl.format(STUDENT_A), headers=_AUTH)
            # Contract here is the status: some of these routes wrap the
            # body in {success:...}, others return the record directly.
            assert resp.status_code == 200, (
                f"{path_tpl}: {resp.status_code} {resp.get_data(as_text=True)}"
            )


def test_detail_admin_reads_any_record_200():
    """Admin GETs student B's record -> 200 on every detail route."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, exec_patch, mock_data in DETAIL_ROUTES:
        with ExitStack() as stack:
            _admin(stack)
            stack.enter_context(patch(exec_patch, return_value=MagicMock(data=mock_data)))
            resp = app.test_client().get(path_tpl.format(STUDENT_B), headers=_AUTH)
            assert resp.status_code == 200, (
                f"{path_tpl}: {resp.status_code} {resp.get_data(as_text=True)}"
            )


def test_detail_unauthenticated_401():
    """No Authorization header -> 401 on every detail route (regression)."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, _, _ in DETAIL_ROUTES:
        resp = app.test_client().get(path_tpl.format(STUDENT_B))
        assert resp.status_code == 401, f"{path_tpl}: {resp.status_code}"
        assert resp.get_json()["success"] is False


# ---------------------------------------------------------------------------
# Roster rule: admin-only (no student-side consumer found)
# ---------------------------------------------------------------------------

ROSTER_ROUTES = [
    ("/students?page=1&page_size=5", "routers.student.execute_with_retry"),
    ("/api/masterlist/students?page=1&page_size=5",
     "routers.masterlist.execute_with_retry"),
]


def test_roster_student_forbidden_403():
    """Student hitting either roster listing -> 403 (admin-only)."""
    from main import app
    app.config["TESTING"] = True

    for path, _ in ROSTER_ROUTES:
        with ExitStack() as stack:
            _student_a(stack)
            resp = app.test_client().get(path, headers=_AUTH)
            assert resp.status_code == 403, (
                f"{path}: {resp.status_code} {resp.get_data(as_text=True)}"
            )
            assert resp.get_json()["success"] is False


def test_roster_admin_200():
    """Admin hitting either roster listing -> 200 with the full roster."""
    from main import app
    app.config["TESTING"] = True

    for path, exec_patch in ROSTER_ROUTES:
        with ExitStack() as stack:
            _admin(stack)
            stack.enter_context(
                patch(exec_patch, return_value=MagicMock(data=[], count=6))
            )
            resp = app.test_client().get(path, headers=_AUTH)
            assert resp.status_code == 200, (
                f"{path}: {resp.status_code} {resp.get_data(as_text=True)}"
            )
            assert resp.get_json()["total"] == 6


def test_roster_unauthenticated_401():
    """No token -> 401 on the roster listings (regression)."""
    from main import app
    app.config["TESTING"] = True

    for path, _ in ROSTER_ROUTES:
        resp = app.test_client().get(path)
        assert resp.status_code == 401, f"{path}: {resp.status_code}"


# ---------------------------------------------------------------------------
# Same-pattern path-scoped routes guarded by the shared helper:
# /students/<sid>, /api/records/<sid>/medical-summary,
# /feedback/<sid>, /notifications/<sid>
# ---------------------------------------------------------------------------

EXTRA_ROUTES = [
    # (path template, module execute_with_retry to stub for 200s, mock data)
    ("/students/{}", "routers.student.execute_with_retry",
     {"student_id": STUDENT_A}),
    ("/api/records/{}/medical-summary", "routers.student_record.execute_with_retry",
     [{"year_label": "Year I", "student_id": STUDENT_A}]),
    ("/feedback/{}", "routers.feedback.execute_with_retry", []),
    ("/notifications/{}", "routers.notifications.execute_with_retry", []),
]


def test_extra_routes_student_reads_other_403():
    """Student A on student B's path-scoped routes -> 403."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, _, _ in EXTRA_ROUTES:
        with ExitStack() as stack:
            _student_a(stack)
            resp = app.test_client().get(path_tpl.format(STUDENT_B), headers=_AUTH)
            assert resp.status_code == 403, (
                f"{path_tpl}: {resp.status_code} {resp.get_data(as_text=True)}"
            )
            assert resp.get_json()["success"] is False


def test_extra_routes_admin_200():
    """Admin on the same routes -> 200 (admin flows intact)."""
    from main import app
    app.config["TESTING"] = True

    for path_tpl, exec_patch, mock_data in EXTRA_ROUTES:
        with ExitStack() as stack:
            _admin(stack)
            stack.enter_context(patch(exec_patch, return_value=MagicMock(data=mock_data)))
            resp = app.test_client().get(path_tpl.format(STUDENT_B), headers=_AUTH)
            assert resp.status_code == 200, (
                f"{path_tpl}: {resp.status_code} {resp.get_data(as_text=True)}"
            )


# ---------------------------------------------------------------------------
# Exam-keyed medical records: annual_exam_id resolves to a student, so
# ownership must be checked against the exam row's student_id.
# ---------------------------------------------------------------------------

def test_medical_certificate_student_reads_other_403():
    """Student A GETs student B's medical certificate -> 403."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _student_a(stack)
        stack.enter_context(
            patch(
                "routers.student_record.execute_with_retry",
                return_value=MagicMock(
                    data={"annual_exam_id": 1, "student_id": STUDENT_B}
                ),
            )
        )
        resp = app.test_client().get("/api/records/annual-exams/1/medical-certificate", headers=_AUTH)
        assert resp.status_code == 403, resp.get_data(as_text=True)
        assert resp.get_json()["success"] is False


def test_medical_certificate_admin_200():
    """Admin GETs the medical certificate -> 200."""
    from main import app
    app.config["TESTING"] = True

    exam_row = {"annual_exam_id": 1, "student_id": STUDENT_B}
    with ExitStack() as stack:
        _admin(stack)
        stack.enter_context(
            patch(
                "routers.student_record.execute_with_retry",
                return_value=MagicMock(data=exam_row),
            )
        )
        resp = app.test_client().get("/api/records/annual-exams/1/medical-certificate", headers=_AUTH)
        assert resp.status_code == 200, resp.get_data(as_text=True)
