"""
Student Record endpoints.

Backs the Student Record page: profile header, Year I-IV annual exam
history, per-year Physical Examination / Laboratory Results / Diagnosis
forms, plus the Medical Certificate and Medical Summary views.

Design notes:
- Year I-IV rows are NOT pre-seeded for every student. A row in
  `annual_examination` only exists once someone clicks "+ Add Annual
  Examination" for that year. Years with no row are reported as a virtual
  {"status": "no_record"} entry so the table still always shows 4 rows.
- physical_examination / laboratory_result / chest_xray / medical_certificate
  all hang off annual_exam_id (added in the fix_annual_exam_and_certificate_structure
  and fix_physical_exam_and_lab_result_fields migrations).
"""

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from supabase_client import supabase

router = APIRouter(prefix="/api/records", tags=["student-record"])

YEAR_LABELS = ["Year I", "Year II", "Year III", "Year IV"]


# ---------------------------------------------------------------------------
# Profile header + annual exam history
# ---------------------------------------------------------------------------

@router.get("/{student_id}")
def get_student_record_header(student_id: str):
    profile = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Student not found")

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

    return {"profile": profile.data, "annual_exam_history": history}


class CreateAnnualExam(BaseModel):
    school_year: str        # "2025-2026"
    year_label: Literal["Year I", "Year II", "Year III", "Year IV"]
    date_examined: Optional[date] = None
    examined_by: Optional[int] = None  # admin_id


@router.post("/{student_id}/annual-exams")
def add_annual_exam(student_id: str, body: CreateAnnualExam):
    existing = (
        supabase.table("annual_examination")
        .select("annual_exam_id")
        .eq("student_id", student_id)
        .eq("year_label", body.year_label)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail=f"{body.year_label} already exists for this student")

    response = (
        supabase.table("annual_examination")
        .insert({
            "student_id": student_id,
            "school_year": body.school_year,
            "year_label": body.year_label,
            "status": "pending",
            "date_examined": body.date_examined.isoformat() if body.date_examined else None,
            "examined_by": body.examined_by,
        })
        .execute()
    )
    return response.data[0]


# ---------------------------------------------------------------------------
# Physical Examination
# ---------------------------------------------------------------------------

class PhysicalFinding(BaseModel):
    result: Literal["normal", "with_findings"] = "normal"
    remarks: Optional[str] = None


class PhysicalExaminationIn(BaseModel):
    date_examined: Optional[date] = None
    blood_pressure: Optional[str] = None
    cardiac_rate: Optional[float] = None
    respiratory_rate: Optional[float] = None
    temperature: Optional[float] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    visual_acuity: Optional[str] = None
    skin: PhysicalFinding = PhysicalFinding()
    heent: PhysicalFinding = PhysicalFinding()
    heart: PhysicalFinding = PhysicalFinding()
    abdomen: PhysicalFinding = PhysicalFinding()
    extremities: PhysicalFinding = PhysicalFinding()
    other_findings_label: Optional[str] = None
    other_findings: PhysicalFinding = PhysicalFinding()
    examined_by: Optional[int] = None


def _compute_bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    if not weight_kg or not height_cm:
        return None
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


def _get_annual_exam_or_404(annual_exam_id: int):
    exam = (
        supabase.table("annual_examination")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if not exam.data:
        raise HTTPException(status_code=404, detail="Annual examination not found")
    return exam.data


@router.get("/annual-exams/{annual_exam_id}/physical-examination")
def get_physical_examination(annual_exam_id: int):
    _get_annual_exam_or_404(annual_exam_id)
    response = (
        supabase.table("physical_examination")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    return response.data  # null if not yet saved


@router.put("/annual-exams/{annual_exam_id}/physical-examination")
def save_physical_examination(annual_exam_id: int, body: PhysicalExaminationIn):
    exam = _get_annual_exam_or_404(annual_exam_id)

    row = {
        "student_id": exam["student_id"],
        "annual_exam_id": annual_exam_id,
        "school_year": exam["school_year"],
        "blood_pressure": body.blood_pressure,
        "cardiac_rate": body.cardiac_rate,
        "respiratory_rate": body.respiratory_rate,
        "temperature": body.temperature,
        "weight": body.weight,
        "height": body.height,
        "bmi": _compute_bmi(body.weight, body.height),
        "visual_acuity": body.visual_acuity,
        "skin_result": body.skin.result, "skin": body.skin.remarks,
        "heent_result": body.heent.result, "heent": body.heent.remarks,
        "heart_result": body.heart.result, "heart": body.heart.remarks,
        "abdomen_result": body.abdomen.result, "abdomen": body.abdomen.remarks,
        "extremities_result": body.extremities.result, "extremities": body.extremities.remarks,
        "other_findings_label": body.other_findings_label,
        "other_findings_result": body.other_findings.result, "other_findings": body.other_findings.remarks,
        "examined_by": body.examined_by,
        "examined_at": body.date_examined.isoformat() if body.date_examined else None,
    }

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

    return response.data[0]


# ---------------------------------------------------------------------------
# Laboratory Results
# ---------------------------------------------------------------------------

class LabResultsIn(BaseModel):
    # CBC
    cbc_date: Optional[date] = None
    hemoglobin: Optional[float] = None
    hematocrit: Optional[float] = None
    wbc: Optional[float] = None
    platelet_count: Optional[float] = None
    blood_type: Optional[str] = None
    # Urinalysis
    urinalysis_date: Optional[date] = None
    glucose: Optional[str] = None
    protein: Optional[str] = None
    # Chest X-Ray
    chest_xray_date: Optional[date] = None
    chest_xray_result: Optional[Literal["normal", "with_findings"]] = None
    chest_xray_notes: Optional[str] = None
    # Others
    other_examination_type: Optional[str] = None
    other_date: Optional[date] = None
    other_results: Optional[str] = None


def _get_physical_exam_or_404(annual_exam_id: int):
    exam = (
        supabase.table("physical_examination")
        .select("examination_id, student_id")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    if not exam.data:
        raise HTTPException(
            status_code=409,
            detail="Save the Physical Examination for this year before adding lab results.",
        )
    return exam.data


@router.get("/annual-exams/{annual_exam_id}/lab-results")
def get_lab_results(annual_exam_id: int):
    physical_exam = _get_physical_exam_or_404(annual_exam_id)
    lab = (
        supabase.table("laboratory_result")
        .select("*, chest_xray(*)")
        .eq("examination_id", physical_exam["examination_id"])
        .maybe_single()
        .execute()
    )
    return lab.data


@router.put("/annual-exams/{annual_exam_id}/lab-results")
def save_lab_results(annual_exam_id: int, body: LabResultsIn):
    physical_exam = _get_physical_exam_or_404(annual_exam_id)

    lab_row = {
        "student_id": physical_exam["student_id"],
        "examination_id": physical_exam["examination_id"],
        "cbc_date": body.cbc_date.isoformat() if body.cbc_date else None,
        "hemoglobin": body.hemoglobin,
        "hematocrit": body.hematocrit,
        "wbc": body.wbc,
        "platelet_count": body.platelet_count,
        "blood_type": body.blood_type,
        "urinalysis_date": body.urinalysis_date.isoformat() if body.urinalysis_date else None,
        "glucose": body.glucose,
        "protein": body.protein,
        "other_examination_type": body.other_examination_type,
        "other_date": body.other_date.isoformat() if body.other_date else None,
        "other_results": body.other_results,
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
    if body.chest_xray_date or body.chest_xray_result or body.chest_xray_notes:
        xray_row = {
            "lab_result_id": lab_result_id,
            "chest_xray_date": body.chest_xray_date.isoformat() if body.chest_xray_date else None,
            "chest_xray_result": body.chest_xray_result,
            "chest_xray_notes": body.chest_xray_notes,
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

class DiagnosisIn(BaseModel):
    diagnosis: Optional[str] = None
    final_remark: Optional[str] = None
    essentially_normal: bool = False
    purposes: list[str] = []
    examined_by: Optional[int] = None   # admin_id -> also gives license_no
    issued_on: Optional[date] = None


@router.get("/annual-exams/{annual_exam_id}/diagnosis")
def get_diagnosis(annual_exam_id: int):
    response = (
        supabase.table("medical_certificate")
        .select("*")
        .eq("annual_exam_id", annual_exam_id)
        .maybe_single()
        .execute()
    )
    return response.data


@router.put("/annual-exams/{annual_exam_id}/diagnosis")
def save_diagnosis(annual_exam_id: int, body: DiagnosisIn):
    exam = _get_annual_exam_or_404(annual_exam_id)

    row = {
        "annual_exam_id": annual_exam_id,
        "diagnosis": body.diagnosis,
        "final_remark": body.final_remark,
        "essentially_normal": body.essentially_normal,
        "purposes": body.purposes,
        "prepared_by": body.examined_by,
        "date_issued": (body.issued_on or date.today()).isoformat(),
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

    return response.data[0]


# ---------------------------------------------------------------------------
# Medical Certificate (printable view)
# ---------------------------------------------------------------------------

@router.get("/annual-exams/{annual_exam_id}/medical-certificate")
def get_medical_certificate(annual_exam_id: int):
    exam = _get_annual_exam_or_404(annual_exam_id)

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
        raise HTTPException(status_code=404, detail="No diagnosis saved for this year yet")

    return {"student": profile.data, "certificate": certificate.data}


# ---------------------------------------------------------------------------
# Medical Summary (all-years rollup)
# ---------------------------------------------------------------------------

@router.get("/{student_id}/medical-summary")
def get_medical_summary(student_id: str):
    profile = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Student not found")

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

    return {
        "profile": profile.data,
        "emergency_contact": emergency_contact.data,
        "medical_history": medical_history.data,
        "years": years,
    }
