import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pickRangeDate } from "../../src/lib/dateRangeCalendar.js";
import { getOverlayPosition } from "../../src/lib/gcOverlayPosition.js";
import { buildLogbookQueryParams } from "../../src/lib/logbookQuery.js";
import {
  buildRegularTimeDates,
  formatRegularPeriodLabel,
  pickAcademicYearRange,
  shiftYearRange,
  toAcademicYearISO,
} from "../../src/lib/reportPeriodSelection.js";
import { dayRangeDates, resolveRegularTimeRange } from "../../src/lib/regularTimeRange.js";

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8");
const sharedCalendar = read("components/ui/DateRangePicker.jsx");
const logbookPicker = read("components/admin/LogbookRangePicker.jsx");
const sharedPeriodPicker = read("components/admin/RegularTimePeriodPicker.jsx");
const widget = read("components/admin/LogbookPanel.jsx");
const fullPage = read("components/admin/LogbookFullPanel.jsx");
const reportsPanel = read("components/admin/ReportsFullPanel.jsx");
const css = read("assets/styles/gc-rfb-ui.css");

const ANCHOR = new Date(2026, 10, 26);

function assertValidRange(name, range) {
  assert.match(range.from, /^\d{4}-\d{2}-\d{2}$/, `${name} start date`);
  assert.match(range.to, /^\d{4}-\d{2}-\d{2}$/, `${name} end date`);
  assert.ok(range.from <= range.to, `${name} start must not come after end`);
}

test("Logbook non-Day periods cannot crash the shared period picker", () => {
  // Root cause: Logbook rendered RegularTimePeriodPicker without selectedDays,
  // while that shared component unconditionally read selectedDays.length.
  assert.match(logbookPicker, /const selectedDays = useMemo\(\(\) => dayRangeDates\(dayRange\)/);
  assert.match(logbookPicker, /<RegularTimePeriodPicker[\s\S]*?selectedDays=\{selectedDays\}/);
  assert.match(sharedPeriodPicker, /Array\.isArray\(selectedDays\)/);
  assert.doesNotMatch(sharedPeriodPicker, /selectedDays\.length/);

  for (const [name, source] of [["widget", widget], ["full page", fullPage]]) {
    assert.match(
      source,
      /value=\{\{ from: dateFrom, to: dateTo, period: datePeriod \}\}/,
      `${name} must preserve explicit period metadata`
    );
    assert.match(source, /function changeDateRange\(\{ from, to, period \}\)/, name);
  }
});

test("each Logbook period resolves to a valid date range", () => {
  const dayRange = pickRangeDate(
    pickRangeDate({ from: "", to: "" }, "2026-11-10"),
    "2026-11-14"
  );

  const cases = [
    ["Day", resolveRegularTimeRange({
      period: "Day",
      date: ANCHOR,
      dayRange,
      selectedDays: dayRangeDates(dayRange),
    })],
    ["Week", resolveRegularTimeRange({
      period: "Week",
      date: ANCHOR,
      yearInput: "2026",
      month: 10,
      weekIndex: 1,
      selectedMonths: [10],
    })],
    ["Month", resolveRegularTimeRange({
      period: "Month",
      date: ANCHOR,
      yearInput: "2026",
      month: 10,
      selectedMonths: [10],
    })],
    ["Year", resolveRegularTimeRange({
      period: "Year",
      date: ANCHOR,
      yearInput: "2026",
      month: 10,
      selectedMonths: [10],
    })],
  ];

  for (const [name, range] of cases) assertValidRange(name, range);

  assert.deepEqual([cases[0][1].from, cases[0][1].to], ["2026-11-10", "2026-11-14"]);
  assert.deepEqual([cases[1][1].from, cases[1][1].to], ["2026-11-08", "2026-11-14"]);
  assert.deepEqual([cases[2][1].from, cases[2][1].to], ["2026-11-01", "2026-11-30"]);
  assert.deepEqual([cases[3][1].from, cases[3][1].to], ["2026-01-01", "2026-12-31"]);

  const allTime = resolveRegularTimeRange({ period: "All Time", date: ANCHOR });
  assert.deepEqual(allTime, { from: "", to: "", dates: [], label: "All Time" });
});

test("continuous Day picking normalizes reversed dates and filters inclusively", () => {
  const startOnly = pickRangeDate({ from: "", to: "" }, "2026-11-14");
  const reversed = pickRangeDate(startOnly, "2026-11-10");
  assert.deepEqual(reversed, { from: "2026-11-10", to: "2026-11-14" });

  const restarted = pickRangeDate(reversed, "2026-11-20");
  assert.deepEqual(restarted, { from: "2026-11-20", to: "" });

  const range = resolveRegularTimeRange({
    period: "Day",
    date: ANCHOR,
    dayRange: reversed,
    selectedDays: dayRangeDates(reversed),
  });
  assert.equal(range.from, "2026-11-10");
  assert.equal(range.to, "2026-11-14");
  assert.deepEqual(range.dates, [
    "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14",
  ]);

  const params = buildLogbookQueryParams({ dateFrom: range.from, dateTo: range.to });
  assert.equal(params.date_from, "2026-11-10");
  assert.equal(params.date_to, "2026-11-14");

  const rows = [
    { dateISO: "2026-11-09" },
    ...range.dates.map((dateISO) => ({ dateISO })),
    { dateISO: "2026-11-15" },
  ];
  const filtered = rows.filter((row) =>
    (!params.date_from || row.dateISO >= params.date_from) &&
    (!params.date_to || row.dateISO <= params.date_to)
  );
  assert.deepEqual(filtered.map((row) => row.dateISO), range.dates);
  assert.match(widget, /e\.dateISO >= dateFrom/);
  assert.match(widget, /e\.dateISO <= dateTo/);
});

test("Reports Day calendar is a portaled, layered popup with its own card surface", () => {
  assert.match(reportsPanel, /<PortalOverlay/);
  assert.match(reportsPanel, /role="dialog"/);
  assert.match(reportsPanel, /ariaLabel="Select report period"/);
  assert.match(reportsPanel, /preferredWidth=\{320\}/);
  assert.match(reportsPanel, /estimatedHeight=\{420\}/);
  assert.match(reportsPanel, /isContinuousDay \? "gc-reports-day-pop" : ""/);
  assert.match(reportsPanel, /<RangeCalendarPanel[\s\S]*?setView=\{setDayView\}/);
  assert.match(reportsPanel, /onPick=\{handlePickDay\}/);
  assert.match(reportsPanel, /onClear=\{handleClearDayRange\}/);

  assert.match(css, /\.gc-overlay-portal \{[\s\S]*?position: fixed;/);
  assert.match(
    css,
    /\.gc-reports-day-pop \{[\s\S]*?background: #fff;[\s\S]*?border: 1px solid[\s\S]*?border-radius: 1rem;[\s\S]*?box-shadow:/
  );

  const bottomTrigger = {
    left: 200, right: 320, width: 120, top: 700, bottom: 732, height: 32,
  };
  const placement = getOverlayPosition({
    triggerRect: bottomTrigger,
    panelWidth: 320,
    panelHeight: 420,
    viewport: { width: 1024, height: 768 },
  });
  assert.equal(placement.hidden, false);
  assert.equal(placement.placeAbove, true);
  assert.ok(placement.top >= 8);
});

test("Reports non-Day periods and Academic Timeline behavior stay intact", () => {
  assert.match(reportsPanel, /const isContinuousDay = timeCategory === "Regular Time" && period === "Day"/);
  assert.match(reportsPanel, /: isContinuousDay \? \(/);
  assert.match(reportsPanel, /<RegularTimePeriodPicker[\s\S]*?selectedDays=\{selectedDays\}/);
  assert.match(reportsPanel, /<SchoolBasedPeriodPicker/);
  assert.match(reportsPanel, /buildRegularTimeDates\(\{/);
  assert.match(reportsPanel, /formatRegularPeriodLabel\(regularPeriodArgs\)/);
  assert.match(reportsPanel, /buildAcademicDates\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/);
  assert.match(reportsPanel, /if \(isContinuousDay\) \{[\s\S]*?shiftDayRange\(dayRange, delta\)/);
  assert.match(reportsPanel, /applyRegularPatch\(shiftRegularSelection\(\{/);
});

test("shared Regular Time picker hides Week/Month/Year headings but keeps every control", () => {
  assert.match(sharedPeriodPicker, /const showPeriodHeading = period === "Day" \|\| period === "All Time"/);
  assert.match(sharedPeriodPicker, /\{showPeriodHeading && \([\s\S]*?Regular Time · \{period\}/);
  assert.match(sharedPeriodPicker, /onClick=\{onDone\}/);
  for (const period of ["Week", "Month", "Year"]) {
    assert.doesNotMatch(sharedPeriodPicker, new RegExp(`Regular Time · ${period}`));
  }

  assert.match(sharedPeriodPicker, /<MonthRangeCalendarPanel[\s\S]*?onClear=\{onClearMonthRange\}/);
  assert.match(sharedPeriodPicker, /max-h-64 space-y-2 overflow-y-auto/);
  assert.match(sharedPeriodPicker, /Report dates: \{activeWeek\.from\} to \{activeWeek\.to\}/);
  assert.match(sharedCalendar, /export function YearRangeCalendarPanel/);
  assert.match(sharedPeriodPicker, /<YearRangeCalendarPanel[\s\S]*?onClear=\{onClearYearRange\}/);

  for (const [name, source] of [["Reports", reportsPanel], ["Logbook", logbookPicker]]) {
    assert.match(source, /<RegularTimePeriodPicker[\s\S]*?yearRange=\{/, `${name} must share the year-range picker`);
  }
});

test("year range picking is start/end based and applies to report dates", () => {
  const start = toAcademicYearISO(2024);
  const end = toAcademicYearISO(2025);

  assert.deepEqual(pickAcademicYearRange({ from: "", to: "" }, start), { from: start, to: "" });
  assert.deepEqual(pickAcademicYearRange({ from: start, to: "" }, toAcademicYearISO(2026)), {
    from: start,
    to: "2026-01-01",
  });
  assert.deepEqual(pickAcademicYearRange({ from: start, to: "" }, toAcademicYearISO(2022)), {
    from: "2022-01-01",
    to: start,
  });
  assert.deepEqual(pickAcademicYearRange({ from: start, to: end }, toAcademicYearISO(2029)), {
    from: "2029-01-01",
    to: "",
  });

  const range = { from: start, to: end };
  const dates = buildRegularTimeDates({ period: "Year", yearRange: range });
  assert.equal(dates.length, 731);
  assert.equal(dates[0], "2024-01-01");
  assert.equal(dates.at(-1), "2025-12-31");
  assert.equal(formatRegularPeriodLabel({ period: "Year", yearRange: range }), "2024 – 2025");

  const resolved = resolveRegularTimeRange({ period: "Year", yearRange: range });
  assert.deepEqual([resolved.from, resolved.to], ["2024-01-01", "2025-12-31"]);
  assert.deepEqual(shiftYearRange(range, 1), { from: "2025-01-01", to: "2026-01-01" });
});
