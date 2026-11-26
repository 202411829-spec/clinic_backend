// Academic-period helpers for the Reports "Academic Timeline" mode.
// Academic years accept any non-negative start year; SCHOOL_YEAR_OPTIONS are
// kept for reference-data compatibility but no longer constrain the picker.
// Semester is an independent display/filter dimension. Months are selected as
// one continuous range of calendar months and converted to inclusive dates.

import { academicYears } from "./referenceData.js";
import {
  daysInMonth,
  makeYMD,
  MONTH_LABELS_LONG,
  MONTH_LABELS_SHORT,
  parseNonNegativeYear,
} from "./reportPeriodSelection.js";
import { addMonths, parseISODate } from "./dateRangeCalendar.js";

export const TIME_CATEGORIES = ["Regular Time", "School-Based Time"];
export const ACADEMIC_TIMELINE_LABEL = "Academic Timeline";
export const TIME_CATEGORY_LABELS = {
  "Regular Time": "Regular Time",
  "School-Based Time": ACADEMIC_TIMELINE_LABEL,
};
export const TIME_CATEGORY_OPTIONS = TIME_CATEGORIES.map((value) => ({
  value,
  label: TIME_CATEGORY_LABELS[value] ?? value,
}));
export const ALL_MONTHS = Array.from({ length: 12 }, (_, month) => month);
export const SEMESTER_OPTIONS = ["1st", "2nd", "Midyear"];
export const SEMESTER_DISPLAY_LABELS = {
  "1st": "1st Sem",
  "2nd": "2nd Sem",
  Midyear: "Midyear",
};

export const SCHOOL_YEAR_OPTIONS = academicYears
  .map(({ label }) => {
    const match = String(label).match(/(\d{4})\s*-\s*(\d{4})/);
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    return endYear === startYear + 1 ? { startYear, endYear } : null;
  })
  .filter(Boolean);

export function getSchoolYearRange(startYear) {
  const year = parseNonNegativeYear(startYear) ?? (new Date().getFullYear() - 1);
  return { startYear: year, endYear: year + 1, label: `${year}–${year + 1}` };
}

export function formatAcademicYearTriggerLabel(schoolStartYear) {
  const { startYear, endYear } = getSchoolYearRange(schoolStartYear);
  return `Academic Year: ${startYear} - ${endYear}`;
}

export function isConsecutiveSchoolYear(startYear, endYear) {
  const first = parseNonNegativeYear(startYear);
  const second = parseNonNegativeYear(endYear);
  return first != null && second != null && second === first + 1;
}

function monthName(month) {
  return MONTH_LABELS_SHORT[month] ?? "";
}

export function getMonthOptions(viewYear) {
  const year = parseNonNegativeYear(viewYear);
  return ALL_MONTHS.map((month) => {
    const label = monthName(month);
    return {
      value: month,
      label,
      calendarYear: year,
      yearLabel: year == null ? label : `${label} ${year}`,
    };
  });
}

function normalizeMonthList(months) {
  const kept = [...new Set((Array.isArray(months) ? months : []).map(Number))]
    .filter((month) => ALL_MONTHS.includes(month))
    .sort((a, b) => a - b);
  return kept.length ? kept : [...ALL_MONTHS];
}

export function createSemesterMonthSelections() {
  return Object.fromEntries(
    SEMESTER_OPTIONS.map((semester) => [semester, [...ALL_MONTHS]])
  );
}

export function setSemesterMonths(selections, semester, months) {
  const nextSemester = SEMESTER_OPTIONS.includes(semester)
    ? semester
    : SEMESTER_OPTIONS[0];
  return { ...selections, [nextSemester]: normalizeMonthList(months) };
}

// Used when switching into Academic Timeline so a stale/invalid year or
// semester cannot feed an invalid academic date set. Valid user-selected
// month combinations are preserved per semester.
export function normalizeAcademicSelection({ schoolStartYear, semester, monthsBySemester }) {
  const nextYear = parseNonNegativeYear(schoolStartYear)
    ?? (SCHOOL_YEAR_OPTIONS[0]?.startYear ?? new Date().getFullYear() - 1);
  const nextSemester = SEMESTER_OPTIONS.includes(semester)
    ? semester
    : SEMESTER_OPTIONS[0];
  const source = monthsBySemester && typeof monthsBySemester === "object"
    ? monthsBySemester
    : {};

  return {
    schoolStartYear: nextYear,
    semester: nextSemester,
    monthsBySemester: Object.fromEntries(
      SEMESTER_OPTIONS.map((option) => [option, normalizeMonthList(source[option])])
    ),
  };
}

export function toggleAcademicMonth(months, month) {
  const value = Number(month);
  if (!ALL_MONTHS.includes(value)) return normalizeMonthList(months);

  const next = new Set(
    (Array.isArray(months) ? months : [])
      .map(Number)
      .filter((entry) => ALL_MONTHS.includes(entry))
  );
  if (!next.has(value)) {
    next.add(value);
  } else if (next.size > 1) {
    next.delete(value);
  }
  return [...next].sort((a, b) => a - b);
}

function academicYearForMonth(startYear, month) {
  return month >= 7 ? startYear : startYear + 1;
}

// Display/build months in academic-year order (Aug–Dec of the first year, then
// Jan–Jul of the second year), even when the user picks months arbitrarily.
function academicMonthOrder(month) {
  return month >= 7 ? month - 7 : month + 5;
}

export function toAcademicMonthISO(viewYear, month) {
  const year = parseNonNegativeYear(viewYear);
  if (year == null || !ALL_MONTHS.includes(Number(month))) return "";
  return makeYMD(year, Number(month), 1);
}

export function parseAcademicMonthISO(iso) {
  const date = parseISODate(iso);
  return date && date.getDate() === 1 ? date : null;
}

export function monthRangeDates(monthRange) {
  const start = parseAcademicMonthISO(monthRange?.from);
  const end = parseAcademicMonthISO(monthRange?.to);
  if (!start || !end || end < start) return [];

  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    const totalDays = daysInMonth(cursor.getFullYear(), cursor.getMonth());
    for (let day = 1; day <= totalDays; day += 1) {
      dates.push(makeYMD(cursor.getFullYear(), cursor.getMonth(), day));
    }
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

export function formatAcademicMonthLabel(iso) {
  return formatISODateMonthYear(iso);
}

export function formatAcademicMonthRangeLabel(monthRange, separator = " – ") {
  if (!monthRange?.from || !monthRange?.to) return "";
  return `${formatAcademicMonthLabel(monthRange.from)}${separator}${formatAcademicMonthLabel(monthRange.to)}`;
}

export function buildAcademicDates({ schoolStartYear, semester, months, monthRange }) {
  if (monthRange) return monthRangeDates(monthRange);

  const year = parseNonNegativeYear(schoolStartYear);
  if (year == null || !SEMESTER_OPTIONS.includes(semester)) return [];

  const selected = normalizeMonthList(months).sort(
    (a, b) => academicMonthOrder(a) - academicMonthOrder(b)
  );
  const dates = [];
  for (const month of selected) {
    const calendarYear = academicYearForMonth(year, month);
    const totalDays = daysInMonth(calendarYear, month);
    for (let day = 1; day <= totalDays; day++) {
      dates.push(makeYMD(calendarYear, month, day));
    }
  }
  return dates;
}

export function formatSelectedMonths(schoolStartYear, months) {
  const ordered = normalizeMonthList(months).sort(
    (a, b) => academicMonthOrder(a) - academicMonthOrder(b)
  );
  const startYear = parseNonNegativeYear(schoolStartYear) ?? 0;
  const byYear = new Map();
  for (const month of ordered) {
    const year = academicYearForMonth(startYear, month);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(month);
  }

  return [...byYear.entries()]
    .map(([year, values]) => {
      const contiguous = values.length > 1 && values.every(
        (value, i) => i === 0 || value === values[i - 1] + 1
      );
      const label = contiguous
        ? `${monthName(values[0])}–${monthName(values[values.length - 1])}`
        : values.map(monthName).join(", ");
      return `${label} ${year}`;
    })
    .join(" · ");
}

export function getAcademicDateRange({ schoolStartYear, semester, months, monthRange }) {
  const dates = buildAcademicDates({ schoolStartYear, semester, months, monthRange });
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1], dateCount: dates.length };
}

function formatISODateMonthYear(iso) {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isSafeInteger(year) || !ALL_MONTHS.includes(month)) return "";
  return `${MONTH_LABELS_LONG[month]} ${year}`;
}

export function formatAcademicDateRangeLabel({ schoolStartYear, semester, months, monthRange }) {
  if (monthRange) return formatAcademicMonthRangeLabel(monthRange, " to ");
  const range = getAcademicDateRange({ schoolStartYear, semester, months });
  if (!range) return "";
  return `${formatISODateMonthYear(range.from)} to ${formatISODateMonthYear(range.to)}`;
}

export function formatSemesterDisplayLabel(semester) {
  return SEMESTER_DISPLAY_LABELS[semester]
    ?? String(semester ?? "")
      .trim()
      .replace(/\bSemester\b/gi, "Sem");
}

export function formatAcademicPeriodLabel({ schoolStartYear, semester, months, monthRange }) {
  const range = getSchoolYearRange(schoolStartYear);
  return [
    `AY: ${range.startYear} – ${range.endYear}`,
    formatSemesterDisplayLabel(semester),
    formatAcademicDateRangeLabel({ schoolStartYear, semester, months, monthRange }),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatAcademicPeriodFileLabel({ schoolStartYear, semester, months, monthRange }) {
  return formatAcademicPeriodLabel({ schoolStartYear, semester, months, monthRange })
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
