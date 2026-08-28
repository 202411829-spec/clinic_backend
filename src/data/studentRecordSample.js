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
  "Fecalysis",
  "Drug Testing",
  "HBSAG",
  "Anti HAV Igm",
  "Anti HBS",
];

// Negative / Positive dropdown shared by the qualitative "Others" lab tests
// (drug screening panels, hepatitis screening, etc).
export const labResultOptions = ["Negative", "Positive"];

export const fecalysisColorOptions = ["Yellow", "Brown", "Green", "Black", "Red", "Clay/White"];
export const fecalysisConsistencyOptions = ["Formed", "Semi-formed", "Soft", "Loose", "Watery"];

// Drives the extra fields that appear under each "Others" Examination Type
// row on the Laboratory Results section — add a new Examination Type here
// and its fields will automatically show up wherever that dropdown is used.
export const labOtherFieldsConfig = {
  Fecalysis: [
    { key: "color", label: "Color", type: "select", options: fecalysisColorOptions },
    { key: "consistency", label: "Consistency", type: "select", options: fecalysisConsistencyOptions },
    { key: "pusCells", label: "Pus Cells", type: "text" },
    { key: "rbc", label: "Rbc", type: "text" },
    { key: "parasitesOva", label: "Parasites Ova", type: "text" },
  ],
  "Drug Testing": [
    { key: "methamphetamine", label: "Methamphetamine", type: "select", options: labResultOptions },
    { key: "tetrahydrocannabinol", label: "Tetrahydrocannabinol", type: "select", options: labResultOptions },
  ],
  HBSAG: [{ key: "result", label: "Result", type: "select", options: labResultOptions }],
  "Anti HAV Igm": [{ key: "result", label: "Result", type: "select", options: labResultOptions }],
  "Anti HBS": [
    { key: "result", label: "Result", type: "select", options: labResultOptions },
    { key: "value", label: "Value", type: "text" },
  ],
};

export function createEmptyYearRecord() {
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

function emptyYearRecord() {
  return createEmptyYearRecord();
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
  const keys = Object.keys(records || {});
  return keys.map((key) => {
    const rec = records[key];
    const hasRecord = Boolean(rec.dateExamined);
    return {
      key,
      label: key,
      schoolYear: rec.schoolYear,
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
