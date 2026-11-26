// src/lib/regularTimeRange.js
// Shared adapter that lets non-Reports pages reuse the Reports "Regular Time"
// selection logic without adding another independent date-range implementation.
// The existing reportPeriodSelection helpers stay the source of truth for how
// Day/Week/Month/Year expand into explicit YYYY-MM-DD dates.

import { toYMD } from "./calendar.js";
import { EMPTY_RANGE, addMonths, formatDateLabel, formatRangeLabel } from "./dateRangeCalendar.js";
import {
  formatAcademicMonthLabel,
  formatAcademicMonthRangeLabel,
  monthRangeDates,
  parseAcademicMonthISO,
  toAcademicMonthISO,
} from "./academicPeriod.js";
import { REGULAR_TIME_PERIODS } from "./reportPeriods.js";
import {
  buildRegularTimeDates,
  formatAcademicYearRangeLabel,
  formatRegularPeriodLabel,
  getWeekIndexForDay,
  getYearRangeDates,
  normalizeYearRange,
  parseYMD,
  toAcademicYearISO,
} from "./reportPeriodSelection.js";

const MAX_INITIAL_DAYS = 366;

export function regularTimeArgs(selection) {
  const {
    date,
    selectedDays = [],
    yearInput,
    month = 0,
    weekIndex = null,
    selectedMonths = [],
    yearRange = { from: "", to: "" },
    period = "Day",
  } = selection || {};

  return {
    period,
    date,
    selectedDays,
    weekYear: yearInput,
    weekMonth: month,
    weekIndex,
    monthsYear: yearInput,
    selectedMonths,
    year: yearInput,
    yearRange,
  };
}

export function expandISODateRange(from, to) {
  const start = parseYMD(from);
  const end = parseYMD(to);
  if (!start || !end) return [];

  const cursor = new Date(Date.UTC(start.year, start.month, start.day));
  const last = new Date(Date.UTC(end.year, end.month, end.day));
  if (cursor.getTime() > last.getTime()) return [];

  const days = [];
  while (cursor.getTime() <= last.getTime() && days.length < MAX_INITIAL_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function ymdKey(parts) {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

// Range helpers keep the Logbook Day control on a continuous start/end model.
// ISO order is normalized numerically so years beyond four digits stay safe.
export function normalizeDayRange(range) {
  const from = String(range?.from ?? "");
  const to = String(range?.to ?? "");
  const start = parseYMD(from);
  const end = parseYMD(to);
  if (!start) return { from: "", to: end ? to : "" };
  if (!end) return { from, to: "" };
  return ymdKey(end) < ymdKey(start)
    ? { from: to, to: from }
    : { from, to };
}

export function dayRangeDates(range) {
  const normalized = normalizeDayRange(range);
  if (!normalized.from) return [];
  return expandISODateRange(normalized.from, normalized.to || normalized.from);
}

export function dayRangeLabel(range) {
  const normalized = normalizeDayRange(range);
  return normalized.from ? formatRangeLabel(normalized, "") : "";
}

export function shiftDayRange(range, delta) {
  const normalized = normalizeDayRange(range);
  if (!normalized.from) return EMPTY_RANGE;

  const step = Number(delta) < 0 ? -1 : 1;
  function shifted(iso) {
    const parts = parseYMD(iso);
    if (!parts) return "";
    const date = new Date(Date.UTC(2000, parts.month, parts.day));
    date.setUTCFullYear(parts.year);
    date.setUTCDate(date.getUTCDate() + step);
    return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  return {
    from: shifted(normalized.from),
    to: normalized.to ? shifted(normalized.to) : "",
  };
}

export function normalizeMonthRange(range) {
  const from = typeof range?.from === "string" && range.from ? range.from : "";
  const to = typeof range?.to === "string" && range.to ? range.to : "";
  if (from && to && to < from) return { from: to, to: from };
  return { from, to };
}

export function shiftMonthRange(range, delta) {
  const normalized = normalizeMonthRange(range);
  if (!normalized.from) return EMPTY_RANGE;

  const step = Number(delta) < 0 ? -1 : 1;
  function shifted(iso) {
    const current = parseAcademicMonthISO(iso);
    if (!current) return "";
    const next = addMonths(current, step);
    return toAcademicMonthISO(next.getFullYear(), next.getMonth());
  }

  return {
    from: shifted(normalized.from),
    to: normalized.to ? shifted(normalized.to) : "",
  };
}

function monthISOFromParts(parts) {
  return parts ? toAcademicMonthISO(parts.year, parts.month) : "";
}

export function initialRegularTimeSelection(value, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const base = {
    period: "All Time",
    date: now,
    dayRange: EMPTY_RANGE,
    monthRange: EMPTY_RANGE,
    selectedDays: [],
    yearInput: String(year),
    month,
    weekIndex: null,
    selectedMonths: [month],
    yearRange: EMPTY_RANGE,
  };

  const explicitPeriod =
    typeof value?.period === "string" && REGULAR_TIME_PERIODS.includes(value.period)
      ? value.period
      : "";
  if (explicitPeriod === "All Time") return base;

  const dayRange = normalizeDayRange({ from: value?.from, to: value?.to });
  if (!dayRange.from) return { ...base, period: explicitPeriod || "All Time" };

  const first = parseYMD(dayRange.from);
  if (!first) return { ...base, period: explicitPeriod || "Day" };

  const anchorDate = new Date(first.year, first.month, first.day);
  const last = parseYMD(dayRange.to);
  const yearRange = value?.yearRange
    ? normalizeYearRange(value.yearRange)
    : explicitPeriod === "Year"
      ? normalizeYearRange({
          from: toAcademicYearISO(first.year),
          to: toAcademicYearISO(last?.year ?? first.year),
        })
      : EMPTY_RANGE;
  const monthRange = normalizeMonthRange(
    value?.monthRange ||
      (explicitPeriod === "Month"
        ? {
            from: monthISOFromParts(first),
            to: monthISOFromParts(parseYMD(dayRange.to)),
          }
        : EMPTY_RANGE)
  );
  const next = {
    ...base,
    date: anchorDate,
    dayRange,
    monthRange,
    yearRange,
    selectedDays: dayRangeDates(dayRange),
    yearInput: String(first.year),
    month: first.month,
  };

  if (explicitPeriod && explicitPeriod !== "Day") {
    return {
      ...next,
      period: explicitPeriod,
      weekIndex:
        explicitPeriod === "Week"
          ? getWeekIndexForDay(first.year, first.month, first.day)
          : null,
      selectedMonths: explicitPeriod === "Month" ? [first.month] : base.selectedMonths,
    };
  }

  // Legacy callers pass only { from, to }. Treat that as a Day range so an
  // existing date filter is preserved until the caller supplies period metadata.
  return { ...next, period: "Day" };
}

// All Time deliberately maps to no date filter for Logbook: Reports uses a
// current-day report call because its backend endpoint is date-scoped, while
// /logbook already supports an unscoped list request.
export function resolveRegularTimeRange(selection) {
  const { period, date, dayRange } = selection || {};
  if (period === "All Time") {
    return { from: "", to: "", dates: [], label: "All Time" };
  }

  if (period === "Day") {
    const dates = dayRangeDates(dayRange);
    if (dates.length) {
      return {
        from: dates[0],
        to: dates[dates.length - 1],
        dates,
        label: dayRangeLabel(dayRange),
      };
    }

    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      const iso = toYMD(date);
      return { from: iso, to: iso, dates: [iso], label: formatDateLabel(iso) };
    }
    return { from: "", to: "", dates: [], label: "" };
  }

  if (period === "Month") {
    const monthRange = normalizeMonthRange(selection?.monthRange);
    if (monthRange.from) {
      const completeRange = monthRange.to ? monthRange : { ...monthRange, to: monthRange.from };
      const dates = monthRangeDates(completeRange);
      if (dates.length) {
        return {
          from: dates[0],
          to: dates[dates.length - 1],
          dates,
          label: monthRange.to
            ? formatAcademicMonthRangeLabel(monthRange, " to ")
            : `From ${formatAcademicMonthLabel(monthRange.from)}`,
        };
      }
    }
  }

  if (period === "Year") {
    const yearRange = normalizeYearRange(selection?.yearRange);
    if (yearRange.from) {
      const completeRange = yearRange.to ? yearRange : { ...yearRange, to: yearRange.from };
      const dates = getYearRangeDates(completeRange);
      if (dates.length) {
        return {
          from: dates[0],
          to: dates[dates.length - 1],
          dates,
          label: formatAcademicYearRangeLabel(yearRange),
        };
      }
    }
  }

  const args = regularTimeArgs(selection);
  const dates = buildRegularTimeDates(args);
  return {
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    dates,
    label: formatRegularPeriodLabel(args),
  };
}
