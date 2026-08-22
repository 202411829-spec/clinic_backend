"""Student Record endpoints.

Backs the Student Record page: profile header, Year I-IV annual exam
history, per-year Physical Examination / Laboratory Results / Diagnosis
forms, plus the Medical Certificate and Medical Summary views.

Converted from FastAPI to a Flask blueprint.
"""

from flask import Blueprint, jsonify, request
from datetime import date

from supabase_client import supabase

student_record_bp = Blueprint("student-record", __name__, url_prefix="/api/records")

YEAR_LABELS = ["Year I", "Year II", "Year III", "Year IV"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(message, status):
    return jsonify({"detail": message}), status


def _get_annual_exam_or_404(annual_exam_id):
    """Returns (exam_row, None) or (None, error_response)."""
    exam = (
        supabase.table("annual_examination")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if not exam.data:
        return None, _error("Annual examination not found", 404)
    return exam.data, None


def _get_physical_exam_or_409(annual_exam_id):
    """Returns (exam_row, None) or (None, error_response)."""
    exam = (
        supabase.table("physical_examination")
        .select("examination_id, student_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if not exam.data:
        return None, _error(
            "Save the Physical Examination for this year before adding lab results.",
            409,
        )
    return exam.data, None


def _compute_bmi(weight_kg, height_cm):
    if not weight_kg or not height_cm:
        return None
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


def _iso_or_none(value):
    """Accepts 'YYYY-MM-DD' strings from JSON; returns ISO string or None."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Profile header + annual exam history
# ---------------------------------------------------------------------------

@student_record_bp.route("/<path:student_id>", methods=["GET"])
def get_student_record_header(student_id):
    profile = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not profile.data:
        return _error("Student not found", 404)

    exams_resp = (
        supabase.table("annual_examination")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    by_year = {row["year_label"]: row for row in exams_resp.data}

    history = []
    for label in YEAR_LABELS:
        if label in by_year:
            history.append(by_year[label])
        else:
            history.append({
                "annual_exam_id": None,
                "student_id": student_id,
                "year_label": label,
                "school_year": None,
                "status": "no_record",
                "date_examined": None,
                "examined_by": None,
            })

    return jsonify({"profile": profile.data, "annual_exam_history": history})


@student_record_bp.route("/<path:student_id>/annual-exams", methods=["POST"])
def add_annual_exam(student_id):
    body = request.get_json(silent=True) or {}

    year_label = body.get("year_label")
    if year_label not in YEAR_LABELS:
        return _error(f"year_label must be one of {YEAR_LABELS}", 400)

    existing = (
        supabase.table("annual_examination")
        .select("annual_exam_id")
        .eq("student_id", student_id)
        .eq("year_label", year_label)
        .maybe_single()
        .execute()
    )
    if existing.data:
        return _error(f"{year_label} already exists for this student", 409)

    response = (
        supabase.table("annual_examination")
        .insert({
            "student_id": student_id,
            "school_year": body.get("school_year"),
            "year_label": year_label,
            "status": "pending",
            "date_examined": _iso_or_none(body.get("date_examined")),
            "examined_by": body.get("examined_by"),
        })
        .execute()
    )
    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Physical Examination
# ---------------------------------------------------------------------------

FINDING_FIELDS = ["skin", "heent", "heart", "abdomen", "extremities", "other_findings"]


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/physical-examination", methods=["GET"])
def get_physical_examination(annual_exam_id):
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error
    response = (
        supabase.table("physical_examination")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    # null (None) if not yet saved — matches original FastAPI behaviour.
    if response.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(response.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/physical-examination", methods=["PUT"])
def save_physical_examination(annual_exam_id):
    exam, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    def finding_result(key, default="normal"):
        value = body.get(key)
        if isinstance(value, dict):
            return value.get("result") or default
        return default

    def finding_remarks(key):
        value = body.get(key)
        if isinstance(value, dict):
            return value.get("remarks")
        return None

    row = {
        "student_id": exam["student_id"],
        "annual_exam_id": annual_exam_id,
        "school_year": exam["school_year"],
        "blood_pressure": body.get("blood_pressure"),
        "cardiac_rate": body.get("cardiac_rate"),
        "respiratory_rate": body.get("respiratory_rate"),
        "temperature": body.get("temperature"),
        "weight": body.get("weight"),
        "height": body.get("height"),
        "bmi": _compute_bmi(body.get("weight"), body.get("height")),
        "visual_acuity": body.get("visual_acuity"),
        "examined_by": body.get("examined_by"),
        "examined_at": _iso_or_none(body.get("date_examined")),
        "other_findings_label": body.get("other_findings_label"),
    }

    for key in FINDING_FIELDS:
        column = key if key != "other_findings" else "other_findings"
        row[f"{column}_result"] = finding_result(key)
        row[column] = finding_remarks(key)

    existing = (
        supabase.table("physical_examination")
        .select("examination_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        response = (
            supabase.table("physical_examination")
            .update(row)
            .eq("examination_id", existing.data["examination_id"])
            .execute()
        )
    else:
        response = supabase.table("physical_examination").insert(row).execute()

    # First saved physical exam moves the annual exam out of "no_record".
    if exam["status"] == "no_record":
        supabase.table("annual_examination").update({"status": "pending"}).eq(
            "annual_exam_id", annual_exam_id
        ).execute()

    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Laboratory Results
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/lab-results", methods=["GET"])
def get_lab_results(annual_exam_id):
    physical_exam, error = _get_physical_exam_or_409(annual_exam_id)
    if error:
        return error
    lab = (
        supabase.table("laboratory_result")
        .select("*, chest_xray(*)")
        .eq("examination_id", physical_exam["examination_id"])
        .maybe_single()
        .execute()
    )
    if lab.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(lab.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/lab-results", methods=["PUT"])
def save_lab_results(annual_exam_id):
    physical_exam, error = _get_physical_exam_or_409(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    lab_row = {
        "student_id": physical_exam["student_id"],
        "examination_id": physical_exam["examination_id"],
        "cbc_date": _iso_or_none(body.get("cbc_date")),
        "hemoglobin": body.get("hemoglobin"),
        "hematocrit": body.get("hematocrit"),
        "wbc": body.get("wbc"),
        "platelet_count": body.get("platelet_count"),
        "blood_type": body.get("blood_type"),
        "urinalysis_date": _iso_or_none(body.get("urinalysis_date")),
        "glucose": body.get("glucose"),
        "protein": body.get("protein"),
        "other_examination_type": body.get("other_examination_type"),
        "other_date": _iso_or_none(body.get("other_date")),
        "other_results": body.get("other_results"),
    }

    existing = (
        supabase.table("laboratory_result")
        .select("lab_result_id")
        .eq("examination_id", physical_exam["examination_id"])
        .maybe_single()
        .execute()
    )
    if existing.data:
        lab_result_id = existing.data["lab_result_id"]
        supabase.table("laboratory_result").update(lab_row).eq(
            "lab_result_id", lab_result_id
        ).execute()
    else:
        inserted = supabase.table("laboratory_result").insert(lab_row).execute()
        lab_result_id = inserted.data[0]["lab_result_id"]

    # Chest X-ray is its own table.
    if body.get("chest_xray_date") or body.get("chest_xray_result") or body.get("chest_xray_notes"):
        xray_row = {
            "lab_result_id": lab_result_id,
            "chest_xray_date": _iso_or_none(body.get("chest_xray_date")),
            "chest_xray_result": body.get("chest_xray_result"),
            "chest_xray_notes": body.get("chest_xray_notes"),
        }
        existing_xray = (
            supabase.table("chest_xray")
            .select("chest_xray_id")
            .eq("lab_result_id", lab_result_id)
            .maybe_single()
            .execute()
        )
        if existing_xray.data:
            supabase.table("chest_xray").update(xray_row).eq(
                "chest_xray_id", existing_xray.data["chest_xray_id"]
            ).execute()
        else:
            supabase.table("chest_xray").insert(xray_row).execute()

    return get_lab_results(annual_exam_id)


# ---------------------------------------------------------------------------
# Diagnosis & Final Remark  (-> populates the Medical Certificate)
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/diagnosis", methods=["GET"])
def get_diagnosis(annual_exam_id):
    response = (
        supabase.table("medical_certificate")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if response.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(response.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/diagnosis", methods=["PUT"])
def save_diagnosis(annual_exam_id):
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    row = {
        "annual_exam_id": annual_exam_id,
        "diagnosis": body.get("diagnosis"),
        "final_remark": body.get("final_remark"),
        "essentially_normal": bool(body.get("essentially_normal", False)),
        "purposes": body.get("purposes") or [],
        "prepared_by": body.get("examined_by"),
        "date_issued": _iso_or_none(body.get("issued_on")) or date.today().isoformat(),
    }

    existing = (
        supabase.table("medical_certificate")
        .select("certificate_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        response = (
            supabase.table("medical_certificate")
            .update(row)
            .eq("certificate_id", existing.data["certificate_id"])
            .execute()
        )
    else:
        response = supabase.table("medical_certificate").insert(row).execute()

    supabase.table("annual_examination").update({"status": "cleared"}).eq(
        "annual_exam_id", annual_exam_id
    ).execute()

    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Medical Certificate (printable view)
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/medical-certificate", methods=["GET"])
def get_medical_certificate(annual_exam_id):
    exam, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    profile = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", exam["student_id"])
        .maybe_single()
        .execute()
    )
    certificate = (
        supabase.table("medical_certificate")
        .select("*, admin!fk_certificate_prepared(firstname, last_name, license_no)")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if not certificate.data:
        return _error("No diagnosis saved for this year yet", 404)

    return jsonify({"student": profile.data, "certificate": certificate.data})


# ---------------------------------------------------------------------------
# Medical Summary (all-years rollup)
# ---------------------------------------------------------------------------

@student_record_bp.route("/<path:student_id>/medical-summary", methods=["GET"])
def get_medical_summary(student_id):
    profile = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not profile.data:
        return _error("Student not found", 404)

    emergency_contact = (
        supabase.table("emergency_contact")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    medical_history = (
        supabase.table("medical_histories")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )

    exams = (
        supabase.table("annual_examination")
        .select("*, physical_examination(*), laboratory_result(*, chest_xray(*))")
        .eq("student_id", student_id)
        .execute()
    )
    by_year = {row["year_label"]: row for row in exams.data}
    years = {label: by_year.get(label) for label in YEAR_LABELS}

    return jsonify({
        "profile": profile.data,
        "emergency_contact": emergency_contact.data,
        "medical_history": medical_history.data,
        "years": years,
    })