// src/data/studentRecordSample.js
// Placeholder data for the Student Record page (/admin/masterlist/:studentId).
// One student's full annual examination history + per-year clinical record.
// Swap `getStudentAnnualHistory` for a real Supabase query when ready — the
// panel only cares about this shape, so wiring real data is a drop-in swap.

export const academicYears = [
  { key: "y1", label: "Year I (2025 - 2026)" },
  { key: "y2", label: "Year II (2026 - 2027)" },
  { key: "y3", label: "Year III (2027 - 2028)" },
  { key: "y4", label: "Year IV (2028 - 2029)" },
];

export const resultOptions = ["Normal", "With Findings"];
export const glucoseOptions = ["Negative", "Trace", "1+", "2+", "3+", "4+"];
export const proteinOptions = ["Negative", "Trace", "1+", "2+", "3+", "4+"];
export const bloodTypeOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const labExamTypeOptions = [
  "Hepatitis B Screening",
  "Pregnancy Test",
  "Drug Test",
  "Others",
];

function emptyYearRecord() {
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
    generalRemarks: "",
    finalAssessment: "",
    physicalExaminedBy: "",
    physicalLicenseNo: "",
    chestXray: { date: "", result: "Normal", remarks: "" },
    cbc: { date: "", hemoglobin: "", hematocrit: "", wbc: "", plateletCount: "", bloodType: "" },
    urinalysis: { date: "", glucose: "", protein: "" },
    otherLabType: "",
    diagnosis: "",
    finalRemark: "",
    diagnosisExaminedBy: "",
    diagnosisLicenseNo: "",
    normalFindingsChecked: false,
  };
}

// Matches the mockup: Year I already has a cleared record on file, the
// other three years are still blank ("No Record") until a nurse fills them in.
export function getStudentAnnualHistory() {
  const y1 = emptyYearRecord();
  y1.dateExamined = "2026-08-06";
  y1.findings = {
    skin: "Normal",
    heent: "With Findings",
    heart: "Normal",
    abdomen: "Normal",
    extremities: "Normal",
    others: "Normal",
  };
  y1.chestXray = { date: "2026-08-06", result: "With Findings", remarks: "" };

  return {
    y1,
    y2: emptyYearRecord(),
    y3: emptyYearRecord(),
    y4: emptyYearRecord(),
  };
}

/** Rows for the Annual Examination History table at the top of the page. */
export function getHistorySummary(records, examinerLabel) {
  return academicYears.map((y) => {
    const rec = records[y.key];
    const hasRecord = Boolean(rec.dateExamined);
    return {
      ...y,
      dateExamined: hasRecord ? formatLongDate(rec.dateExamined) : "-",
      examinedBy: hasRecord ? examinerLabel : "-",
      status: hasRecord ? "Cleared" : "No Record",
    };
  });
}

/** "2026-08-06" -> "August 6, 2026" */
export function formatLongDate(isoDate) {
  if (!isoDate) return "-";
  const [yyyy, mm, dd] = isoDate.split("-").map(Number);
  if (!yyyy || !mm || !dd) return isoDate;
  const date = new Date(yyyy, mm - 1, dd);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "02/05/2004" -> 22 (as of today) */
export function computeAge(mdyString) {
  const [mm, dd, yyyy] = (mdyString || "").split("/").map(Number);
  if (!mm || !dd || !yyyy) return null;
  const today = new Date();
  let age = today.getFullYear() - yyyy;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > mm || (today.getMonth() + 1 === mm && today.getDate() >= dd);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}
