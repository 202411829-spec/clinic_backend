import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from main import app

STUDENT_ID = "202400001"
AUTH_USER = SimpleNamespace(id="auth-admin", email="admin@gordoncollege.edu.ph")
HEADERS = {"Authorization": "Bearer test-token"}
ID_FIELDS = {
    "annual_examinations": "annual_exam_id",
    "physical_examinations": "examination_id",
    "laboratory_results": "lab_result_id",
    "chest_xrays": "chest_xray_id",
    "medical_certificates": "certificate_id",
}


class FakeResponse:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error
        self.count = len(data) if isinstance(data, list) else (1 if data else 0)


class FakeQuery:
    def __init__(self, table, state):
        self.table = table
        self.state = state
        self.operation = "select"
        self.payload = None
        self.fields = []
        self.filters = []
        self.single = False

    def select(self, *fields):
        self.operation = "select"
        self.fields = fields
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = dict(payload)
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = dict(payload)
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def is_(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self


def _matches(row, filters):
    return all(row.get(field) == value for field, value in filters)


def _examined_at_not_null_error():
    return SimpleNamespace(message='null value in column "examined_at" violates not-null constraint')


def _with_lab_relation(row, state):
    result = dict(row)
    result["chest_xrays"] = [
        dict(xray)
        for xray in state["chest_xrays"]
        if xray.get("lab_result_id") == row.get("lab_result_id")
    ]
    return result


def _execute(query, state, next_ids):
    rows = state.setdefault(query.table, [])

    if query.operation == "insert":
        ID_FIELDS.get(query.table, "id")
        inserted = dict(query.payload)
        if query.table == "physical_examinations":
            if inserted.get("examined_at", "absent") is None:
                return FakeResponse([], error=_examined_at_not_null_error())
            # Mirror the DDL default: examined_at timestamptz NOT NULL DEFAULT now().
            inserted.setdefault("examined_at", "2026-11-26T00:00:00+00:00")
        if query.table in ID_FIELDS:
            id_field = ID_FIELDS[query.table]
            next_ids[query.table] += 1
            inserted[id_field] = next_ids[query.table]
        rows.append(inserted)
        return FakeResponse([dict(inserted)])

    if query.operation == "update":
        if (
            query.table == "physical_examinations"
            and query.payload.get("examined_at", "absent") is None
        ):
            return FakeResponse([], error=_examined_at_not_null_error())
        updated = []
        for row in rows:
            if _matches(row, query.filters):
                row.update(query.payload)
                updated.append(dict(row))
        return FakeResponse(updated)

    matched = [row for row in rows if _matches(row, query.filters)]
    if query.table == "laboratory_results" and any("chest_xrays" in f for f in query.fields):
        matched = [_with_lab_relation(row, state) for row in matched]
    if query.single:
        return FakeResponse(dict(matched[0]) if matched else None)
    return FakeResponse([dict(row) for row in matched])


@pytest.fixture
def record_env():
    state = {
        "student_masterlist": [{
            "student_id": STUDENT_ID,
            "first_name": "Paolo",
            "last_name": "Cruz",
        }],
        "annual_examinations": [],
        "physical_examinations": [],
        "laboratory_results": [],
        "chest_xrays": [],
        "medical_certificates": [],
    }
    next_ids = {table: 0 for table in ID_FIELDS}

    patches = [
        patch("routers.auth_guard._verify_token", return_value=AUTH_USER),
        patch("routers.auth_guard.is_admin_user", return_value=True),
        patch("routers.student_record.supabase"),
        patch(
            "routers.student_record.execute_with_retry",
            side_effect=lambda query: _execute(query, state, next_ids),
        ),
    ]
    started = [item.start() for item in patches]
    started[2].table.side_effect = lambda name: FakeQuery(name, state)

    app.config["TESTING"] = True
    yield {
        "client": app.test_client(),
        "state": state,
    }

    for item in reversed(patches):
        item.stop()


def test_annual_exam_creates_not_null_school_year_from_placeholder_payload(record_env):
    client = record_env["client"]

    response = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year I", "school_year": None, "date_examined": "2026-01-15"},
    )

    assert response.status_code == 200
    created = response.get_json()
    assert created["school_year"] == "2025-2026"
    assert created["date_examined"] == "2026-01-15"
    assert record_env["state"]["annual_examinations"][0]["school_year"] == "2025-2026"


def test_physical_exam_saves_and_reloads_selected_date(record_env):
    client = record_env["client"]
    created = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year I", "school_year": "2025-2026"},
    ).get_json()
    exam_id = created["annual_exam_id"]

    saved = client.put(
        f"/api/records/annual-exams/{exam_id}/physical-examination",
        headers=HEADERS,
        json={
            "date_examined": "2026-02-02",
            "blood_pressure": "120/80",
            "weight": 55,
            "height": 160,
            "skin": {"result": "Normal", "remarks": ""},
            "heent": {"result": "Normal", "remarks": ""},
            "heart": {"result": "Normal", "remarks": ""},
            "abdomen": {"result": "Normal", "remarks": ""},
            "extremities": {"result": "Normal", "remarks": ""},
            "other_findings": {"result": "Normal", "remarks": ""},
        },
    )
    assert saved.status_code == 200

    annual_row = record_env["state"]["annual_examinations"][0]
    assert annual_row["date_examined"] == "2026-02-02"

    reloaded = client.get(
        f"/api/records/annual-exams/{exam_id}/physical-examination",
        headers=HEADERS,
    )
    assert reloaded.status_code == 200
    body = reloaded.get_json()
    assert body["date_examined"] == "2026-02-02"
    assert body["blood_pressure"] == "120/80"
    assert body["bmi"] == 21.5


def test_lab_results_save_all_sections_and_reload(record_env):
    client = record_env["client"]
    exam_id = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year I", "school_year": "2025-2026"},
    ).get_json()["annual_exam_id"]
    assert client.put(
        f"/api/records/annual-exams/{exam_id}/physical-examination",
        headers=HEADERS,
        json={"date_examined": "2026-02-02"},
    ).status_code == 200

    other_results = {
        "type": "Fecalysis",
        "details": {"color": "Brown", "consistency": "Formed"},
        "extra": [{"id": "extra-1", "examType": "Stool", "details": {"occult_blood": "Negative"}}],
    }
    response = client.put(
        f"/api/records/annual-exams/{exam_id}/lab-results",
        headers=HEADERS,
        json={
            "cbc_date": "2026-02-03",
            "hemoglobin": 13.2,
            "hematocrit": 40.1,
            "wbc": 8.4,
            "platelet_count": 250,
            "blood_type": "O+",
            "urinalysis_date": "2026-02-04",
            "glucose": "Negative",
            "protein": "Negative",
            "other_examination_type": "Fecalysis",
            "other_results": json.dumps(other_results),
            "chest_xray_date": "2026-02-05",
            "chest_xray_result": "Normal",
            "chest_xray_notes": "No infiltrate",
        },
    )
    assert response.status_code == 200

    reloaded = client.get(
        f"/api/records/annual-exams/{exam_id}/lab-results",
        headers=HEADERS,
    ).get_json()
    assert reloaded["cbc_date"] == "2026-02-03"
    assert reloaded["hemoglobin"] == 13.2
    assert reloaded["urinalysis_date"] == "2026-02-04"
    assert reloaded["glucose"] == "Negative"
    assert json.loads(reloaded["other_results"]) == other_results
    assert reloaded["chest_xrays"][0]["chest_xray_result"] == "Normal"


def test_diagnosis_and_certificate_use_saved_values(record_env):
    client = record_env["client"]
    exam_id = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year I", "school_year": "2025-2026"},
    ).get_json()["annual_exam_id"]

    saved = client.put(
        f"/api/records/annual-exams/{exam_id}/diagnosis",
        headers=HEADERS,
        json={
            "diagnosis": "Upper respiratory infection",
            "final_remark": "Cleared after treatment",
            "essentially_normal": False,
            "examined_by": "Joseph Daniel B. Ramos",
            "license_no": "L-12345",
        },
    )
    assert saved.status_code == 200
    assert saved.get_json()["examined_by"] == "Joseph Daniel B. Ramos"
    assert saved.get_json()["license_no"] == "L-12345"

    reloaded = client.get(
        f"/api/records/annual-exams/{exam_id}/diagnosis",
        headers=HEADERS,
    ).get_json()
    assert reloaded["diagnosis"] == "Upper respiratory infection"
    assert reloaded["final_remark"] == "Cleared after treatment"
    assert reloaded["examined_by"] == "Joseph Daniel B. Ramos"
    assert reloaded["license_no"] == "L-12345"

    certificate = client.get(
        f"/api/records/annual-exams/{exam_id}/medical-certificate",
        headers=HEADERS,
    )
    assert certificate.status_code == 200
    body = certificate.get_json()
    assert body["certificate"]["diagnosis"] == "Upper respiratory infection"
    assert body["certificate"]["final_remark"] == "Cleared after treatment"


def test_annual_exam_status_update_targets_only_the_selected_year(record_env):
    client = record_env["client"]
    year_one = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year I", "school_year": "2025-2026"},
    ).get_json()
    year_two = client.post(
        f"/api/records/{STUDENT_ID}/annual-exams",
        headers=HEADERS,
        json={"year_label": "Year II", "school_year": "2026-2027"},
    ).get_json()

    updated = client.patch(
        f"/api/records/annual-exams/{year_one['annual_exam_id']}/status",
        headers=HEADERS,
        json={"exam_status": "cleared"},
    )
    assert updated.status_code == 200
    assert updated.get_json()["exam_status"] == "cleared"

    rows = {row["year_label"]: row for row in record_env["state"]["annual_examinations"]}
    assert rows["Year I"]["exam_status"] == "cleared"
    assert rows["Year II"]["exam_status"] == "pending"

    invalid = client.patch(
        f"/api/records/annual-exams/{year_two['annual_exam_id']}/status",
        headers=HEADERS,
        json={"exam_status": "unknown"},
    )
    assert invalid.status_code == 400
    assert rows["Year II"]["exam_status"] == "pending"

    missing = client.patch(
        "/api/records/annual-exams/9999/status",
        headers=HEADERS,
        json={"exam_status": "cleared"},
    )
    assert missing.status_code == 404


def test_certificate_chain_saves_all_four_years_without_cross_year_overwrite(record_env):
    client = record_env["client"]
    school_years = {
        "Year I": "2025-2026",
        "Year II": "2026-2027",
        "Year III": "2027-2028",
        "Year IV": "2028-2029",
    }
    expected = {}

    for index, (year_label, school_year) in enumerate(school_years.items(), start=1):
        created = client.post(
            f"/api/records/{STUDENT_ID}/annual-exams",
            headers=HEADERS,
            json={"year_label": year_label, "school_year": school_year},
        )
        assert created.status_code == 200
        exam_id = created.get_json()["annual_exam_id"]

        # An empty Date Examined is the normal path for later years. The physical
        # row must still be created because examined_at has a DB default.
        physical = client.put(
            f"/api/records/annual-exams/{exam_id}/physical-examination",
            headers=HEADERS,
            json={
                "date_examined": None,
                "blood_pressure": f"{110 + index}/70",
                "skin": {"result": "Normal", "remarks": ""},
                "heent": {"result": "Normal", "remarks": ""},
                "heart": {"result": "Normal", "remarks": ""},
                "abdomen": {"result": "Normal", "remarks": ""},
                "extremities": {"result": "Normal", "remarks": ""},
                "other_findings": {"result": "Normal", "remarks": ""},
            },
        )
        assert physical.status_code == 200, physical.get_json()

        lab = client.put(
            f"/api/records/annual-exams/{exam_id}/lab-results",
            headers=HEADERS,
            json={
                "cbc_date": "2026-02-03",
                "hemoglobin": 12 + index,
                "blood_type": "O+",
            },
        )
        assert lab.status_code == 200, lab.get_json()

        diagnosis = f"Diagnosis for {year_label}"
        final_remark = f"Final remark for {year_label}"
        saved = client.put(
            f"/api/records/annual-exams/{exam_id}/diagnosis",
            headers=HEADERS,
            json={
                "diagnosis": diagnosis,
                "final_remark": final_remark,
                "essentially_normal": False,
                "examined_by": "Joseph Daniel B. Ramos",
                "license_no": "L-12345",
            },
        )
        assert saved.status_code == 200

        certificate = client.get(
            f"/api/records/annual-exams/{exam_id}/medical-certificate",
            headers=HEADERS,
        )
        assert certificate.status_code == 200
        body = certificate.get_json()
        assert body["certificate"]["diagnosis"] == diagnosis
        assert body["certificate"]["final_remark"] == final_remark
        expected[year_label] = (exam_id, diagnosis, final_remark)

    state = record_env["state"]
    assert {row["year_label"] for row in state["annual_examinations"]} == set(school_years)
    assert len(state["physical_examinations"]) == 4
    assert len(state["laboratory_results"]) == 4
    assert len(state["medical_certificates"]) == 4
    assert all(row.get("examined_at") for row in state["physical_examinations"])

    for year_label, (exam_id, diagnosis, final_remark) in expected.items():
        certificate_row = next(
            row for row in state["medical_certificates"]
            if row["annual_exam_id"] == exam_id
        )
        assert certificate_row["diagnosis"] == diagnosis
        assert certificate_row["final_remark"] == final_remark
        assert year_label in diagnosis
