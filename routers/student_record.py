"""Student Record endpoints.

Backs the Student Record page: profile header, Year I-IV annual exam
history, per-year Physical Examination / Laboratory Results / Diagnosis
forms, plus the Medical Certificate and Medical Summary views.

Converted from FastAPI to a Flask blueprint.
"""

from types import SimpleNamespace
from flask import Blueprint, g, jsonify, request
from datetime import date

from database import supabase
from routers.auth_guard import require_auth, require_admin, resolve_student_id, _is_admin_user
from routers.helpers import execute_with_retry, normalize_student_id

student_record_bp = Blueprint("student-record", __name__, url_prefix="/api/records")

YEAR_LABELS = ["Year I", "Year II", "Year III", "Year IV"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(message, status):
    return jsonify({"success": False, "error": message}), status


def _get_annual_exam_or_404(annual_exam_id):
    """Returns (exam_row, None) or (None, error_response)."""
    exam = execute_with_retry(
        supabase.table("annual_examinations")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if not exam.data:
        return None, _error("Annual examination not found", 404)
    return exam.data, None


def _get_physical_exam_or_409(annual_exam_id):
    """Returns (exam_row, None) or (None, error_response)."""
    exam = execute_with_retry(
        supabase.table("physical_examinations")
        .select("examination_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if not exam.data:
        return None, _error(
            "Save the Physical Examination for this year before adding lab results.",
            409,
        )
    return exam.data, None


def _compute_bmi(weight_kg, height_cm):
    try:
        w = float(weight_kg) if weight_kg not in (None, "") else None
        h = float(height_cm) if height_cm not in (None, "") else None
        if not w or not h:
            return None
        height_m = h / 100
        if height_m <= 0:
            return None
        return round(w / (height_m ** 2), 1)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


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
@require_auth
def get_student_record_header(student_id):
    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Student not found", 404)

    profile = execute_with_retry(
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", sid)
        .maybe_single()
    )
    if not profile.data:
        return _error("Student not found", 404)

    exams_resp = execute_with_retry(
        supabase.table("annual_examinations")
        .select("*")
        .eq("student_id", sid)
    )
    by_year = {row["year_label"]: row for row in exams_resp.data}

    history = []
    for label in YEAR_LABELS:
        if label in by_year:
            history.append(by_year[label])
        else:
            history.append({
                "annual_exam_id": None,
                "student_id": sid,
                "year_label": label,
                "school_year": None,
                "exam_status": "no_record",
                "date_examined": None,
                "examined_by_admin_id": None,
            })

    return jsonify({"profile": profile.data, "annual_exam_history": history})


@student_record_bp.route("/<path:student_id>/annual-exams", methods=["POST"])
@require_admin
def add_annual_exam(student_id):
    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Student not found", 404)

    body = request.get_json(silent=True) or {}

    year_label = body.get("year_label")
    if year_label not in YEAR_LABELS:
        return _error(f"year_label must be one of {YEAR_LABELS}", 400)

    existing = execute_with_retry(
        supabase.table("annual_examinations")
        .select("annual_exam_id")
        .eq("student_id", sid)
        .eq("year_label", year_label)
        .maybe_single()
    )
    if existing.data:
        return _error(f"{year_label} already exists for this student", 409)

    response = execute_with_retry(
        supabase.table("annual_examinations")
        .insert({
            "student_id": sid,
            "school_year": body.get("school_year"),
            "year_label": year_label,
            "exam_status": "pending",
            "date_examined": _iso_or_none(body.get("date_examined")),
            "examined_by_admin_id": body.get("examined_by"),
        })
    )
    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Physical Examination
# ---------------------------------------------------------------------------

FINDING_FIELDS = ["skin", "heent", "heart", "abdomen", "extremities", "other_findings"]


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/physical-examination", methods=["GET"])
@require_auth
def get_physical_examination(annual_exam_id):
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error
    response = execute_with_retry(
        supabase.table("physical_examinations")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    # null (None) if not yet saved — matches original FastAPI behaviour.
    if response.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(response.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/physical-examination", methods=["PUT"])
@require_admin
def save_physical_examination(annual_exam_id):
    exam, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    def finding_result(key, default="Normal"):
        value = body.get(key)
        if isinstance(value, dict):
            return value.get("result") or default
        return default

    def finding_remarks(key):
        value = body.get(key)
        if isinstance(value, dict):
            return value.get("remarks")
        return None

    examined_by_raw = body.get("examined_by")
    try:
        examined_by_id = int(examined_by_raw) if examined_by_raw not in (None, "") else None
    except (ValueError, TypeError):
        examined_by_id = None
    row = {
        "annual_exam_id": annual_exam_id,
        "blood_pressure": body.get("blood_pressure"),
        "cardiac_rate": body.get("cardiac_rate"),
        "respiratory_rate": body.get("respiratory_rate"),
        "temperature": body.get("temperature"),
        "weight_kg": body.get("weight"),
        "height_cm": body.get("height"),
        "bmi": _compute_bmi(body.get("weight"), body.get("height")),
        "visual_acuity": body.get("visual_acuity"),
        "examined_by_admin_id": examined_by_id,
        "examined_at": _iso_or_none(body.get("date_examined")),
        "other_findings_label": body.get("other_findings_label"),
        "general_remarks": body.get("general_remarks"),
        "final_assessment": body.get("final_assessment"),
    }

    for key in FINDING_FIELDS:
        column = key if key != "other_findings" else "other_findings"
        row[f"{column}_result"] = finding_result(key)
        row[f"{column}_remarks"] = finding_remarks(key)

    existing = execute_with_retry(
        supabase.table("physical_examinations")
        .select("examination_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if existing.data:
        response = execute_with_retry(
            supabase.table("physical_examinations")
            .update(row)
            .eq("examination_id", existing.data["examination_id"])
        )
    else:
        response = execute_with_retry(
            supabase.table("physical_examinations").insert(row)
        )

    # First saved physical exam moves the annual exam out of "no_record".
    if exam["exam_status"] == "no_record":
        execute_with_retry(
            supabase.table("annual_examinations")
            .update({"exam_status": "pending"})
            .eq("annual_exam_id", annual_exam_id)
        )

    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Laboratory Results
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/lab-results", methods=["GET"])
@require_auth
def get_lab_results(annual_exam_id):
    physical_exam, error = _get_physical_exam_or_409(annual_exam_id)
    if error:
        return error
    lab = execute_with_retry(
        supabase.table("laboratory_results")
        .select("*, chest_xrays(*)")
        .eq("examination_id", physical_exam["examination_id"])
        .maybe_single()
    )
    if lab.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(lab.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/lab-results", methods=["PUT"])
@require_admin
def save_lab_results(annual_exam_id):
    physical_exam, error = _get_physical_exam_or_409(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    lab_row = {
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

    existing = execute_with_retry(
        supabase.table("laboratory_results")
        .select("lab_result_id")
        .eq("examination_id", physical_exam["examination_id"])
        .maybe_single()
    )
    if existing.data:
        lab_result_id = existing.data["lab_result_id"]
        execute_with_retry(
            supabase.table("laboratory_results")
            .update(lab_row)
            .eq("lab_result_id", lab_result_id)
        )
    else:
        inserted = execute_with_retry(
            supabase.table("laboratory_results").insert(lab_row)
        )
        lab_result_id = inserted.data[0]["lab_result_id"]

# Chest X-ray is its own table.
    if body.get("chest_xray_date") or body.get("chest_xray_result") or body.get("chest_xray_notes"):
        xray_row = {
            "lab_result_id": lab_result_id,
            "chest_xray_date": _iso_or_none(body.get("chest_xray_date")),
            "chest_xray_result": body.get("chest_xray_result"),
            "chest_xray_notes": body.get("chest_xray_notes"),
        }
        existing_xray = execute_with_retry(
            supabase.table("chest_xrays")
            .select("chest_xray_id")
            .eq("lab_result_id", lab_result_id)
            .maybe_single()
        )
        if existing_xray.data:
            execute_with_retry(
                supabase.table("chest_xrays").update(xray_row).eq(
                    "chest_xray_id", existing_xray.data["chest_xray_id"]
                )
            )
        else:
            execute_with_retry(
                supabase.table("chest_xrays").insert(xray_row)
            )

    return get_lab_results(annual_exam_id)


# ---------------------------------------------------------------------------
# Diagnosis & Final Remark  (-> populates the Medical Certificate)
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/diagnosis", methods=["GET"])
@require_auth
def get_diagnosis(annual_exam_id):
    response = execute_with_retry(
        supabase.table("medical_certificates")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if response.data is None:
        return "null", 200, {"Content-Type": "application/json"}
    return jsonify(response.data)


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/diagnosis", methods=["PUT"])
@require_admin
def save_diagnosis(annual_exam_id):
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    examined_by_raw = body.get("examined_by")
    try:
        prepared_by_admin_id = int(examined_by_raw) if examined_by_raw not in (None, "") else None
    except (ValueError, TypeError):
        prepared_by_admin_id = None
    row = {
        "annual_exam_id": annual_exam_id,
        "diagnosis": body.get("diagnosis"),
        "final_remark": body.get("final_remark"),
        "is_essentially_normal": bool(body.get("essentially_normal", False)),
        "purposes": body.get("purposes") or [],
        "prepared_by_admin_id": prepared_by_admin_id,
        "date_issued": _iso_or_none(body.get("issued_on")) or date.today().isoformat(),
    }

    existing = execute_with_retry(
        supabase.table("medical_certificates")
        .select("certificate_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if existing.data:
        response = execute_with_retry(
            supabase.table("medical_certificates")
            .update(row)
            .eq("certificate_id", existing.data["certificate_id"])
        )
    else:
        response = execute_with_retry(
            supabase.table("medical_certificates").insert(row)
        )

    execute_with_retry(
        supabase.table("annual_examinations")
        .update({"exam_status": "cleared"})
        .eq("annual_exam_id", annual_exam_id)
    )

    return jsonify(response.data[0])


# ---------------------------------------------------------------------------
# Medical Certificate (printable view)
# ---------------------------------------------------------------------------

@student_record_bp.route("/annual-exams/<int:annual_exam_id>/medical-certificate", methods=["GET"])
@require_auth
def get_medical_certificate(annual_exam_id):
    exam, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    profile = execute_with_retry(
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", exam["student_id"])
        .maybe_single()
    )
    certificate = execute_with_retry(
        supabase.table("medical_certificates")
        .select("*, admin_accounts!medical_certificates_prepared_by_admin_id_fkey(first_name, last_name, license_no)")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    if not certificate.data:
        return _error("No diagnosis saved for this year yet", 404)

    return jsonify({"student": profile.data, "certificate": certificate.data})


# ---------------------------------------------------------------------------
# Medical Summary (all-years rollup)
# ---------------------------------------------------------------------------

@student_record_bp.route("/<path:student_id>/medical-summary", methods=["GET"])
@require_auth
def get_medical_summary(student_id):
    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Student not found", 404)

    profile = execute_with_retry(
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", sid)
        .maybe_single()
    )
    if not profile.data:
        return _error("Student not found", 404)

    emergency_contact = execute_with_retry(
        supabase.table("emergency_contacts")
        .select("*")
        .eq("student_id", sid)
        .limit(1)
    )
    medical_history = execute_with_retry(
        supabase.table("medical_histories")
        .select("*")
        .eq("student_id", sid)
        .limit(1)
    )

    exams = execute_with_retry(
        supabase.table("annual_examinations")
        .select("*, physical_examinations(*, laboratory_results(*, chest_xrays(*)))")
        .eq("student_id", sid)
    )
    by_year = {row["year_label"]: row for row in exams.data}
    years = {label: by_year.get(label) for label in YEAR_LABELS}

    return jsonify({
        "profile": profile.data,
        "emergency_contact": emergency_contact.data[0] if emergency_contact.data else None,
        "medical_history": medical_history.data[0] if medical_history.data else None,
        "years": years,
    })


# ---------------------------------------------------------------------------
# Student self-edit profile (PATCH)
# ---------------------------------------------------------------------------

# Allowed student-editable fields on the `students` table.
_STUDENT_EDITABLE_FIELDS = {
    "first_name", "middle_initial", "last_name", "gender",
    "birth_date", "civil_status", "contact_number",
    "present_address", "photo",
}

# Allowed boolean fields on `medical_histories`.
_MEDICAL_HISTORY_BOOL_FIELDS = {
    "has_asthma", "has_chicken_pox", "has_diabetes",
    "has_dysmenorrhea", "has_epilepsy_seizure",
    "has_heart_disorder", "has_hepatitis", "has_hypertension",
    "has_measles", "has_mumps", "has_anxiety_disorder",
    "has_panic_attack", "has_pneumonia", "has_tb_primary_complex",
    "has_typhoid_fever", "has_covid19", "has_urinary_tract_infection",
}

# Allowed text/date fields on `medical_histories` (beyond the booleans).
_MEDICAL_HISTORY_OTHER_FIELDS = {
    "allergies", "has_operation_history",
    "operation_procedure", "operation_date",
}

# Fields that need ISO-date validation.
_DATE_FIELDS = {"birth_date", "operation_date"}


def _upsert_by_student_id(table, student_id, payload):
    """Update a row by student_id; insert if none exists yet."""
    existing = execute_with_retry(
        supabase.table(table)
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
    )
    if existing.data:
        # Find the PK column for the table.
        pk_map = {
            "emergency_contacts": "contact_id",
            "medical_histories": "history_id",
        }
        pk = pk_map[table]
        response = execute_with_retry(
            supabase.table(table)
            .update(payload)
            .eq(pk, existing.data[0][pk])
        )
    else:
        payload["student_id"] = student_id
        response = execute_with_retry(
            supabase.table(table).insert(payload)
        )
    return response


@student_record_bp.route("/<path:student_id>/profile", methods=["PATCH"])
@require_auth
def update_student_profile(student_id):
    """Allow a student to edit their own profile, emergency contact, and
    medical history.  Admins may edit any student."""

    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Invalid student ID", 400)

    # --- Ownership check ---
    # `g.user` is a dict {id, email}; the auth_guard resolvers expect an
    # object with .id/.email attributes (feedback.py pattern).
    auth_user = SimpleNamespace(
        id=g.user.get("id"),
        email=g.user.get("email"),
    )

    # Admin can edit any student — check first so the student-id
    # resolver's email-local-part fallback doesn't misclassify an admin
    # (e.g. "admin@gordoncollege.edu.ph" -> "ADMIN") as a foreign student.
    if _is_admin_user(auth_user):
        pass  # allowed
    else:
        caller_student_id = resolve_student_id(auth_user)
        if caller_student_id is not None:
            # Caller is a student — must be editing their own record.
            if normalize_student_id(caller_student_id) != sid:
                return _error("You can only edit your own profile", 403)
        else:
            # Neither admin nor a resolvable student — deny.
            return _error("Forbidden", 403)

    # --- Verify student exists ---
    existing = execute_with_retry(
        supabase.table("students")
        .select("student_id")
        .eq("student_id", sid)
        .maybe_single()
    )
    if not existing.data:
        return _error("Student not found", 404)

    body = request.get_json(silent=True) or {}

    # --- Update students table (partial) ---
    student_payload = {}
    for key in _STUDENT_EDITABLE_FIELDS:
        if key in body:
            value = body[key]
            if key in _DATE_FIELDS:
                value = _iso_or_none(value)
            student_payload[key] = value

    if student_payload:
        execute_with_retry(
            supabase.table("students")
            .update(student_payload)
            .eq("student_id", sid)
        )

    # --- Upsert emergency_contact ---
    ec_body = body.get("emergency_contact")
    if ec_body and isinstance(ec_body, dict):
        ec_payload = {}
        for key in ("contact_name", "relationship", "phone_number", "present_address"):
            if key in ec_body:
                ec_payload[key] = ec_body[key]
        if ec_payload:
            _upsert_by_student_id("emergency_contacts", sid, ec_payload)

    # --- Upsert medical_history ---
    mh_body = body.get("medical_history")
    if mh_body and isinstance(mh_body, dict):
        mh_payload = {}
        for key in _MEDICAL_HISTORY_BOOL_FIELDS:
            if key in mh_body:
                mh_payload[key] = bool(mh_body[key])
        for key in _MEDICAL_HISTORY_OTHER_FIELDS:
            if key in mh_body:
                value = mh_body[key]
                if key == "operation_date":
                    value = _iso_or_none(value)
                elif key == "has_operation_history":
                    value = bool(value)
                mh_payload[key] = value
        if mh_payload:
            _upsert_by_student_id("medical_histories", sid, mh_payload)

    # --- Build response: updated profile + related data ---
    profile = execute_with_retry(
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", sid)
        .maybe_single()
    )
    emergency_contact = execute_with_retry(
        supabase.table("emergency_contacts")
        .select("*")
        .eq("student_id", sid)
        .limit(1)
    )
    medical_history = execute_with_retry(
        supabase.table("medical_histories")
        .select("*")
        .eq("student_id", sid)
        .limit(1)
    )

    return jsonify({
        "success": True,
        "data": {
            "profile": profile.data,
            "emergency_contact": emergency_contact.data[0] if emergency_contact.data else None,
            "medical_history": medical_history.data[0] if medical_history.data else None,
        },
    })
