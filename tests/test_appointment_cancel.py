import pytest
from unittest.mock import MagicMock, patch

from main import app

STUDENT_ID = "202311330"
APPOINTMENT_ID = 10
AUTH_USER_ID = "auth-1"
EMAIL = f"{STUDENT_ID}@gordoncollege.edu.ph"


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
        self.single = False

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

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def order(self, _field, **_kwargs):
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self


@pytest.fixture
def cancel_env():
    status_calls = []
    appointment = {"appointment_id": APPOINTMENT_ID, "student_id": STUDENT_ID}
    statuses = [{"new_status": "pending"}]

    def fake_execute(query):
        filters = dict(query.filters)

        if query.table == "app_accounts" and query.operation == "select":
            if filters.get("auth_user_id") == AUTH_USER_ID and filters.get("account_type") == "student":
                return FakeResponse([{"student_id": STUDENT_ID}])
            return FakeResponse([])

        if query.table == "appointments" and query.operation == "select":
            if filters.get("appointment_id") == APPOINTMENT_ID:
                return FakeResponse(appointment if query.single else [appointment])
            return FakeResponse([])

        if query.table == "appointment_status_history" and query.operation == "select":
            return FakeResponse(statuses)

        if query.table == "admin_accounts" and query.operation == "select":
            return FakeResponse([{"admin_id": 7}])

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
        patch(
            "routers.auth_guard._verify_token",
            return_value=MagicMock(id=AUTH_USER_ID, email=EMAIL),
        ),
        patch("routers.auth_guard.supabase"),
        patch("routers.auth_guard.execute_with_retry", side_effect=fake_execute),
        patch("routers.appointment.supabase"),
        patch("routers.appointment.execute_with_retry", side_effect=fake_execute),
        patch("routers.appointment.resolve_changed_by_admin_id", return_value=7),
        patch("routers.appointment._write_status", side_effect=fake_write_status),
    ]
    started = [p.start() for p in patches]
    started[1].table.side_effect = lambda name: FakeQuery(name)
    started[3].table.side_effect = lambda name: FakeQuery(name)

    app.config["TESTING"] = True
    client = app.test_client()

    yield client, status_calls, appointment, statuses

    for p in reversed(patches):
        p.stop()


def delete_appointment(client):
    return client.delete(
        f"/appointments/{APPOINTMENT_ID}",
        headers={"Authorization": "Bearer fake"},
    )


def test_student_can_cancel_own_appointment_from_verified_token(cancel_env):
    client, status_calls, _, _ = cancel_env

    response = delete_appointment(client)

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["message"] == "Appointment cancelled"
    assert status_calls == [{
        "appointment_id": APPOINTMENT_ID,
        "previous_status": "pending",
        "new_status": "cancelled",
        "remarks": "Cancelled by student",
        "changed_by": 7,
    }]


def test_student_cannot_cancel_another_students_appointment(cancel_env):
    client, status_calls, appointment, _ = cancel_env
    appointment["student_id"] = "202311331"

    response = delete_appointment(client)

    assert response.status_code == 403
    assert response.get_json()["error"] == "You can only cancel your own appointments"
    assert status_calls == []


def test_already_cancelled_appointment_is_not_written_again(cancel_env):
    client, status_calls, _, statuses = cancel_env
    statuses[0]["new_status"] = "cancelled"

    response = delete_appointment(client)

    assert response.status_code == 400
    assert response.get_json()["error"] == "Appointment is already cancelled"
    assert status_calls == []
