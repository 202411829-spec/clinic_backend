// src/lib/studentAdapter.js
// Adapts raw backend payloads into the shape the admin record panels
// render (the same shape src/data/masterlistSample.js used as a placeholder).

import { yearIndexFromLabel } from "./yearLabel.js";

function joinName(profile = {}) {
  const middle = profile.middle_initial ? ` ${profile.middle_initial}.` : "";
  return `${profile.last_name ?? ""}, ${profile.first_name ?? ""}${middle}`.trim();
}

function formatDate(value) {
  if (!value) return "-";
  try {
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate()
    ).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return String(value);
  }
}

export function adaptStudentProfile(profile, medSummary) {
  if (!profile) return null;

  const ec = medSummary?.emergency_contact || {};
  const history = medSummary?.medical_history || {};

  const CONDITION_FIELDS = [
    "has_asthma", "has_chicken_pox", "has_diabetes", "has_dysmenorrhea",
    "has_epilepsy_seizure", "has_heart_disorder", "has_hepatitis",
    "has_hypertension", "has_measles", "has_mumps", "has_anxiety_disorder",
    "has_panic_attack", "has_pneumonia", "has_tb_primary_complex",
    "has_typhoid_fever", "has_covid19", "has_urinary_tract_infection",
  ];
  const conditions = CONDITION_FIELDS.filter((k) => history[k]);

  return {
    id: profile.student_id,
    studentNumber: profile.student_id,
    name: joinName(profile),
    dept: profile.department_name ?? "-",
    course: profile.course_name ?? "-",
    deptCourse: `${profile.course_name ?? "-"} / ${profile.department_name ?? "-"}`,
    yearLevel: profile.year_level ?? "-",
    sex: profile.gender ?? "-",
    birthday: formatDate(profile.birth_date),
    contactNumber: profile.contact_number ?? "-",
    civilStatus: profile.civil_status ?? "-",
    presentAddress: profile.present_address ?? "-",
    emergencyContact: {
      name: ec.contact_name ?? ec.name ?? "-",
      relationship: ec.relationship ?? "-",
      contactNumber: ec.contact_number ?? ec.phone ?? "-",
      presentAddress: ec.present_address ?? profile.present_address ?? "-",
    },
    medicalConditions: conditions,
    previousOperation: {
      date: formatDate(history.operation_date),
      procedure: history.operation_procedure ?? "-",
    },
  };
}

// Converts one backend `years[label]` row (from `GET .../medical-summary`)
// into the per-year shape the MedicalSummaryPanel renders. Falls back to the
// empty-record shape when the row (or one of its sub-records) is null/missing.
// The nested Supabase joins come back as EITHER a single object (one-to-one)
// OR a one-element array depending on the FK relationship, so every join is
// normalized through `firstOf()` to accept both shapes.
function firstOf(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function emptyPanelYear() {
  return {
    dateExamined: "",
    bp: "",
    cr: "",
    rr: "",
    temperature: "",
    weight: "",
    height: "",
    visualAcuity: "",
    findings: {
      skin: "Normal",
      heent: "Normal",
      heart: "Normal",
      abdomen: "Normal",
      extremities: "Normal",
      others: "Normal",
    },
    findingsRemarks: {
      skin: "",
      heent: "",
      heart: "",
      abdomen: "",
      extremities: "",
      others: "",
    },
    othersSpecify: "",
    extraOthersFindings: [],
    generalRemarks: "",
    finalAssessment: "",
    physicalExaminedBy: "",
    physicalLicenseNo: "",
    chestXray: { date: "", result: "Normal", remarks: "" },
    cbc: { date: "", hemoglobin: "", hematocrit: "", wbc: "", plateletCount: "", bloodType: "" },
    urinalysis: { date: "", glucose: "", protein: "" },
    otherLabType: "",
    otherLabDetails: {},
    extraLabOthers: [],
    diagnosis: "",
    finalRemark: "",
    diagnosisExaminedBy: "",
    diagnosisLicenseNo: "",
    diagnosisNormalFindingsChecked: false,
    normalFindingsChecked: false,
  };
}

export function adaptMedicalSummaryYear(row) {
  const out = emptyPanelYear();
  if (!row) return out;

  out.dateExamined = row.date_examined || row.date_examined_at || "";

  // Labs are nested inside physical_examinations in this schema.
  const phys = firstOf(row.physical_examinations);
  if (phys) {
    out.bp = phys.blood_pressure || "";
    out.cr = phys.cardiac_rate || "";
    out.rr = phys.respiratory_rate || "";
    out.temperature = phys.temperature || "";
    out.weight = phys.weight_kg || "";
    out.height = phys.height_cm || "";
    out.visualAcuity = phys.visual_acuity || "";
    out.findings = {
      skin: phys.skin_result || "Normal",
      heent: phys.heent_result || "Normal",
      heart: phys.heart_result || "Normal",
      abdomen: phys.abdomen_result || "Normal",
      extremities: phys.extremities_result || "Normal",
      others: phys.other_findings_result || "Normal",
    };
    out.findingsRemarks = {
      skin: phys.skin_remarks || "",
      heent: phys.heent_remarks || "",
      heart: phys.heart_remarks || "",
      abdomen: phys.abdomen_remarks || "",
      extremities: phys.extremities_remarks || "",
      others: phys.other_findings_remarks || "",
    };
    out.generalRemarks = phys.general_remarks || "";
    out.finalAssessment = phys.final_assessment || "";
    out.physicalExaminedBy = phys.examined_by_admin_id || "";

    const lab = firstOf(phys.laboratory_results);
    if (lab) {
      const xray = firstOf(lab.chest_xrays) || {};
      out.chestXray = {
        date: xray.date || xray.date_taken || "",
        result: xray.result || "Normal",
        remarks: xray.remarks || "",
      };
      out.cbc = {
        date: lab.cbc_date || "",
        hemoglobin: lab.hemoglobin || "",
        hematocrit: lab.hematocrit || "",
        wbc: lab.wbc || "",
        plateletCount: lab.platelet_count || "",
        bloodType: lab.blood_type || "",
      };
      out.urinalysis = {
        date: lab.urinalysis_date || "",
        glucose: lab.glucose || "",
        protein: lab.protein || "",
      };
    }
  }

  const cert = firstOf(row.medical_certificates);
  if (cert) {
    out.diagnosis = cert.diagnosis || "";
    out.finalRemark = cert.final_remark || "";
    out.diagnosisExaminedBy = cert.prepared_by_admin_id || "";
    out.diagnosisLicenseNo = "";
    const essentiallyNormal = Boolean(cert.is_essentially_normal);
    out.diagnosisNormalFindingsChecked = essentiallyNormal;
    out.normalFindingsChecked = essentiallyNormal;
  }

  return out;
}

// Picks the most recent annual exam id that actually exists, so
// certificate/diagnosis views have something concrete to load.
export function latestAnnualExamId(medSummaryOrHeader) {
  const years =
    medSummaryOrHeader?.years ??
    Object.fromEntries(
      (medSummaryOrHeader?.annual_exam_history || []).map((row) => [row.year_label, row])
    ) ??
    {};
  // Iterate ALL labels (not just the fixed Year I-IV) so a Year V+ exam id
  // is found too. Prefer the highest year index, matching the original
  // "Year IV > III > II > I" ordering.
  const available = [];
  for (const label of Object.keys(years)) {
    if (years[label]?.annual_exam_id) available.push(years[label]);
  }
  available.sort((a, b) => yearIndexFromLabel(a.year_label) - yearIndexFromLabel(b.year_label));
  const latest = available[available.length - 1];
  return latest?.annual_exam_id ?? null;
}