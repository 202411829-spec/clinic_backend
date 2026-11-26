"""Student Record endpoints.

Backs the Student Record page: profile header, Year I-IV annual exam
history, per-year Physical Examination / Laboratory Results / Diagnosis
forms, plus the Medical Certificate and Medical Summary views.

Converted from FastAPI to a Flask blueprint.
"""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from flask import Blueprint, g, jsonify, request
from datetime import date, datetime, timezone

from database import supabase
from routers.auth_guard import require_auth, require_admin, resolve_student_id, is_admin_user
from routers.helpers import execute_with_retry, normalize_student_id

logger = logging.getLogger(__name__)


student_record_bp = Blueprint("student-record", __name__, url_prefix="/api/records")

YEAR_LABELS = ["Year I", "Year II", "Year III", "Year IV"]
EXAM_STATUSES = {"no_record", "pending", "cleared"}

# Accepts any well-formed year label: "Year V", "Year VI", ... (Roman numerals)
# or ordinal "Year 5", "Year 6", ... — rejecting free-form garbage.
_YEAR_LABEL_RE = re.compile(r"^Year\s+(?:[IVXLCDM]+|[0-9]+)$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(message, status):
    return jsonify({"success": False, "error": message}), status


def _ensure_db_ok(response, message):
    error = getattr(response, "error", None)
    if error:
        logger.error("%s: %s", message, getattr(error, "message", error))
        raise RuntimeError(message)


def _record_data_privacy_consent(student_id):
    message = "Failed to save data privacy consent"
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        response = execute_with_retry(
            supabase.table("students")
            .update({"data_privacy_consented_at": timestamp})
            .eq("student_id", student_id)
            .is_("data_privacy_consented_at", None)
        )
    except Exception as exc:
        logger.error("%s: %s", message, exc)
        raise RuntimeError(message) from exc
    _ensure_db_ok(response, message)


def _parse_admin_id(value):
    """Parse an admin id from request JSON; None for empty/invalid input."""
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


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


def _clean_name_value(value):
    """Optional name parts are stored as trimmed text or NULL."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_address_value(value):
    """Optional address parts are stored as trimmed text or NULL."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


# Kept in sync with DEFAULT_YEAR_SCHOOL_YEAR in StudentRecordPanel.jsx. The
# header endpoint used to return placeholder rows with school_year=null, which
# the form forwarded straight into this NOT NULL column.
DEFAULT_YEAR_LABEL_SCHOOL_YEAR = {
    "Year I": "2025-2026",
    "Year II": "2026-2027",
    "Year III": "2027-2028",
    "Year IV": "2028-2029",
}


def _school_year_for_year_label(year_label):
    """Resolve the academic year shown by the form for a Year I-IV label."""
    text = str(year_label or "").strip()
    if text in DEFAULT_YEAR_LABEL_SCHOOL_YEAR:
        return DEFAULT_YEAR_LABEL_SCHOOL_YEAR[text]
    match = re.match(r"^(Year\s+(?:[IVXLCDM]+|\d+))", text, re.IGNORECASE)
    if match:
        for label, school_year in DEFAULT_YEAR_LABEL_SCHOOL_YEAR.items():
            if label.lower() == match.group(1).lower():
                return school_year
    return None


def _medical_metadata(row):
    """Read free-text signer metadata kept in medical_certificates.remarks."""
    raw = (row or {}).get("remarks")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _merge_medical_metadata(existing_remarks, updates):
    """Merge signer metadata without dropping pre-existing free-text remarks."""
    merged = _medical_metadata({"remarks": existing_remarks})
    for key, value in updates.items():
        if value not in (None, ""):
            merged[key] = value
    if not merged:
        return existing_remarks
    return json.dumps(merged, ensure_ascii=False)


def _compose_contact_name(emergency):
    """Build the legacy contact_name from structured fields, if submitted."""
    first = _clean_name_value(emergency.get("first_name"))
    middle = _clean_name_value(emergency.get("middle_initial"))
    last = _clean_name_value(emergency.get("last_name"))
    suffix = _clean_name_value(emergency.get("suffix"))
    middle_part = middle if middle and middle.endswith(".") else (f"{middle}." if middle else None)
    given = " ".join(part for part in (first, middle_part) if part)
    base = ", ".join(part for part in (last, given) if part)
    return f"{base} {suffix}" if base and suffix else (base or "")


# ---------------------------------------------------------------------------
# Profile header + annual exam history
# ---------------------------------------------------------------------------

@student_record_bp.route("/<path:student_id>", methods=["GET"])
@require_auth
def get_student_record_header(student_id):
    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Student not found", 404)

    with ThreadPoolExecutor(max_workers=2) as executor:
        profile_fut = executor.submit(
            execute_with_retry,
            supabase.table("student_masterlist")
            .select("*")
            .eq("student_id", sid)
            .maybe_single(),
        )
        exams_fut = executor.submit(
            execute_with_retry,
            supabase.table("annual_examinations")
            .select("*")
            .eq("student_id", sid),
        )

        profile = profile_fut.result()
        if not profile.data:
            exams_fut.result()
            return _error("Student not found", 404)

        exams_resp = exams_fut.result()

    by_year = {row["year_label"]: row for row in exams_resp.data}

    history = []
    seen = set()
    for label in YEAR_LABELS:
        if label in by_year:
            history.append(by_year[label])
            seen.add(label)
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
            seen.add(label)

    # Any year labels beyond the fixed Year I-IV set (e.g. Year V+) are
    # appended so they survive a page reload.
    for label in sorted(k for k in by_year if k not in seen):
        history.append(by_year[label])

    return jsonify({"profile": profile.data, "annual_exam_history": history})


@student_record_bp.route("/<path:student_id>/annual-exams", methods=["POST"])
@require_admin
def add_annual_exam(student_id):
    sid = normalize_student_id(student_id)
    if not sid:
        return _error("Student not found", 404)

    body = request.get_json(silent=True) or {}

    year_label = body.get("year_label")
    if not year_label or not isinstance(year_label, str) or len(year_label) > 32 or not _YEAR_LABEL_RE.match(year_label.strip()):
        return _error("year_label must be a valid year label like 'Year V' or 'Year 5'", 400)
    year_label = year_label.strip()
    school_year = _clean_name_value(body.get("school_year")) or _school_year_for_year_label(year_label)
    if not school_year:
        return _error("school_year is required for this annual examination", 400)

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
            "school_year": school_year,
            "year_label": year_label,
            "exam_status": "pending",
            "date_examined": _iso_or_none(body.get("date_examined")),
            "examined_by_admin_id": _parse_admin_id(body.get("examined_by")),
        })
    )
    _ensure_db_ok(response, "Failed to create the annual examination")
    if not response.data:
        return _error("Supabase did not return the created annual examination", 500)
    return jsonify(response.data[0])


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/status", methods=["PATCH"])
@require_admin
def update_annual_exam_status(annual_exam_id):
    """Update only this annual examination's clearance status."""
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}
    status = body.get("exam_status", body.get("status"))
    if status not in EXAM_STATUSES:
        return _error("exam_status must be one of: no_record, pending, cleared", 400)

    response = execute_with_retry(
        supabase.table("annual_examinations")
        .update({"exam_status": status})
        .eq("annual_exam_id", annual_exam_id)
    )
    _ensure_db_ok(response, "Failed to update the annual examination status")
    if not response.data:
        return _error("Supabase did not return the updated annual examination", 500)
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
    annual = execute_with_retry(
        supabase.table("annual_examinations")
        .select("date_examined")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    result = dict(response.data)
    result["date_examined"] = (annual.data or {}).get("date_examined")
    return jsonify(result)


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

    examined_by_id = _parse_admin_id(body.get("examined_by"))
    examined_at = _iso_or_none(body.get("date_examined"))
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
        "other_findings_label": body.get("other_findings_label"),
        "general_remarks": body.get("general_remarks"),
        "final_assessment": body.get("final_assessment"),
    }
    # examined_at is NOT NULL DEFAULT now() in the DDL. An empty form date
    # means "use the default", not "write NULL" — otherwise the INSERT/UPDATE
    # violates the constraint and blocks the whole certificate save chain.
    if examined_at is not None:
        row["examined_at"] = examined_at

    for key in FINDING_FIELDS:
        row[f"{key}_result"] = finding_result(key)
        row[f"{key}_remarks"] = finding_remarks(key)

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

    _ensure_db_ok(response, "Failed to save the Physical Examination")
    if not response.data:
        return _error("Supabase did not return the saved Physical Examination", 500)

    # The examination date belongs to the annual exam row. Saving it here keeps
    # edits made after the row was first created from silently reverting.
    annual_updates = {}
    if "date_examined" in body:
        annual_updates["date_examined"] = _iso_or_none(body.get("date_examined"))
    # First saved physical exam moves the annual exam out of "no_record".
    if exam["exam_status"] == "no_record":
        annual_updates["exam_status"] = "pending"
    if annual_updates:
        annual_response = execute_with_retry(
            supabase.table("annual_examinations")
            .update(annual_updates)
            .eq("annual_exam_id", annual_exam_id)
        )
        _ensure_db_ok(annual_response, "Failed to update the annual examination")

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
        lab_response = execute_with_retry(
            supabase.table("laboratory_results")
            .update(lab_row)
            .eq("lab_result_id", lab_result_id)
        )
        _ensure_db_ok(lab_response, "Failed to save the Laboratory Results")
    else:
        inserted = execute_with_retry(
            supabase.table("laboratory_results").insert(lab_row)
        )
        _ensure_db_ok(inserted, "Failed to save the Laboratory Results")
        if not inserted.data:
            return _error("Supabase did not return the saved Laboratory Results", 500)
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
            xray_response = execute_with_retry(
                supabase.table("chest_xrays").update(xray_row).eq(
                    "chest_xray_id", existing_xray.data["chest_xray_id"]
                )
            )
        else:
            xray_response = execute_with_retry(
                supabase.table("chest_xrays").insert(xray_row)
            )
        _ensure_db_ok(xray_response, "Failed to save the Chest X-ray result")

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
    result = dict(response.data)
    metadata = _medical_metadata(result)
    admin = result.get("admin_accounts") or {}
    if isinstance(admin, list):
        admin = admin[0] if admin else {}
    result["examined_by"] = metadata.get("examined_by") or _examiner_display_name(admin)
    result["license_no"] = metadata.get("license_no") or admin.get("license_no")
    return jsonify(result)


def _examiner_display_name(admin):
    """Build a display name from the linked admin row, if one exists."""
    parts = [admin.get("first_name"), admin.get("middle_initial"), admin.get("last_name"), admin.get("suffix")]
    return " ".join(str(part).strip() for part in parts if part) or None


@student_record_bp.route("/annual-exams/<int:annual_exam_id>/diagnosis", methods=["PUT"])
@require_admin
def save_diagnosis(annual_exam_id):
    _, error = _get_annual_exam_or_404(annual_exam_id)
    if error:
        return error

    body = request.get_json(silent=True) or {}

    prepared_by_admin_id = _parse_admin_id(body.get("examined_by"))
    examined_by = _clean_name_value(body.get("examined_by"))
    license_no = _clean_name_value(body.get("license_no"))
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
        .select("certificate_id, remarks")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
    )
    existing_row = existing.data or {}
    metadata_updates = {}
    if examined_by and prepared_by_admin_id is None:
        metadata_updates["examined_by"] = examined_by
    if license_no:
        metadata_updates["license_no"] = license_no
    if metadata_updates:
        row["remarks"] = _merge_medical_metadata(
            existing_row.get("remarks"), metadata_updates
        )

    if existing_row:
        response = execute_with_retry(
            supabase.table("medical_certificates")
            .update(row)
            .eq("certificate_id", existing_row["certificate_id"])
        )
    else:
        response = execute_with_retry(
            supabase.table("medical_certificates").insert(row)
        )
    _ensure_db_ok(response, "Failed to save the Diagnosis and Final Remark")
    if not response.data:
        return _error("Supabase did not return the saved Diagnosis", 500)

    execute_with_retry(
        supabase.table("annual_examinations")
        .update({"exam_status": "cleared"})
        .eq("annual_exam_id", annual_exam_id)
    )

    saved = response.data[0]
    metadata = _medical_metadata(saved)
    saved["examined_by"] = metadata.get("examined_by") or examined_by
    saved["license_no"] = metadata.get("license_no") or license_no
    return jsonify(saved)


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

    with ThreadPoolExecutor(max_workers=4) as executor:
        profile_fut = executor.submit(
            execute_with_retry,
            supabase.table("student_masterlist")
            .select("*")
            .eq("student_id", sid)
            .maybe_single(),
        )
        emergency_fut = executor.submit(
            execute_with_retry,
            supabase.table("emergency_contacts")
            .select("*")
            .eq("student_id", sid)
            .limit(1),
        )
        history_fut = executor.submit(
            execute_with_retry,
            supabase.table("medical_histories")
            .select("*")
            .eq("student_id", sid)
            .limit(1),
        )
        exams_fut = executor.submit(
            execute_with_retry,
            supabase.table("annual_examinations")
            .select("*, physical_examinations(*, laboratory_results(*, chest_xrays(*))), medical_certificates(*)")
            .eq("student_id", sid),
        )

        profile = profile_fut.result()
        if not profile.data:
            # Surface any failure from the sibling queries before returning.
            for fut in (emergency_fut, history_fut, exams_fut):
                fut.result()
            return _error("Student not found", 404)

        emergency_contact = emergency_fut.result()
        medical_history = history_fut.result()
        exams = exams_fut.result()

    by_year = {row["year_label"]: row for row in exams.data}

    return jsonify({
        "profile": profile.data,
        "emergency_contact": emergency_contact.data[0] if emergency_contact.data else None,
        "medical_history": medical_history.data[0] if medical_history.data else None,
        "years": by_year,
    })


# ---------------------------------------------------------------------------
# Student self-edit profile (PATCH)
# ---------------------------------------------------------------------------

# Allowed student-editable fields on the `students` table.
_STUDENT_EDITABLE_FIELDS = {
    "first_name", "middle_initial", "last_name", "suffix", "gender",
    "birth_date", "civil_status", "contact_number",
    "present_address", "photo",
    "department_id", "course_id",
    "address_region_code", "address_province_code", "address_city_code",
    "address_barangay_code", "address_street", "address_house_number",
}

_EMERGENCY_NAME_FIELDS = ("first_name", "middle_initial", "last_name", "suffix")
_EMERGENCY_BOOLEAN_FIELDS = ("same_as_student_address",)

_ADDRESS_CODE_FIELDS = (
    "address_region_code", "address_province_code", "address_city_code",
    "address_barangay_code",
)
_ADDRESS_TEXT_FIELDS = ("address_street", "address_house_number")
_ADDRESS_FIELD_LIMITS = {key: 32 for key in _ADDRESS_CODE_FIELDS}
_ADDRESS_FIELD_LIMITS.update({key: 200 for key in _ADDRESS_TEXT_FIELDS})

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
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return _error("Invalid request body", 400)

    # Structured address details are optional, but when submitted they must be
    # short strings. Legacy present_address is never parsed or rewritten here.
    for key, max_length in _ADDRESS_FIELD_LIMITS.items():
        if key not in body or body[key] is None:
            continue
        value = body[key]
        if not isinstance(value, str) or len(value.strip()) > max_length:
            return _error(f"Invalid address field: {key}", 400)

    emergency_body = body.get("emergency_contact")
    if isinstance(emergency_body, dict) and emergency_body.get("structured_address_edited") is True:
        for key, max_length in _ADDRESS_FIELD_LIMITS.items():
            if key not in emergency_body or emergency_body[key] is None:
                continue
            value = emergency_body[key]
            if not isinstance(value, str) or len(value.strip()) > max_length:
                return _error(f"Invalid emergency address field: {key}", 400)

    consent_requested = body.get("data_privacy_consent") is True
    caller_student_id = resolve_student_id(auth_user)
    is_owner = (
        caller_student_id is not None
        and normalize_student_id(caller_student_id) == sid
    )
    is_admin = is_admin_user(auth_user)

    # Admins keep the existing bypass for ordinary fields. Consent never
    # uses that bypass: only the owner student may record their own consent.
    if not is_admin and not is_owner:
        return _error("You can only edit your own profile", 403)
    if consent_requested and not is_owner:
        return _error("You can only submit your own data privacy consent", 403)

    # --- Verify student exists ---
    existing = execute_with_retry(
        supabase.table("students")
        .select("student_id")
        .eq("student_id", sid)
        .maybe_single()
    )
    if not existing.data:
        return _error("Student not found", 404)

    # --- Update students table (partial) ---
    student_payload = {}
    for key in _STUDENT_EDITABLE_FIELDS:
        if key in body:
            value = body[key]
            if key in _DATE_FIELDS:
                value = _iso_or_none(value)
            elif key == "suffix":
                value = _clean_name_value(value)
            elif key in _ADDRESS_FIELD_LIMITS:
                value = _clean_address_value(value)
            student_payload[key] = value

    try:
        if student_payload:
            _ensure_db_ok(
                execute_with_retry(
                    supabase.table("students")
                    .update(student_payload)
                    .eq("student_id", sid)
                ),
                "Failed to update profile",
            )

        # --- Upsert emergency_contact ---
        ec_body = body.get("emergency_contact")
        if ec_body and isinstance(ec_body, dict):
            ec_payload = {}
            for key in ("contact_name", "relationship", "phone_number", "present_address"):
                if key in ec_body:
                    ec_payload[key] = ec_body[key]

            for key in _EMERGENCY_BOOLEAN_FIELDS:
                if key in ec_body:
                    value = ec_body[key]
                    if not isinstance(value, bool):
                        return _error(f"Invalid emergency contact field: {key}", 400)
                    ec_payload[key] = value

            # Structured names are optional as a group. When any part is sent,
            # first/last become required and the legacy contact_name is composed
            # from them; otherwise an existing contact_name is left untouched.
            structured_name = any(key in ec_body for key in _EMERGENCY_NAME_FIELDS)
            if structured_name:
                if not _clean_name_value(ec_body.get("first_name")) or not _clean_name_value(
                    ec_body.get("last_name")
                ):
                    return _error(
                        "Emergency contact first name and last name are required", 400
                    )
                for key in _EMERGENCY_NAME_FIELDS:
                    ec_payload[key] = _clean_name_value(ec_body.get(key))
                ec_payload["contact_name"] = _compose_contact_name(ec_body)

            # Structured emergency address is written only when the form
            # touched that block. Legacy-only saves keep the stored columns.
            if ec_body.get("structured_address_edited") is True:
                for key in _ADDRESS_FIELD_LIMITS:
                    if key in ec_body:
                        ec_payload[key] = _clean_address_value(ec_body[key])

            if ec_payload:
                _ensure_db_ok(
                    _upsert_by_student_id("emergency_contacts", sid, ec_payload),
                    "Failed to save emergency contact",
                )

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
                _ensure_db_ok(
                    _upsert_by_student_id("medical_histories", sid, mh_payload),
                    "Failed to save medical history",
                )

        # Consent is last. The conditional .is_(..., None) update preserves
        # the first successful timestamp even under concurrent submissions.
        if consent_requested:
            _record_data_privacy_consent(sid)
    except RuntimeError as exc:
        return _error(str(exc), 500)
    except Exception:
        logger.exception("Unhandled error while saving student profile")
        return _error("Failed to save profile", 500)

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
