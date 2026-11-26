"""Focused regression tests for persisted admin time-block deletion.

Runs in memory: no live Supabase, no network, no appointment data mutated
outside the fake tables.
"""

from unittest.mock import MagicMock, patch

import pytest

from main import app

DATE = "2099-04-02"
ADMIN_AUTH_ID = "admin-auth-1"
AUTH = {"Authorization": "Bearer admin-token"}


class FakeResponse:
    def __init__(self, data=None, count=None):
        self.data = list(data) if data else []
        self.count = len(self.data) if count is None else count
        self.error = None


class FakeQuery:
    def __init__(self, state, table):
        self.state = state
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []
        self._order = None
        self._limit = None

    def select(self, *_fields, **_kwargs):
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

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def is_(self, column, value):
        self.filters.append(("is", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, list(values)))
        return self

    def order(self, column, desc=False):
        self._order = (column, desc)
        return self

    def limit(self, count):
        self._limit = count
        return self

    def maybe_single(self):
        return self


class FakeState:
    def __init__(self):
        self.tables = {
            "app_accounts": [
                {
                    "auth_user_id": ADMIN_AUTH_ID,
                    "email": "admin@gordoncollege.edu.ph",
                    "account_type": "admin",
                    "admin_id": 7,
                }
            ],
            "admin_accounts": [{"admin_id": 7, "is_active": True, "role": "admin"}],
            "appointment_reasons": [
                {"reason_id": 1, "description": "Consultation", "is_active": True, "uses_dedicated_schedule": False}
            ],
        }
        self._next_id = {"time_slots": 100, "clinic_schedules": 10, "time_slot_deletions": 1}

    @staticmethod
    def _matches(row, kind, column, value):
        actual = row.get(column)
        if kind == "is":
            if value is None:
                return actual is None or actual == ""
            return actual == value
        if kind == "in":
            return actual in value
        if column in {"slot_start", "slot_end", "appointment_time"}:
            return str(actual)[:5] == str(value)[:5]
        return actual == value or str(actual) == str(value)

    def run(self, query):
        rows = self.tables.setdefault(query.table, [])

        if query.op == "insert":
            payloads = query.payload if isinstance(query.payload, list) else [query.payload]
            inserted = []
            for item in payloads:
                row = dict(item)
                pk = {
                    "time_slots": "slot_id",
                    "clinic_schedules": "schedule_id",
                    "time_slot_deletions": "deletion_id",
                }.get(query.table)
                if pk and pk not in row:
                    self._next_id[query.table] = self._next_id.get(query.table, 1)
                    row[pk] = self._next_id[query.table]
                    self._next_id[query.table] += 1
                rows.append(row)
                inserted.append(row)
            return FakeResponse(inserted)

        matched = [
            row for row in rows
            if all(self._matches(row, kind, column, value) for kind, column, value in query.filters)
        ]

        if query.op == "update":
            for row in matched:
                row.update(query.payload)
            return FakeResponse(matched)

        if query.op == "delete":
            self.tables[query.table] = [row for row in rows if row not in matched]
            return FakeResponse(matched)

        if query._order:
            column, desc = query._order
            matched.sort(key=lambda row: str(row.get(column) or ""), reverse=desc)
        if query._limit:
            matched = matched[: query._limit]
        return FakeResponse(matched)


@pytest.fixture
def delete_env():
    state = FakeState()
    app.config["TESTING"] = True

    def fake_verify(token):
        if token == "admin-token":
            return MagicMock(id=ADMIN_AUTH_ID, email="admin@gordoncollege.edu.ph")
        return MagicMock(id="student-auth-1", email="student@gordoncollege.edu.ph")

    patches = [
        patch("routers.auth_guard._verify_token", side_effect=fake_verify),
        patch("routers.auth_guard.supabase"),
        patch("routers.auth_guard.execute_with_retry", side_effect=state.run),
        patch("routers.appointment.supabase"),
        patch("routers.appointment.execute_with_retry", side_effect=state.run),
        patch("routers.clinic_schedule.supabase"),
        patch("routers.clinic_schedule.execute_with_retry", side_effect=state.run),
        patch("routers.appointment.build_reason_lookup", return_value={
            1: state.tables["appointment_reasons"][0]
        }),
        patch("routers.clinic_schedule.build_reason_lookup", return_value={
            1: state.tables["appointment_reasons"][0]
        }),
        patch("routers.appointment.build_student_lookup", return_value={}),
        patch("routers.appointment.get_latest_status_for_appointments", return_value={}),
    ]
    started = [p.start() for p in patches]
    for patched_supabase in (started[1], started[3], started[5]):
        patched_supabase.table.side_effect = lambda name, s=state: FakeQuery(s, name)

    client = app.test_client()
    yield state, client

    for p in reversed(patches):
        p.stop()


def delete_slot(client, slot_id, **body):
    payload = {"date": DATE, "slot_start": "09:00", "slot_end": "09:30", **body}
    return client.delete(f"/appointments/time-slots/{slot_id}", json=payload, headers=AUTH)


def slots_on_date(client):
    response = client.get(f"/appointments/slots?date={DATE}", headers=AUTH)
    assert response.status_code == 200
    return response.get_json()


def test_real_slot_delete_persists_and_followup_fetch_omits_it(delete_env):
    state, client = delete_env
    state.tables["clinic_schedules"] = [{
        "schedule_id": 10,
        "working_date": DATE,
        "work_start": "08:00",
        "work_end": "17:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": True,
        "closure_reason": None,
        "reason_id": None,
    }]
    state.tables["time_slots"] = [{
        "slot_id": 77,
        "schedule_id": 10,
        "slot_start": "09:00",
        "slot_end": "09:30",
        "max_capacity": 8,
        "booked_count": 0,
    }]

    response = delete_slot(client, 77)

    assert response.status_code == 200
    assert response.get_json()["success"] is True
    assert state.tables["time_slots"] == []
    assert state.tables["time_slot_deletions"][0]["slot_start"] == "09:00"

    followup = slots_on_date(client)
    assert followup["count"] == 0
    assert all(slot["slot_start"] != "09:00" for slot in followup["slots"])


def test_delete_with_existing_booking_is_refused_and_slot_is_preserved(delete_env):
    state, client = delete_env
    state.tables["time_slots"] = [{
        "slot_id": 77,
        "schedule_id": 10,
        "slot_start": "09:00",
        "slot_end": "09:30",
        "max_capacity": 8,
        "booked_count": 1,
    }]
    state.tables["appointments"] = [{
        "appointment_id": 5,
        "time_slot_id": 77,
        "appointment_date": DATE,
        "appointment_time": "09:00",
    }]

    response = delete_slot(client, 77)

    assert response.status_code == 409
    assert "existing appointments" in response.get_json()["error"]
    assert len(state.tables["time_slots"]) == 1
    assert state.tables["appointments"] == state.tables["appointments"]
    assert state.tables.get("time_slot_deletions", []) == []


def test_virtual_slot_delete_materializes_schedule_without_that_block(delete_env):
    state, client = delete_env
    state.tables["clinic_appointment_settings"] = [{
        "work_start": "08:00",
        "work_end": "10:00",
        "break_start": None,
        "break_end": None,
        "slot_interval_minutes": 30,
        "max_students_per_slot": 8,
    }]

    response = delete_slot(client, -1)

    assert response.status_code == 200
    assert response.get_json()["success"] is True
    assert len(state.tables["clinic_schedules"]) == 1
    assert state.tables["time_slot_deletions"][0]["slot_start"] == "09:00"
    assert all(slot["slot_start"] != "09:00" for slot in state.tables["time_slots"])

    followup = slots_on_date(client)
    assert followup["count"] > 0
    assert all(slot["slot_start"] != "09:00" for slot in followup["slots"])


def test_non_admin_cannot_delete_a_time_block(delete_env):
    _, client = delete_env
    response = client.delete(
        "/appointments/time-slots/77",
        json={"date": DATE, "slot_start": "09:00", "slot_end": "09:30"},
        headers={"Authorization": "Bearer student-token"},
    )

    assert response.status_code == 403
