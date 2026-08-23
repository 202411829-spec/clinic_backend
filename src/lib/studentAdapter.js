// src/lib/studentAdapter.js
// Adapts raw backend payloads into the shape the admin record panels
// render (the same shape src/data/masterlistSample.js used as a placeholder).

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

  const conditions = Array.isArray(history.conditions)
    ? history.conditions
    : history.conditions
    ? [String(history.conditions)]
    : [];

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
      presentAddress: ec.address ?? profile.present_address ?? "-",
    },
    medicalConditions: conditions,
    previousOperation: {
      date: formatDate(history.operation_date),
      procedure: history.procedure ?? "-",
    },
  };
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
  for (const label of ["Year IV", "Year III", "Year II", "Year I"]) {
    const row = years[label];
    if (row?.annual_exam_id) return row.annual_exam_id;
  }
  return null;
}