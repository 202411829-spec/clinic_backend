// src/lib/reportPeriodSelection.js
// Pure helpers for the Reports "Regular Time" selector. These keep the
// existing single-date reports endpoint intact by expanding the chosen
// reporting period into explicit YYYY-MM-DD dates. Years are handled as
// strings/numbers (not Date objects) so non-negative values such as 0 remain
// selectable.

import { shiftByPeriod, toYMD } from "./calendar.js";

export const MONTH_LABELS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const MONTH_LABELS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Empty strings are invalid even though Number("") === 0. Year 0 itself is
// valid and intentionally preserved.
export function parseNonNegativeYear(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const year = Number(text);
  return Number.isSafeInteger(year) && year >= 0 ? year : null;
}

function clampMonth(value) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 0 && month <= 11 ? month : null;
}

export function daysInMonth(yearValue, monthValue) {
  const year = parseNonNegativeYear(yearValue);
  const month = clampMonth(monthValue);
  if (year == null || month == null) return 0;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return MONTH_LENGTHS[month] + (month === 1 && leap ? 1 : 0);
}

export function makeYMD(yearValue, monthValue, dayValue) {
  const year = parseNonNegativeYear(yearValue);
  const month = clampMonth(monthValue);
  const day = Number(dayValue);
  if (year == null || month == null || !Number.isInteger(day)) return "";
  if (day < 1 || day > daysInMonth(year, month)) return "";
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseYMD(iso) {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isSafeInteger(year) || year < 0) return null;
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function normalizeISOList(list) {
  if (!Array.isArray(list)) return [];
  const valid = list
    .map((entry) => String(entry ?? ""))
    .filter((entry) => parseYMD(entry));
  return [...new Set(valid)].sort();
}

export function toggleRegularDay(selectedDays, iso) {
  const value = String(iso ?? "");
  if (!parseYMD(value)) return normalizeISOList(selectedDays);
  const next = new Set(normalizeISOList(selectedDays));
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next].sort();
}

export function normalizeRegularMonths(months) {
  if (!Array.isArray(months)) return [];
  return [...new Set(months.map(Number))]
    .filter((month) => Number.isInteger(month) && month >= 0 && month <= 11)
    .sort((a, b) => a - b);
}

export function toggleRegularMonth(months, month) {
  const value = Number(month);
  if (!Number.isInteger(value) || value < 0 || value > 11) return normalizeRegularMonths(months);
  const next = new Set(normalizeRegularMonths(months));
  if (next.has(value)) {
    if (next.size > 1) next.delete(value);
  } else {
    next.add(value);
  }
  return [...next].sort((a, b) => a - b);
}

export function getMonthDates(yearValue, monthValue) {
  const year = parseNonNegativeYear(yearValue);
  const month = clampMonth(monthValue);
  if (year == null || month == null) return [];
  const total = daysInMonth(year, month);
  return Array.from({ length: total }, (_, index) => makeYMD(year, month, index + 1));
}

export function getYearDates(yearValue) {
  const year = parseNonNegativeYear(yearValue);
  if (year == null) return [];
  return Array.from({ length: 12 }, (_, month) => getMonthDates(year, month)).flat();
}

export function getWeeksForMonth(yearValue, monthValue) {
  const year = parseNonNegativeYear(yearValue);
  const month = clampMonth(monthValue);
  if (year == null || month == null) return [];

  const total = daysInMonth(year, month);
  const weeks = [];
  for (let start = 1; start <= total; start += 7) {
    const end = Math.min(start + 6, total);
    const from = makeYMD(year, month, start);
    const to = makeYMD(year, month, end);
    weeks.push({
      index: weeks.length,
      from,
      to,
      label: `Week ${weeks.length + 1} — ${formatDayLabel(from)} – ${formatDayLabel(to)}`,
    });
  }
  return weeks;
}

export function getWeekIndexForDay(yearValue, monthValue, dayValue) {
  const year = parseNonNegativeYear(yearValue);
  const month = clampMonth(monthValue);
  const day = Number(dayValue);
  if (year == null || month == null || !Number.isInteger(day)) return 0;
  return Math.floor((day - 1) / 7);
}

export function getWeekDates(yearValue, monthValue, weekIndex) {
  const weeks = getWeeksForMonth(yearValue, monthValue);
  const week = weeks[Number(weekIndex)];
  if (!week) return [];
  const start = parseYMD(week.from);
  const end = parseYMD(week.to);
  if (!start || !end) return [];
  return getMonthDates(start.year, start.month).filter((iso) => iso >= week.from && iso <= week.to);
}

export function formatDayLabel(iso) {
  const parts = parseYMD(iso);
  if (!parts) return "";
  return `${MONTH_LABELS_LONG[parts.month]} ${parts.day}, ${parts.year}`;
}

export function formatDaySetLabel(isos) {
  const days = normalizeISOList(isos);
  if (days.length === 0) return "";
  if (days.length === 1) return formatDayLabel(days[0]);
  if (days.length <= 3) return days.map(formatDayLabel).join(", ");
  return `${days.length} days · ${formatDayLabel(days[0])} – ${formatDayLabel(days.at(-1))}`;
}

export function formatMonthListLabel(months) {
  const selected = normalizeRegularMonths(months);
  if (selected.length === 0) return "";
  if (selected.length === 1) return MONTH_LABELS_LONG[selected[0]];
  const contiguous = selected.every((month, index) => index === 0 || month === selected[index - 1] + 1);
  if (contiguous) {
    return `${MONTH_LABELS_SHORT[selected[0]]}–${MONTH_LABELS_SHORT[selected.at(-1)]}`;
  }
  return selected.map((month) => MONTH_LABELS_SHORT[month]).join(", ");
}

function resolveWeekIndex({ weekYear, year, weekMonth, weekIndex, date }) {
  const parsedYear = parseNonNegativeYear(weekYear ?? year);
  const month = clampMonth(weekMonth);
  const weeks = getWeeksForMonth(parsedYear, month);
  const hasIndex = weekIndex !== null && weekIndex !== undefined && weekIndex !== "";
  let index = hasIndex ? Number(weekIndex) : NaN;
  if (!Number.isInteger(index) || index < 0 || index >= weeks.length) {
    const derived =
      date instanceof Date && date.getFullYear() === parsedYear && date.getMonth() === month
        ? getWeekIndexForDay(parsedYear, month, date.getDate())
        : 0;
    index = derived;
  }
  return { parsedYear, month, weeks, index };
}

export function buildRegularTimeDates({
  period,
  date,
  selectedDays,
  weekYear,
  weekMonth,
  weekIndex,
  monthsYear,
  selectedMonths,
  year,
}) {
  switch (period) {
    case "Day": {
      const days = normalizeISOList(selectedDays);
      if (days.length) return days;
      return date instanceof Date && !Number.isNaN(date.getTime()) ? [toYMD(date)] : [];
    }
    case "Week": {
      const { parsedYear, month, weeks, index } = resolveWeekIndex({
        weekYear, year, weekMonth, weekIndex, date,
      });
      if (parsedYear == null || month == null || weeks.length === 0) return [];
      return getWeekDates(parsedYear, month, index);
    }
    case "Month": {
      const parsedYear = parseNonNegativeYear(monthsYear ?? year);
      if (parsedYear == null) return [];
      return normalizeRegularMonths(selectedMonths)
        .flatMap((month) => getMonthDates(parsedYear, month));
    }
    case "Year":
      return getYearDates(year);
    case "All Time":
      return date instanceof Date && !Number.isNaN(date.getTime()) ? [toYMD(date)] : [];
    default:
      return [];
  }
}

export function formatRegularPeriodLabel({
  period,
  date,
  selectedDays,
  weekYear,
  weekMonth,
  weekIndex,
  monthsYear,
  selectedMonths,
  year,
}) {
  switch (period) {
    case "Day": {
      const days = normalizeISOList(selectedDays);
      if (days.length) return formatDaySetLabel(days);
      return date instanceof Date && !Number.isNaN(date.getTime())
        ? formatDayLabel(toYMD(date))
        : "";
    }
    case "Week": {
      const { parsedYear, weeks, index } = resolveWeekIndex({
        weekYear, year, weekMonth, weekIndex, date,
      });
      if (parsedYear == null || weeks.length === 0) return "Enter a valid year";
      return weeks[index]?.label ?? weeks[0].label;
    }
    case "Month": {
      const parsedYear = parseNonNegativeYear(monthsYear ?? year);
      if (parsedYear == null) return "Enter a valid year";
      const months = formatMonthListLabel(selectedMonths);
      return months ? `${months} ${parsedYear}` : "Choose months";
    }
    case "Year": {
      const parsedYear = parseNonNegativeYear(year);
      return parsedYear == null ? "Enter a valid year" : String(parsedYear);
    }
    case "All Time":
      return "All Time";
    default:
      return "";
  }
}

export function formatRegularFileLabel(args) {
  return formatRegularPeriodLabel(args)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "All-Time";
}

export function getDailyAverage(totalConsultations, calendarDays) {
  const total = Number(totalConsultations);
  const days = Number(calendarDays);
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) return null;
  return Math.round((total / days) * 10) / 10;
}

export function formatDailyAverage(average) {
  return average == null ? "—" : `${average.toFixed(1)} consultations/day`;
}

function moveMonthYear(year, month, delta) {
  const absolute = Math.max(0, year * 12 + month + delta);
  return { year: Math.floor(absolute / 12), month: absolute % 12 };
}

export function shiftRegularSelection(selection, delta) {
  const step = Number(delta) < 0 ? -1 : 1;
  const period = selection?.period;

  if (period === "Day") {
    const source = selection.date instanceof Date ? selection.date : new Date();
    return { date: shiftByPeriod(source, "Day", step), selectedDays: [] };
  }

  if (period === "Week") {
    const year = parseNonNegativeYear(selection.weekYear ?? selection.year) ?? 0;
    const month = clampMonth(selection.weekMonth) ?? 0;
    const weeks = getWeeksForMonth(year, month);
    const { index } = resolveWeekIndex({ ...selection, weekYear: year, weekMonth: month });
    const next = index + step;
    if (next >= 0 && next < weeks.length) return { weekIndex: next };
    const moved = moveMonthYear(year, month, step);
    const nextWeeks = getWeeksForMonth(moved.year, moved.month);
    return {
      yearInput: String(moved.year),
      month: moved.month,
      weekIndex: step < 0 ? nextWeeks.length - 1 : 0,
    };
  }

  if (period === "Month") {
    const year = parseNonNegativeYear(selection.monthsYear ?? selection.year) ?? 0;
    const months = normalizeRegularMonths(selection.selectedMonths);
    if (months.length === 0) {
      return { yearInput: String(year), month: 0, selectedRegularMonths: [0] };
    }
    const first = months[0];
    let nextYear = year;
    let nextFirst = first + step;
    if (nextFirst > 11) {
      nextFirst = 0;
      nextYear += 1;
    } else if (nextFirst < 0) {
      nextFirst = 11;
      nextYear = Math.max(0, nextYear - 1);
    }
    const shifted = Array.from(
      { length: months.length },
      (_, offset) => (nextFirst + offset) % 12
    );
    return {
      yearInput: String(nextYear),
      month: nextFirst,
      selectedRegularMonths: shifted,
    };
  }

  if (period === "Year") {
    const year = parseNonNegativeYear(selection.year) ?? 0;
    return { yearInput: String(Math.max(0, year + step)) };
  }

  return {};
}
