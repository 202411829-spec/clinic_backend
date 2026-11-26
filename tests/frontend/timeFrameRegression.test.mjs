import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pickRangeDate } from "../../src/lib/dateRangeCalendar.js";
import { getWeekIndexForDay } from "../../src/lib/reportPeriodSelection.js";
import {
  dayRangeDates,
  initialRegularTimeSelection,
  resolveRegularTimeRange,
} from "../../src/lib/regularTimeRange.js";

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8");
const control = read("components/admin/LogbookRangePicker.jsx");
const widget = read("components/admin/LogbookPanel.jsx");
const fullPage = read("components/admin/LogbookFullPanel.jsx");
const reportsPanel = read("components/admin/ReportsFullPanel.jsx");

const NOW = new Date(2026, 10, 26);

test("explicit period metadata prevents a full-year range from becoming Day", () => {
  const year = initialRegularTimeSelection({
    from: "2026-01-01",
    to: "2026-12-31",
    period: "Year",
  }, NOW);
  const yearRange = resolveRegularTimeRange(year);
  assert.equal(year.period, "Year");
  assert.equal(yearRange.from, "2026-01-01");
  assert.equal(yearRange.to, "2026-12-31");
  assert.equal(yearRange.dates.length, 365);
  assert.equal(yearRange.label, "2026");

  const allTime = initialRegularTimeSelection({
    from: "2026-01-01",
    to: "2026-12-31",
    period: "All Time",
  }, NOW);
  assert.equal(allTime.period, "All Time");
  assert.deepEqual(resolveRegularTimeRange(allTime), {
    from: "",
    to: "",
    dates: [],
    label: "All Time",
  });
});

test("explicit Week, Month, and Day periods restore their own date math", () => {
  const week = initialRegularTimeSelection({
    from: "2026-11-10",
    to: "2026-11-14",
    period: "Week",
  }, NOW);
  assert.equal(week.period, "Week");
  assert.equal(week.weekIndex, getWeekIndexForDay(2026, 10, 10));
  const weekRange = resolveRegularTimeRange(week);
  assert.equal(weekRange.from, "2026-11-08");
  assert.equal(weekRange.to, "2026-11-14");

  const month = initialRegularTimeSelection({
    from: "2026-11-01",
    to: "2026-11-30",
    period: "Month",
  }, NOW);
  assert.equal(month.period, "Month");
  const monthRange = resolveRegularTimeRange(month);
  assert.equal(monthRange.from, "2026-11-01");
  assert.equal(monthRange.to, "2026-11-30");

  const day = initialRegularTimeSelection({
    from: "2026-11-10",
    to: "2026-11-14",
    period: "Day",
  }, NOW);
  assert.equal(day.period, "Day");
  assert.deepEqual(dayRangeDates(day.dayRange), [
    "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14",
  ]);

  // Day picks keep the Week/Month/Year anchor synced, so switching periods
  // cannot fall back to an old full-year range.
  const switchedWeek = {
    ...day,
    period: "Week",
    weekIndex: getWeekIndexForDay(2026, 10, 10),
  };
  assert.equal(resolveRegularTimeRange(switchedWeek).from, "2026-11-08");
});

test("Day clicks still use one continuous start/end range", () => {
  const first = pickRangeDate({ from: "", to: "" }, "2026-11-10");
  assert.deepEqual(first, { from: "2026-11-10", to: "" });

  const second = pickRangeDate(first, "2026-11-14");
  assert.deepEqual(second, { from: "2026-11-10", to: "2026-11-14" });
  assert.equal(dayRangeDates(second).length, 5);

  const restarted = pickRangeDate(second, "2026-11-20");
  assert.deepEqual(restarted, { from: "2026-11-20", to: "" });
});

test("both Logbook surfaces preserve which period produced their range", () => {
  assert.match(fullPage, /const \[datePeriod, setDatePeriod\] = useState\("All Time"\)/);
  assert.match(widget, /const \[datePeriod, setDatePeriod\] = useState\("Week"\)/);
  for (const [name, source] of [["Full Logbook", fullPage], ["Dashboard Logbook", widget]]) {
    assert.match(source, /function changeDateRange\(\{ from, to, period \}\)/, name);
    assert.match(source, /setDatePeriod\(period \?\? "All Time"\)/, name);
    assert.match(
      source,
      /value=\{\{ from: dateFrom, to: dateTo, period: datePeriod \}\}/,
      name
    );
  }

  assert.match(control, /function syncAnchorDate/);
  assert.match(control, /if \(picked\) syncAnchorDate\(picked\)/);
  assert.match(control, /syncAnchorDate\(nextDate\)/);
  assert.match(control, /normalized === "Day" && period !== "Day"/);
  assert.match(control, /setDayRange\(EMPTY_RANGE\)/);
});

test("Reports uses the shared Day range calendar without touching other periods or Academic Time", () => {
  assert.match(
    reportsPanel,
    /const isContinuousDay = timeCategory === "Regular Time" && period === "Day"/
  );
  assert.match(reportsPanel, /dayRangeDates\(dayRange\)/);
  assert.match(reportsPanel, /dayRangeLabel\(dayRange\) \|\| formatDateLabel\(dateKey\)/);
  assert.match(reportsPanel, /<RangeCalendarPanel/);
  assert.match(reportsPanel, /onPick=\{handlePickDay\}/);
  assert.match(reportsPanel, /normalized === "Day"\s*&&\s*period !== "Day"/);
  assert.match(reportsPanel, /shiftDayRange\(dayRange, delta\)/);
  assert.match(reportsPanel, /: isContinuousDay \? \(/);
  assert.match(reportsPanel, /<RegularTimePeriodPicker/, "non-Day periods keep the original picker");
  assert.match(reportsPanel, /<SchoolBasedPeriodPicker/, "Academic Timeline picker is preserved");
  assert.match(
    reportsPanel,
    /buildAcademicDates\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/
  );
  assert.match(reportsPanel, /buildRegularTimeDates\(\{/);
  assert.match(reportsPanel, /formatRegularPeriodLabel\(regularPeriodArgs\)/);
});
