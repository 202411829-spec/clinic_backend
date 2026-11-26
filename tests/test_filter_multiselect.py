"""Focused tests for repeated-key (multi-select) filter contracts.

Covers:
  * routers.query_params.get_filter_list — repeated keys, legacy CSV,
    invalid/non-positive skipping, dedupe, cap, string mode.
  * logbook page-query builder — OR within a category (IN), AND across
    categories (separate chained filters), dates stay gte/lte.
  * masterlist /students and /courses — multi-value IN filters and the
    deduped course union for repeated department_id.
  * appointment slot bookings — additive `course` field (both booking
    building blocks) plus the additive `course` key on the student
    lookup row.

Everything runs against fake request/query objects — no live Supabase.
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from main import app

AUTH_HEADERS = {"Authorization": "Bearer test-token"}


# ============================================================
# Fakes
# ============================================================

class FakeResponse:
    def __init__(self, data=None, count=None):
        self.data = list(data) if data else []
        self.count = len(self.data) if count is None else count
        self.error = None


class FakeQuery:
    """Records PostgREST-style calls as tuples so tests can assert
    exactly which filters a route pushed down."""

    def __init__(self, table=None):
        self.table = table
        self.calls = []

    def select(self, *fields, **kwargs):
        self.calls.append(("select", fields, kwargs))
        return self

    def eq(self, column, value):
        self.calls.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.calls.append(("in", column, list(values)))
        return self

    def filter(self, column, operator, criteria):
        self.calls.append(("filter", column, (operator, criteria)))
        return self

    def or_(self, criteria):
        self.calls.append(("or", criteria, None))
        return self

    def order(self, column, desc=False):
        self.calls.append(("order", column, desc))
        return self

    def range(self, start, end):
        self.calls.append(("range", (start, end), None))
        return self

    def limit(self, n):
        self.calls.append(("limit", n, None))
        return self


class FakeSupabase:
    """Fake supabase client: .table(name) returns a recording FakeQuery."""

    def __init__(self):
        self.queries = []

    def table(self, name):
        query = FakeQuery(name)
        self.queries.append(query)
        return query

    def last_query(self, table=None):
        for query in reversed(self.queries):
            if table is None or query.table == table:
                return query
        raise AssertionError(f"No query recorded for table {table!r}")


def make_execute(rows_by_table):
    """execute_with_retry fake dispatching on query.table."""
    def _execute(query):
        rows = rows_by_table.get(query.table, [])
        return FakeResponse([dict(row) for row in rows])
    return _execute


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


# ============================================================
# 1. routers.query_params.get_filter_list
# ============================================================

def parse(key, query_string, **kwargs):
    from routers.query_params import get_filter_list

    with app.test_request_context(f"/parse-test?{query_string}"):
        return get_filter_list(key, **kwargs)


def test_repeated_keys_become_a_list():
    assert parse("reason_id", "reason_id=1&reason_id=2") == [1, 2]
    assert parse("department_id", "department_id=7&department_id=3&department_id=9") == [7, 3, 9]


def test_legacy_csv_and_mixed_shapes():
    assert parse("reason_id", "reason_id=1,2,3") == [1, 2, 3]
    # repeated key whose values are themselves CSV
    assert parse("reason_id", "reason_id=1,2&reason_id=3") == [1, 2, 3]


def test_invalid_and_non_positive_values_are_skipped():
    assert parse("reason_id", "reason_id=abc&reason_id=1") == [1]
    assert parse("reason_id", "reason_id=0&reason_id=-5") == []
    assert parse("reason_id", "reason_id=1.5&reason_id=2x&reason_id=2") == [2]
    # all invalid -> empty (means "All")
    assert parse("reason_id", "reason_id=abc") == []


def test_dedupe_preserves_first_seen_order():
    assert parse("reason_id", "reason_id=2&reason_id=1&reason_id=2") == [2, 1]
    assert parse("reason_id", "reason_id=5,5,6") == [5, 6]


def test_max_items_cap():
    qs = "&".join(f"reason_id={n}" for n in range(1, 6))
    assert parse("reason_id", qs, max_items=3) == [1, 2, 3]
    # default cap is 100
    qs_default = "&".join(f"reason_id={n}" for n in range(1, 106))
    assert len(parse("reason_id", qs_default)) == 100


def test_missing_key_returns_empty_list():
    assert parse("reason_id", "page=1") == []


def test_string_mode_trims_dedupes_and_bounds_length():
    assert parse("year_level", "year_level=1&year_level= 2 ", as_int=False) == ["1", "2"]
    assert parse("year_level", "year_level=1&year_level=1", as_int=False) == ["1"]
    # whitespace-only pieces dropped
    assert parse("year_level", "year_level=&year_level=%20%20", as_int=False) == []
    # overlong string skipped (bounded length)
    long_value = "y" * 65
    assert parse("year_level", f"year_level={long_value}&year_level=2", as_int=False) == ["2"]
    assert parse("year_level", "year_level=" + "y" * 64, as_int=False) == ["y" * 64]


# ============================================================
# 2. Logbook query builder — OR within category, AND across
# ============================================================

def test_logbook_multi_ids_become_in_filters():
    from routers.logbook import _logbook_page_query_params

    select_str, filters = _logbook_page_query_params(
        None, None, [1, 2], [3, 4], [5]
    )
    assert select_str.startswith("*,appointments!inner(")
    assert ("appointments.reason_id", "in", [1, 2]) in filters
    assert ("appointments.students.department_id", "in", [3, 4]) in filters
    assert ("appointments.students.course_id", "in", [5]) in filters


def test_logbook_dates_remain_gte_lte_and_categories_chain():
    from routers.logbook import _logbook_page_query_params

    _, filters = _logbook_page_query_params(
        "2026-01-01", "2026-01-31", [1, 2], [3], [4, 5]
    )
    # dates unchanged: gte/lte on the relationship column
    assert ("appointments.appointment_date", "gte", "2026-01-01") in filters
    assert ("appointments.appointment_date", "lte", "2026-01-31") in filters
    # AND across categories: one separate filter entry per category
    columns = [column for column, _, _ in filters]
    assert columns == [
        "appointments.appointment_date",
        "appointments.appointment_date",
        "appointments.reason_id",
        "appointments.students.department_id",
        "appointments.students.course_id",
    ]
    operators = [operator for _, operator, _ in filters]
    assert operators == ["gte", "lte", "in", "in", "in"]


def test_logbook_empty_lists_mean_no_scope():
    from routers.logbook import _logbook_page_query_params

    select_str, filters = _logbook_page_query_params(None, None, [], [], [])
    assert filters == []
    assert select_str.startswith("*,")
    assert "appointments!inner" not in select_str


def test_apply_logbook_filters_dispatches_in_vs_filter():
    from routers.logbook import _apply_logbook_filters

    query = FakeQuery("visit_logs")
    result = _apply_logbook_filters(query, [
        ("appointments.appointment_date", "gte", "2026-01-01"),
        ("appointments.reason_id", "in", [1, 2]),
    ])
    assert result is query
    assert ("filter", "appointments.appointment_date", ("gte", "2026-01-01")) in query.calls
    # IN values go through query.in_() (URL-encoded by postgrest), never
    # a hand-built SQL string.
    assert ("in", "appointments.reason_id", [1, 2]) in query.calls


def test_logbook_endpoint_parses_repeated_keys_into_in_filters(client):
    fake_supabase = FakeSupabase()
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.logbook.supabase", fake_supabase), \
         patch("routers.logbook.execute_with_retry",
               return_value=FakeResponse([])), \
         patch("routers.logbook.build_reason_lookup", return_value={}), \
         patch("routers.logbook.build_medicine_lookup", return_value={}):
        resp = client.get(
            "/logbook?date_from=2026-01-01&date_to=2026-01-31"
            "&reason_id=1&reason_id=2&department_id=3"
            "&course_id=4&course_id=5",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert payload["logbook"] == []

    query = fake_supabase.last_query("visit_logs")
    assert ("filter", "appointments.appointment_date", ("gte", "2026-01-01")) in query.calls
    assert ("filter", "appointments.appointment_date", ("lte", "2026-01-31")) in query.calls
    assert ("in", "appointments.reason_id", [1, 2]) in query.calls
    assert ("in", "appointments.students.department_id", [3]) in query.calls
    assert ("in", "appointments.students.course_id", [4, 5]) in query.calls


# ============================================================
# 3. Masterlist — multi-value IN filters + /courses union
# ============================================================

def test_masterlist_students_multi_ids_use_in_filters(client):
    fake_supabase = FakeSupabase()
    rows = [{"student_id": "2023-0001", "full_name": "Ana Cruz"}]
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.masterlist.supabase", fake_supabase), \
         patch("routers.masterlist.execute_with_retry",
               return_value=FakeResponse(rows)):
        resp = client.get(
            "/api/masterlist/students"
            "?department_id=1&department_id=2&course_id=9"
            "&year_level=1&year_level=2",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert payload["data"] == rows
    assert payload["total"] == len(rows)

    query = fake_supabase.last_query("student_masterlist")
    assert ("in", "department_id", [1, 2]) in query.calls
    assert ("in", "course_id", [9]) in query.calls
    assert ("in", "year_level", ["1", "2"]) in query.calls
    # categories chain as separate filters -> AND across categories
    in_calls = [call for call in query.calls if call[0] == "in"]
    assert len(in_calls) == 3


def test_masterlist_students_scalar_filter_still_applies(client):
    fake_supabase = FakeSupabase()
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.masterlist.supabase", fake_supabase), \
         patch("routers.masterlist.execute_with_retry",
               return_value=FakeResponse([])):
        resp = client.get(
            "/api/masterlist/students?department_id=5",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    query = fake_supabase.last_query("student_masterlist")
    assert ("in", "department_id", [5]) in query.calls


def test_masterlist_courses_repeated_departments_use_in_and_dedupe(client):
    fake_supabase = FakeSupabase()
    rows = [
        {"course_id": 10, "course_name": "BSIT", "department_id": 1},
        {"course_id": 10, "course_name": "BSIT", "department_id": 1},
        {"course_id": 20, "course_name": "BSCS", "department_id": 2},
    ]
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.masterlist.supabase", fake_supabase), \
         patch("routers.masterlist.execute_with_retry",
               return_value=FakeResponse(rows)):
        resp = client.get(
            "/api/masterlist/courses?department_id=1&department_id=2",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    payload = resp.get_json()
    # deduped union: one row per course id, first-appearance order kept
    assert payload["data"] == [rows[0], rows[2]]

    query = fake_supabase.last_query("courses")
    assert ("in", "department_id", [1, 2]) in query.calls


def test_masterlist_courses_scalar_department_identical(client):
    fake_supabase = FakeSupabase()
    rows = [{"course_id": 10, "course_name": "BSIT", "department_id": 7}]
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.masterlist.supabase", fake_supabase), \
         patch("routers.masterlist.execute_with_retry",
               return_value=FakeResponse(rows)):
        resp = client.get(
            "/api/masterlist/courses?department_id=7",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    assert resp.get_json()["data"] == rows
    query = fake_supabase.last_query("courses")
    assert ("in", "department_id", [7]) in query.calls


# ============================================================
# 4. Appointment bookings — additive `course` field
# ============================================================

def test_merge_student_row_adds_course_key():
    from routers.helpers import _merge_student_row

    students = {}
    _merge_student_row(students, {
        "student_id": "s1",
        "full_name": "Ana Cruz",
        "gender": "F",
        "department_name": "SHS",
        "course_name": "STEM",
        "year_level": "1",
        "birth_date": None,
    })
    row = students["S1"]
    assert row["course"] == "STEM"
    # existing fields untouched
    assert row["dept"] == "SHS"
    assert row["deptCourse"] == "STEM - SHS"

    # fallback when the student has no course_name
    students2 = {}
    _merge_student_row(students2, {
        "student_id": "s2",
        "full_name": "Juan Dela Cruz",
        "department_name": "IT",
    })
    assert students2["S2"]["course"] == "-"


def test_virtual_slot_bookings_include_course(client):
    """Date path (default/virtual slots) — first booking-building block."""
    appointment_row = {
        "appointment_id": 101,
        "student_id": "S1",
        "reason_id": 1,
        "appointment_date": "2099-01-05",
        "appointment_time": "08:00:00",
        "time_slot_id": None,
        "booked_at": None,
    }

    def _execute(query):
        if query.table == "appointments":
            return FakeResponse([dict(appointment_row)])
        return FakeResponse([])

    fake_supabase = FakeSupabase()
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.appointment.supabase", fake_supabase), \
         patch("routers.appointment._caller_is_admin", return_value=True), \
         patch("routers.appointment.get_schedule_for_date", return_value=None), \
         patch("routers.appointment.get_default_settings", return_value={
             "work_start": "08:00",
             "work_end": "09:00",
             "break_start": None,
             "break_end": None,
             "slot_interval_minutes": 60,
             "max_students_per_slot": 2,
         }), \
         patch("routers.appointment.execute_with_retry",
               side_effect=_execute), \
         patch("routers.appointment.build_reason_lookup",
               return_value={1: {"description": "Checkup"}}), \
         patch("routers.appointment.build_student_lookup",
               return_value={"S1": {
                   "student_id": "S1",
                   "name": "Ana Cruz",
                   "age": 18,
                   "sex": "F",
                   "dept": "SHS",
                   "course": "STEM",
                   "deptCourse": "STEM - SHS",
                   "year_level": "1",
               }}), \
         patch("routers.appointment.get_latest_status_for_appointments",
               return_value={101: {"new_status": "pending"}}):
        resp = client.get(
            "/appointments/slots?date=2099-01-05",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    payload = resp.get_json()
    bookings = [b for slot in payload["slots"] for b in slot["bookings"]]
    assert len(bookings) == 1
    booking = bookings[0]
    assert booking["course"] == "STEM"
    # unchanged payload fields
    assert booking["dept"] == "SHS"
    assert booking["reason"] == "Checkup"
    assert booking["status"] == "Pending"


def test_schedule_slot_bookings_include_course(client):
    """schedule_id path — second booking-building block."""
    slot_row = {
        "slot_id": 10,
        "schedule_id": 1,
        "slot_start": "08:00",
        "slot_end": "09:00",
        "max_capacity": 5,
    }
    appointment_row = {
        "appointment_id": 202,
        "student_id": "S1",
        "reason_id": 1,
        "appointment_date": "2099-01-06",
        "appointment_time": "08:00:00",
        "time_slot_id": 10,
        "booked_at": None,
    }

    def _execute(query):
        if query.table == "time_slots":
            return FakeResponse([dict(slot_row)])
        if query.table == "appointments":
            return FakeResponse([dict(appointment_row)])
        return FakeResponse([])

    fake_supabase = FakeSupabase()
    with patch("routers.auth_guard._verify_token",
               return_value=SimpleNamespace(id="u1", email="a@b.c")), \
         patch("routers.appointment.supabase", fake_supabase), \
         patch("routers.appointment.execute_with_retry",
               side_effect=_execute), \
         patch("routers.appointment.build_reason_lookup",
               return_value={1: {"description": "Checkup"}}), \
         patch("routers.appointment.build_student_lookup",
               return_value={"S1": {
                   "student_id": "S1",
                   "name": "Ana Cruz",
                   "age": 18,
                   "sex": "F",
                   "dept": "IT",
                   "course": "BSIT",
                   "deptCourse": "BSIT - IT",
                   "year_level": "3",
               }}), \
         patch("routers.appointment.get_latest_status_for_appointments",
               return_value={202: {"new_status": "pending"}}):
        resp = client.get(
            "/appointments/slots?schedule_id=1",
            headers=AUTH_HEADERS,
        )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["slots"], "expected at least one slot"
    bookings = payload["slots"][0]["bookings"]
    assert len(bookings) == 1
    booking = bookings[0]
    assert booking["course"] == "BSIT"
    # unchanged payload fields
    assert booking["dept"] == "IT"
    assert booking["reason"] == "Checkup"
    assert booking["status"] == "Pending"
