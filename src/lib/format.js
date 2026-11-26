// src/lib/format.js
// Shared display-name, BMI, date, and age helpers used by multiple admin panels.

/** Normalize a middle name/initial for display without stacking periods. */
export function formatMiddleInitial(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const base = raw.replace(/\.+$/, "").trim();
  return base ? `${base}.` : "";
}

const ADMIN_MIDDLE_INITIAL_RE = /^[A-Za-z]\.*$/;

/** Admin middle initial is one letter with any number of trailing periods. */
export function isValidAdminMiddleInitial(value = "") {
  const raw = String(value ?? "").trim();
  return raw === "" || ADMIN_MIDDLE_INITIAL_RE.test(raw);
}

/** "b", "B.", "B......" -> "B." for admin signup and admin name display. */
export function formatAdminMiddleInitial(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const base = raw.replace(/\.+$/, "").trim();
  return base ? `${base[0].toUpperCase()}.` : "";
}

/** "Doe, Juan B." -> "Juan B. Doe" (also repairs legacy dotted values). */
export function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  const display = rest ? `${rest} ${last}` : name;
  return display.replace(/\.{2,}/g, ".");
}

/** "Juan", "B......", "Doe" -> "Juan B. Doe" for the profile header. */
export function formatStudentNaturalName(firstName, middleInitial, lastName) {
  return [firstName, formatMiddleInitial(middleInitial), lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Admin formal name: "Ramos, Joseph Daniel, B., Jr.". */
export function formatAdminFormalName({
  first_name = "",
  middle_initial = "",
  last_name = "",
  suffix = "",
} = {}) {
  return [last_name, first_name, formatAdminMiddleInitial(middle_initial), suffix]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Walk-in patient name: "Ramos, Joseph D., Jr." (student_masterlist order). */
export function formatPatientFormalName({
  first_name = "",
  middle_initial = "",
  last_name = "",
  suffix = "",
} = {}) {
  const givenName = [first_name, formatAdminMiddleInitial(middle_initial)]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const core = [last_name, givenName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const suffixText = String(suffix ?? "").trim();
  return suffixText ? `${core}, ${suffixText}` : core;
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

/** "2004-02-05" or "02/05/2004" -> 22 (as of today) */
export function computeAge(birthday, today = new Date()) {
  const raw = String(birthday ?? "").trim();
  if (!raw) return null;

  let mm;
  let dd;
  let yyyy;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    [, yyyy, mm, dd] = iso.map(Number);
  } else {
    const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!mdy) return null;
    [, mm, dd, yyyy] = mdy.map(Number);
  }

  const birthDate = new Date(yyyy, mm - 1, dd);
  if (
    birthDate.getFullYear() !== yyyy ||
    birthDate.getMonth() !== mm - 1 ||
    birthDate.getDate() !== dd
  ) {
    return null;
  }

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
