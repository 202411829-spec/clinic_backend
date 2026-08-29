// src/lib/format.js
// Shared display-name, BMI, date, and age helpers used by multiple admin panels.

/** "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos" */
export function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  if (!rest) return name;
  return `${rest} ${last}`;
}

/** Compute BMI from weight (kg) and height (cm), rounded to 1 decimal. */
export function computeBmi(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm);
  if (!w || !h) return null;
  const meters = h / 100;
  return (w / (meters * meters)).toFixed(1);
}

/** "2026-08-06" -> "August 6, 2026" */
export function formatLongDateISO(isoDate) {
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
      dateExamined: hasRecord ? formatLongDateISO(rec.dateExamined) : "-",
      examinedBy: hasRecord ? examinerLabel : "-",
      status: hasRecord ? "Cleared" : "No Record",
    };
  });
}
