from types import SimpleNamespace
from unittest.mock import patch

import pytest

from main import app

STUDENT_ID = "202311330"
OTHER_STUDENT_ID = "202311331"
FIRST_CONSENT_AT = "2026-11-25T10:00:00+00:00"


class FakeResponse:
    def __init__(self, data=None, error=None):
        self.data = data if data is not None else []
        self.error = error
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

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def eq(self, field, value):
        self.filters.append((field, "eq", value))
        return self

    def is_(self, field, value):
        self.filters.append((field, "is", value))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self


def row_response(query, row):
    # postgrest's maybe_single() sends Accept: application/vnd.pgrst.object+json,
    # so the client yields one object, not a one-element array.
    return FakeResponse(dict(row)) if query.single else FakeResponse([dict(row)])


@pytest.fixture
def consent_env():
    writes = []
    student_row = {"student_id": STUDENT_ID, "data_privacy_consented_at": None}
    profile_row = {
        "student_id": STUDENT_ID,
        "first_name": "Juan",
        "last_name": "Dela Cruz",
        "data_privacy_consented_at": None,
    }
    emergency_row = {
        "contact_id": 7,
        "student_id": STUDENT_ID,
        "contact_name": "Maria Santos",
        "relationship": "Mother",
        "phone_number": "09180000000",
        "present_address": "Town",
    }
    ordinary_update_error = {"value": None}
    consent_update_error = {"value": None}
    consent_update_raises = {"value": None}
    ordinary_update_fails = {"value": False}

    def fake_execute(query):
        nonlocal profile_row

        if query.operation == "select" and query.table == "students":
            return row_response(query, student_row)

        if query.operation == "select" and query.table == "student_masterlist":
            return row_response(query, profile_row)

        if query.operation == "select" and query.table == "emergency_contacts":
            return row_response(query, emergency_row) if emergency_row else FakeResponse([])

        if query.operation == "select" and query.table == "medical_histories":
            return FakeResponse([])

        if query.operation == "update" and query.table == "students":
            payload = dict(query.payload)
            writes.append({"payload": payload, "filters": list(query.filters)})

            if "data_privacy_consented_at" in payload:
                if consent_update_raises["value"]:
                    raise consent_update_raises["value"]
                if consent_update_error["value"]:
                    return FakeResponse(error=consent_update_error["value"])
                if student_row["data_privacy_consented_at"] is None:
                    student_row["data_privacy_consented_at"] = payload[
                        "data_privacy_consented_at"
                    ]
                    profile_row["data_privacy_consented_at"] = payload[
                        "data_privacy_consented_at"
                    ]
                return FakeResponse([dict(student_row)])

            if ordinary_update_fails["value"]:
                return FakeResponse(
                    error=ordinary_update_error["value"] or RuntimeError("db error")
                )
            student_row.update(payload)
            profile_row.update(payload)
            return FakeResponse([dict(student_row)])

        if query.operation == "update" and query.table in (
            "emergency_contacts",
            "medical_histories",
        ):
            writes.append({"payload": dict(query.payload), "filters": list(query.filters)})
            if query.table == "emergency_contacts":
                emergency_row.update(query.payload)
                return row_response(query, emergency_row)
            return FakeResponse([{}])

        if query.operation == "insert" and query.table in (
            "emergency_contacts",
            "medical_histories",
        ):
            writes.append({"payload": dict(query.payload), "filters": list(query.filters)})
            if query.table == "emergency_contacts":
                emergency_row.clear()
                emergency_row.update({"contact_id": 7, "student_id": STUDENT_ID})
                emergency_row.update(query.payload)
                return row_response(query, emergency_row)
            return FakeResponse([{}])

        return FakeResponse()

    patches = [
        patch(
            "routers.auth_guard._verify_token",
            return_value=SimpleNamespace(
                id="auth-student", email=f"{STUDENT_ID}@gordoncollege.edu.ph"
            ),
        ),
        patch("routers.student_record.supabase"),
        patch("routers.student_record.execute_with_retry", side_effect=fake_execute),
        patch("routers.student_record.is_admin_user", return_value=False),
        patch("routers.student_record.resolve_student_id", return_value=STUDENT_ID),
    ]
    started = [p.start() for p in patches]
    started[1].table.side_effect = lambda name: FakeQuery(name)

    app.config["TESTING"] = True
    client = app.test_client()

    yield {
        "client": client,
        "writes": writes,
        "student_row": student_row,
        "profile_row": profile_row,
        "emergency_row": emergency_row,
        "ordinary_update_fails": ordinary_update_fails,
        "ordinary_update_error": ordinary_update_error,
        "consent_update_error": consent_update_error,
        "consent_update_raises": consent_update_raises,
    }

    for p in reversed(patches):
        p.stop()


def patch_profile(client, payload):
    return client.patch(
        f"/api/records/{STUDENT_ID}/profile",
        json=payload,
        headers={"Authorization": "Bearer fake"},
    )


def consent_writes(writes):
    return [
        w for w in writes
        if "data_privacy_consented_at" in w["payload"]
    ]


def test_owner_true_consent_records_server_timestamp_and_echoes_it(consent_env):
    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["data"]["profile"]["data_privacy_consented_at"]

    writes = consent_writes(consent_env["writes"])
    assert len(writes) == 1
    assert ("data_privacy_consented_at", "is", None) in writes[0]["filters"]
    assert ("student_id", "eq", STUDENT_ID) in writes[0]["filters"]
    assert writes[0]["payload"]["data_privacy_consented_at"].endswith("+00:00")


def test_existing_consent_is_not_overwritten(consent_env):
    consent_env["student_row"]["data_privacy_consented_at"] = FIRST_CONSENT_AT
    consent_env["profile_row"]["data_privacy_consented_at"] = FIRST_CONSENT_AT

    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 200
    assert consent_env["student_row"]["data_privacy_consented_at"] == FIRST_CONSENT_AT
    writes = consent_writes(consent_env["writes"])
    assert len(writes) == 1
    assert ("data_privacy_consented_at", "is", None) in writes[0]["filters"]


def test_non_owner_student_cannot_consent(consent_env):
    with patch("routers.student_record.resolve_student_id", return_value=OTHER_STUDENT_ID):
        response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 403
    assert consent_writes(consent_env["writes"]) == []


def test_admin_cannot_consent_for_another_student(consent_env):
    with patch("routers.student_record.is_admin_user", return_value=True), patch(
        "routers.student_record.resolve_student_id", return_value=None
    ):
        response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 403
    assert consent_writes(consent_env["writes"]) == []


def test_admin_without_consent_still_edits_ordinary_profile(consent_env):
    with patch("routers.student_record.is_admin_user", return_value=True), patch(
        "routers.student_record.resolve_student_id", return_value=None
    ):
        response = patch_profile(consent_env["client"], {"first_name": "Pedro"})

    assert response.status_code == 200
    assert consent_writes(consent_env["writes"]) == []
    assert any(
        w["payload"] == {"first_name": "Pedro"} for w in consent_env["writes"]
    )


@pytest.mark.parametrize("value", [False, None, "true", 1, []])
def test_non_true_consent_values_do_not_write_consent(consent_env, value):
    response = patch_profile(consent_env["client"], {"data_privacy_consent": value})

    assert response.status_code == 200
    assert consent_writes(consent_env["writes"]) == []


def test_ordinary_update_failure_prevents_consent(consent_env):
    consent_env["ordinary_update_fails"]["value"] = True

    response = patch_profile(
        consent_env["client"],
        {"first_name": "Pedro", "data_privacy_consent": True},
    )

    assert response.status_code == 500
    assert consent_writes(consent_env["writes"]) == []


def test_consent_write_failure_returns_error(consent_env):
    consent_env["consent_update_error"]["value"] = RuntimeError("consent failed")

    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 500
    assert response.get_json()["success"] is False
    assert response.get_json()["error"] == "Failed to save data privacy consent"


def test_raised_consent_write_exception_returns_exact_error(consent_env):
    consent_env["consent_update_raises"]["value"] = RuntimeError("consent failed")

    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 500
    assert response.get_json()["success"] is False
    assert response.get_json()["error"] == "Failed to save data privacy consent"


def test_student_suffix_is_saved_and_echoed_by_the_profile_api(consent_env):
    response = patch_profile(consent_env["client"], {"suffix": "Jr."})

    assert response.status_code == 200
    body = response.get_json()
    assert body["data"]["profile"]["suffix"] == "Jr."
    assert any(w["payload"] == {"suffix": "Jr."} for w in consent_env["writes"])


def test_structured_emergency_name_is_saved_and_composes_contact_name(consent_env):
    response = patch_profile(
        consent_env["client"],
        {
            "emergency_contact": {
                "first_name": "Juan",
                "middle_initial": "A",
                "last_name": "Doe",
                "suffix": "Jr.",
                "relationship": "Brother",
                "phone_number": "09180000000",
                "present_address": "Town",
            }
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    ec = body["data"]["emergency_contact"]
    assert ec["contact_name"] == "Doe, Juan A. Jr."
    assert ec["first_name"] == "Juan"
    assert ec["middle_initial"] == "A"
    assert ec["last_name"] == "Doe"
    assert ec["suffix"] == "Jr."

    ec_writes = [
        w for w in consent_env["writes"]
        if "contact_name" in w["payload"] or "last_name" in w["payload"]
    ]
    assert len(ec_writes) == 1
    assert ec_writes[0]["payload"]["contact_name"] == "Doe, Juan A. Jr."


def test_structured_emergency_name_requires_first_and_last(consent_env):
    response = patch_profile(
        consent_env["client"],
        {"emergency_contact": {"suffix": "Jr."}},
    )

    assert response.status_code == 400
    assert consent_env["writes"] == []


def test_legacy_emergency_contact_name_is_preserved_when_structured_name_is_absent(consent_env):
    consent_env["emergency_row"]["contact_name"] = "Maria Santos"

    response = patch_profile(
        consent_env["client"],
        {"emergency_contact": {"relationship": "Sister"}},
    )

    assert response.status_code == 200
    assert consent_env["emergency_row"]["contact_name"] == "Maria Santos"
    assert response.get_json()["data"]["emergency_contact"]["contact_name"] == "Maria Santos"
    assert all("contact_name" not in w["payload"] for w in consent_env["writes"])
