import pytest
from unittest.mock import MagicMock, patch

from main import app

STUDENT_ID = "202311330"
OLD_APPOINTMENT_ID = 10
NEW_APPOINTMENT_ID = 11
DATE = "2026-11-24"
TIME = "10:00"


class FakeResponse:
    def __init__(self, data=None):
        self.data = data or []
        self.count = len(self.data)


class FakeQuery:
    def __init__(self, table):
        self.table = table
        self.operation = None
        self.payload = None
        self.filters = []

    def select(self, *fields):
        self.operation = "select"
        self.fields = fields
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return FakeResponse()


@pytest.fixture
def reschedule_env():
    status_calls = []
    inserted = []
    slot_rows = [
        {"appointment_id": OLD_APPOINTMENT_ID, "student_id": STUDENT_ID},
        {"appointment_id": 20, "student_id": "202311331"},
    ]
    pending_rows = [
        {"appointment_id": OLD_APPOINTMENT_ID, "student_id": STUDENT_ID}
    ]
    statuses = {
        OLD_APPOINTMENT_ID: {"new_status": "pending"},
        20: {"new_status": "pending"},
    }

    def fake_execute(query):
        filters = dict(query.filters)
        if query.table == "appointments" and query.operation == "select":
            if "time_slot_id" in filters:
                return FakeResponse(slot_rows)
            if "student_id" in filters:
                return FakeResponse(pending_rows)
            if "appointment_id" in filters:
                return FakeResponse(
                    [row for row in slot_rows + pending_rows
                     if row.get("appointment_id") == filters["appointment_id"]]
                )
        if query.table == "appointments" and query.operation == "insert":
            inserted.append(dict(query.payload))
            return FakeResponse([{
                "appointment_id": NEW_APPOINTMENT_ID,
                **query.payload,
                "current_status": None,
            }])
        return FakeResponse()

    def fake_write_status(appointment_id, previous_status, new_status, remarks, changed_by):
        status_calls.append({
            "appointment_id": appointment_id,
            "previous_status": previous_status,
            "new_status": new_status,
            "remarks": remarks,
            "changed_by": changed_by,
        })
        return FakeResponse([{"appointment_id": appointment_id, "new_status": new_status}])

    patches = [
        patch("routers.auth_guard._verify_token", return_value=MagicMock(id="auth-1", email=f"{STUDENT_ID}@gordoncollege.edu.ph")),
        patch("routers.appointment.supabase"),
        patch("routers.appointment.execute_with_retry", side_effect=fake_execute),
        patch("routers.appointment.resolve_student_id", return_value=STUDENT_ID),
        patch("routers.appointment._caller_is_admin", return_value=False),
        patch("routers.appointment._is_bookable_date", return_value=True),
        patch("routers.appointment.is_slot_closed_for_date", return_value=False),
        patch("routers.appointment.resolve_slot_for_booking", return_value={"slot_id": 5}),
        patch("routers.appointment.get_max_students_per_slot", return_value=2),
        patch("routers.appointment.get_latest_status_for_appointments", side_effect=lambda ids: {i: statuses[i] for i in ids if i in statuses}),
        patch("routers.appointment.build_reason_lookup", return_value={7: {"description": "Consultation"}}),
        patch("routers.appointment.resolve_changed_by_admin_id", return_value="admin-1"),
        patch("routers.appointment._write_status", side_effect=fake_write_status),
    ]

    started = [p.start() for p in patches]
    started[1].table.side_effect = lambda name: FakeQuery(name)

    app.config["TESTING"] = True
    client = app.test_client()

    yield client, status_calls, inserted, slot_rows, pending_rows, statuses

    for p in reversed(patches):
        p.stop()


def post_appointment(client, payload):
    return client.post(
        "/appointments",
        json=payload,
        headers={"Authorization": "Bearer fake"},
    )


def valid_payload(**overrides):
    payload = {
        "student_id": STUDENT_ID,
        "appointment_date": DATE,
        "appointment_time": TIME,
        "slot_id": 5,
        "reason_id": 7,
        "purpose": "Consultation",
    }
    payload.update(overrides)
    return payload


def test_reschedule_cancels_original_and_creates_replacement(reschedule_env):
    client, status_calls, inserted, _, _, _ = reschedule_env

    response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID))

    assert response.status_code == 201
    body = response.get_json()
    assert body["success"] is True
    assert body["appointment"]["appointment_id"] == NEW_APPOINTMENT_ID
    assert inserted == [{
        "student_id": STUDENT_ID,
        "time_slot_id": 5,
        "appointment_date": DATE,
        "appointment_time": TIME,
        "reason_id": 7,
        "appointment_purpose": "Consultation",
    }]
    assert any(
        call["appointment_id"] == NEW_APPOINTMENT_ID
        and call["new_status"] == "pending"
        for call in status_calls
    )
    assert any(
        call["appointment_id"] == OLD_APPOINTMENT_ID
        and call["previous_status"] == "pending"
        and call["new_status"] == "cancelled"
        for call in status_calls
    )


def test_verified_token_student_id_wins_over_mismatched_request_body(reschedule_env):
    client, _, inserted, _, _, _ = reschedule_env

    response = post_appointment(
        client,
        valid_payload(rescheduled_id=OLD_APPOINTMENT_ID, student_id="OTHER-STUDENT"),
    )

    assert response.status_code == 201
    assert inserted[0]["student_id"] == STUDENT_ID


def test_reschedule_rejects_reason_not_in_reference_table(reschedule_env):
    client, status_calls, inserted, _, _, _ = reschedule_env

    response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID, reason_id=999))

    assert response.status_code == 400
    assert inserted == []
    assert status_calls == []


def test_reschedule_rejects_appointment_owned_by_another_student(reschedule_env):
    client, status_calls, inserted, slot_rows, pending_rows, _ = reschedule_env
    slot_rows[0]["student_id"] = "202311331"
    pending_rows[0]["student_id"] = "202311331"

    response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID))

    assert response.status_code in (403, 404)
    assert inserted == []
    assert status_calls == []


def test_reschedule_rejects_original_that_is_no_longer_pending(reschedule_env):
    client, status_calls, inserted, _, _, statuses = reschedule_env
    statuses[OLD_APPOINTMENT_ID] = {"new_status": "cancelled"}

    response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID))

    assert response.status_code in (400, 409)
    assert inserted == []
    assert status_calls == []


def test_reschedule_to_fully_booked_slot_preserves_original(reschedule_env):
    client, status_calls, inserted, _, _, _ = reschedule_env
    with patch("routers.appointment.get_max_students_per_slot", return_value=1):
        response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID))

    assert response.status_code == 409
    assert "fully booked" in response.get_json()["error"].lower()
    assert inserted == []
    assert status_calls == []


def test_regular_booking_still_blocks_student_with_pending_appointment(reschedule_env):
    client, status_calls, inserted, _, _, _ = reschedule_env

    response = post_appointment(client, valid_payload())

    assert response.status_code in (400, 409)
    assert inserted == []
    assert status_calls == []


def test_failed_replacement_insert_preserves_original(reschedule_env):
    client, status_calls, inserted, _, _, _ = reschedule_env

    def failing_execute(query):
        if query.table == "appointments" and query.operation == "insert":
            return FakeResponse([])
        return FakeResponse([{"appointment_id": OLD_APPOINTMENT_ID, "student_id": STUDENT_ID}])

    with patch("routers.appointment.execute_with_retry", side_effect=failing_execute):
        response = post_appointment(client, valid_payload(rescheduled_id=OLD_APPOINTMENT_ID))

    assert response.status_code == 500
    assert inserted == []
    assert status_calls == []
