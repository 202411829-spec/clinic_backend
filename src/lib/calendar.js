// src/lib/calendar.js
// Tiny, dependency-free calendar helpers for the Appointments "Select Date" panel.

export const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Returns a 2D array of weeks for the given year/month (month is 0-indexed).
 * Each week is an array of 7 entries — a day number, or null for the
 * leading/trailing blank cells.
 */
export function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function isSameDate(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** e.g. "08/06/2026" */
export function formatMDY(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

/**
 * e.g. { month: "AUG", day: "8", weekday: "MON" } — matches the date box
 * on the Student Dashboard's Upcoming Appointment card.
 */
export function getCalendarBoxParts(date) {
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(date.getDate()),
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
  };
}

/** e.g. "August 6, 2026" — matches the header on the Appointments card */
export function formatLongDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Academic year (PH convention: starts ~August) that `date` falls in,
 * returned as "AY 2026-2027".
 */
export function getAcademicYearLabel(date) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 7 ? y : y - 1; // Aug (7) onward starts the new AY
  return `AY ${startYear}-${startYear + 1}`;
}

/** Rough PH term for `date`: "1st Semester", "2nd Semester", or "Midyear". */
export function getSemesterLabel(date) {
  const m = date.getMonth(); // 0-indexed
  if (m >= 7 && m <= 11) return "1st Semester"; // Aug–Dec
  if (m === 0 || (m >= 1 && m <= 4)) return "2nd Semester"; // Jan–May
  return "Midyear"; // Jun–Jul
}

/** Human label for the currently selected reporting period. */
export function getPeriodLabel(date, period) {
  switch (period) {
    case "Week": {
      const start = new Date(date);
      // Monday-start week (ISO): Sun=0 -> shift back 6, Mon=1 -> 0, ... Sat=6 -> 5
      const dow = start.getDay();
      const diffToMonday = dow === 0 ? 6 : dow - 1;
      start.setDate(start.getDate() - diffToMonday);
      const end = new Date(start);
      end.setDate(end.getDate() + 6); // Sunday
      const sameMonth = start.getMonth() === end.getMonth();
      const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString(
        "en-US",
        sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
      );
      return `${startLabel} – ${endLabel}`;
    }
    case "Month":
      return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "Semester":
      return `${getSemesterLabel(date)}, ${getAcademicYearLabel(date)}`;
    case "Academic Year":
      return getAcademicYearLabel(date);
    case "Year":
      return String(date.getFullYear());
    case "All Time":
      return "All Time";
    case "Day":
    default:
      return formatLongDate(date);
  }
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function todayYMD() {
  return startOfDay(new Date());
}

export function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> "MM/DD/YYYY" (string-based, timezone-safe). */
export function isoToMDY(iso) {
  if (!iso) return "All";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

/** Monday of the week containing `date` (ISO week start). */
export function getWeekStart(date) {
  const start = new Date(date);
  const dow = start.getDay();
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  start.setDate(start.getDate() - diffToMonday);
  return start;
}

/** Shifts `date` by one unit of `period` in the given `delta` direction (±1). */
export function shiftByPeriod(date, period, delta) {
  const next = new Date(date);
  switch (period) {
    case "Week":
      next.setDate(next.getDate() + 7 * delta);
      break;
    case "Month":
      next.setMonth(next.getMonth() + delta);
      break;
    case "Semester":
      next.setMonth(next.getMonth() + 5 * delta);
      break;
    case "Academic Year":
    case "Year":
      next.setFullYear(next.getFullYear() + delta);
      break;
    case "Day":
    default:
      next.setDate(next.getDate() + delta);
      break;
  }
  return next;
}
