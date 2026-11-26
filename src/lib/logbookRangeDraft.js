// src/lib/logbookRangeDraft.js
// Logbook's shared range picker keeps a draft selection while its calendar is
// open. Month ranges apply only on Done, so the first month click cannot
// trigger a parent fetch and unmount the picker before the second click.

import { EMPTY_RANGE, pickRangeDate } from "./dateRangeCalendar.js";
import { parseAcademicMonthISO, toAcademicMonthISO } from "./academicPeriod.js";
import { parseNonNegativeYear } from "./reportPeriodSelection.js";
import { initialRegularTimeSelection, resolveRegularTimeRange } from "./regularTimeRange.js";

export function createLogbookMonthDraft(value, now = new Date()) {
  return initialRegularTimeSelection(value, now);
}

export function pickLogbookMonthDraft(draft, iso) {
  const monthRange = pickRangeDate(draft?.monthRange, iso);
  const picked = parseAcademicMonthISO(iso);
  if (!picked) return { ...draft, monthRange };

  return {
    ...draft,
    monthRange,
    monthViewYear: picked.getFullYear(),
    yearInput: String(picked.getFullYear()),
    month: picked.getMonth(),
    selectedMonths: [picked.getMonth()],
    weekIndex: null,
    monthFocusISO: iso,
    monthHoverISO: "",
  };
}

export function clearLogbookMonthDraft(draft, now = new Date()) {
  const year = parseNonNegativeYear(draft?.yearInput) ?? now.getFullYear();
  return {
    ...draft,
    monthRange: EMPTY_RANGE,
    monthViewYear: year,
    monthFocusISO: toAcademicMonthISO(year, draft?.month ?? 0),
    monthHoverISO: "",
  };
}

export function resolveLogbookDraftRange(draft) {
  return {
    ...resolveRegularTimeRange(draft),
    period: draft?.period ?? "All Time",
  };
}

// from/to/period are the contract the Logbook parents store. Ignoring `dates`
// prevents a re-apply after the parent mirrors the same range back as `value`.
export function logbookRangeSignature(range) {
  return [
    range?.period ?? "All Time",
    range?.from ?? "",
    range?.to ?? "",
  ].join("|");
}

export function createMonthApplyGate(initialValue = {}, onChange) {
  let lastSignature = logbookRangeSignature(initialValue);
  let monthDraftDirty = false;

  const gate = {
    get monthDraftDirty() {
      return monthDraftDirty;
    },
    get lastSignature() {
      return lastSignature;
    },
    markMonthDraftDirty() {
      monthDraftDirty = true;
    },
    resetToApplied(value = {}) {
      monthDraftDirty = false;
      lastSignature = logbookRangeSignature(value);
    },
    maybeApply(range) {
      if (monthDraftDirty && range?.period === "Month") return false;
      const signature = logbookRangeSignature(range);
      if (signature === lastSignature) return false;
      lastSignature = signature;
      onChange?.(range);
      return true;
    },
    applyMonthDraft(range) {
      monthDraftDirty = false;
      return gate.maybeApply(range);
    },
  };

  return gate;
}
