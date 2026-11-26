import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { pickRangeDate } from "../../src/lib/dateRangeCalendar.js"
import { formatAcademicMonthRangeLabel, monthRangeDates } from "../../src/lib/academicPeriod.js"
import { REGULAR_TIME_PERIODS } from "../../src/lib/reportPeriods.js"
import {
  dayRangeDates,
  dayRangeLabel,
  expandISODateRange,
  initialRegularTimeSelection,
  normalizeDayRange,
  resolveRegularTimeRange,
  shiftDayRange,
  shiftMonthRange,
} from "../../src/lib/regularTimeRange.js"

const read = (path) => readFileSync(path, "utf8")
const widget = read("src/components/admin/LogbookPanel.jsx")
const fullPage = read("src/components/admin/LogbookFullPanel.jsx")
const control = read("src/components/admin/LogbookRangePicker.jsx")
const regularPicker = read("src/components/admin/RegularTimePeriodPicker.jsx")
const sharedPicker = read("src/components/ui/DateRangePicker.jsx")
const reportsPanel = read("src/components/admin/ReportsFullPanel.jsx")
const monthDraftLib = read("src/lib/logbookRangeDraft.js")

test("Regular Time modes match the Reports period list and stay Academic-Timeline-free", () => {
  assert.deepEqual(REGULAR_TIME_PERIODS, ["Day", "Week", "Month", "Year", "All Time"])
  assert.doesNotMatch(control, /Academic Timeline/)
  assert.doesNotMatch(control, /School-Based Time/)
  assert.doesNotMatch(widget, /Academic Timeline/)
  assert.doesNotMatch(fullPage, /Academic Timeline/)
})

test("Day selection is one continuous start/end range", () => {
  let dayRange = pickRangeDate({ from: "", to: "" }, "2026-08-06")
  assert.deepEqual(dayRange, { from: "2026-08-06", to: "" })
  dayRange = pickRangeDate(dayRange, "2026-08-12")
  assert.deepEqual(dayRange, { from: "2026-08-06", to: "2026-08-12" })

  assert.deepEqual(dayRangeDates(dayRange), [
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
  ])
  assert.equal(dayRangeLabel(dayRange), "Aug 6, 2026 - Aug 12, 2026")

  const range = resolveRegularTimeRange({
    period: "Day",
    date: new Date(2026, 7, 6),
    dayRange,
    yearInput: "2026",
    month: 7,
    selectedMonths: [7],
  })
  assert.deepEqual(range.dates, dayRangeDates(dayRange))
  assert.equal(range.from, "2026-08-06")
  assert.equal(range.to, "2026-08-12")
  assert.equal(range.label, "Aug 6, 2026 - Aug 12, 2026")
})

test("Week selection shows and applies the actual date range", () => {
  const range = resolveRegularTimeRange({
    period: "Week",
    date: new Date(2026, 7, 6),
    selectedDays: [],
    yearInput: "2026",
    month: 7,
    weekIndex: 1,
    selectedMonths: [7],
  })
  assert.equal(range.from, "2026-08-08")
  assert.equal(range.to, "2026-08-14")
  assert.match(range.label, /Week 2/)
})

test("Month, Year, and All Time resolve to the expected Logbook query range", () => {
  const month = resolveRegularTimeRange({
    period: "Month",
    yearInput: "2026",
    month: 0,
    selectedMonths: [0],
  })
  assert.equal(month.from, "2026-01-01")
  assert.equal(month.to, "2026-01-31")

  const year = resolveRegularTimeRange({
    period: "Year",
    yearInput: "2026",
    month: 0,
    selectedMonths: [0],
  })
  assert.equal(year.from, "2026-01-01")
  assert.equal(year.to, "2026-12-31")

  const allTime = resolveRegularTimeRange({
    period: "All Time",
    yearInput: "2026",
    month: 0,
    selectedMonths: [0],
  })
  assert.deepEqual(allTime, { from: "", to: "", dates: [], label: "All Time" })
})

test("Month handles single-month selection with inclusive month dates", () => {
  const monthRange = pickRangeDate({ from: "", to: "" }, "2026-04-01")
  assert.deepEqual(monthRange, { from: "2026-04-01", to: "" })

  const resolved = resolveRegularTimeRange({
    period: "Month",
    yearInput: "2026",
    month: 3,
    monthRange,
    selectedMonths: [3],
  })
  assert.equal(resolved.from, "2026-04-01")
  assert.equal(resolved.to, "2026-04-30")
  assert.equal(resolved.label, "From April 2026")
  assert.equal(resolved.dates.length, 30)
  assert.equal(resolved.dates[0], "2026-04-01")
  assert.equal(resolved.dates[resolved.dates.length - 1], "2026-04-30")
})

test("Month handles same-year ranges with inclusive end-month dates", () => {
  const monthRange = pickRangeDate(
    pickRangeDate({ from: "", to: "" }, "2026-03-01"),
    "2026-05-01"
  )
  assert.deepEqual(monthRange, { from: "2026-03-01", to: "2026-05-01" })

  const resolved = resolveRegularTimeRange({
    period: "Month",
    yearInput: "2026",
    month: 2,
    monthRange,
    selectedMonths: [2, 3, 4],
  })
  assert.equal(resolved.from, "2026-03-01")
  assert.equal(resolved.to, "2026-05-31")
  assert.equal(resolved.label, "March 2026 to May 2026")
  assert.equal(resolved.dates.length, 92)
})

test("Month handles cross-year ranges with inclusive end-month dates", () => {
  let monthRange = pickRangeDate({ from: "", to: "" }, "2025-11-01")
  assert.deepEqual(monthRange, { from: "2025-11-01", to: "" })
  monthRange = pickRangeDate(monthRange, "2026-02-01")
  assert.deepEqual(monthRange, { from: "2025-11-01", to: "2026-02-01" })

  const dates = monthRangeDates(monthRange)
  assert.equal(dates.length, 120)
  assert.equal(dates[0], "2025-11-01")
  assert.equal(dates[dates.length - 1], "2026-02-28")
  assert.equal(formatAcademicMonthRangeLabel(monthRange, " to "), "November 2025 to February 2026")

  const resolved = resolveRegularTimeRange({
    period: "Month",
    yearInput: "2025",
    month: 10,
    monthRange,
    selectedMonths: [10],
  })
  assert.equal(resolved.from, "2025-11-01")
  assert.equal(resolved.to, "2026-02-28")
  assert.equal(resolved.label, "November 2025 to February 2026")

  assert.deepEqual(shiftMonthRange(monthRange, 1), {
    from: "2025-12-01",
    to: "2026-03-01",
  })
  assert.deepEqual(
    pickRangeDate({ from: "", to: "" }, "2026-02-01"),
    { from: "2026-02-01", to: "" }
  )
  assert.deepEqual(
    pickRangeDate({ from: "2026-02-01", to: "" }, "2025-11-01"),
    { from: "2025-11-01", to: "2026-02-01" }
  )
  assert.deepEqual(pickRangeDate(monthRange, "2026-06-01"), { from: "2026-06-01", to: "" })
})

test("an existing date range is preserved as a Day range and can be shifted", () => {
  const days = expandISODateRange("2026-11-23", "2026-11-29")
  assert.deepEqual(days, [
    "2026-11-23",
    "2026-11-24",
    "2026-11-25",
    "2026-11-26",
    "2026-11-27",
    "2026-11-28",
    "2026-11-29",
  ])

  const selection = initialRegularTimeSelection({
    from: "2026-11-23",
    to: "2026-11-29",
  })
  assert.equal(selection.period, "Day")
  assert.deepEqual(selection.dayRange, { from: "2026-11-23", to: "2026-11-29" })
  assert.deepEqual(selection.selectedDays, days)
  assert.deepEqual(normalizeDayRange({ from: "2026-11-29", to: "2026-11-23" }), {
    from: "2026-11-23",
    to: "2026-11-29",
  })
  assert.deepEqual(shiftDayRange(selection.dayRange, 1), {
    from: "2026-11-24",
    to: "2026-11-30",
  })

  const range = resolveRegularTimeRange(selection)
  assert.equal(range.from, "2026-11-23")
  assert.equal(range.to, "2026-11-29")
  assert.equal(range.label, "Nov 23, 2026 - Nov 29, 2026")
})

test("both Logbook panels reuse the Reports selection components and trigger", () => {
  for (const [name, source] of [
    ["Dashboard Logbook", widget],
    ["Full Logbook", fullPage],
  ]) {
    assert.match(source, /import LogbookRangePicker/, name)
    assert.match(source, /<LogbookRangePicker/, name)
    assert.doesNotMatch(source, /import DateRangePicker/, name)
    assert.doesNotMatch(source, /<DateRangePicker/, name)
    assert.match(source, /onChange=\{changeDateRange\}/, name)
    assert.match(source, /triggerTestId="logbook-date-range"/, name)
  }

  assert.match(control, /import \{ CalendarTriggerButton, RangeCalendarPanel \}/)
  assert.match(control, /import PeriodDropdown/)
  assert.match(control, /import RegularTimePeriodPicker/)
  assert.match(control, /shiftRegularSelection/)
  assert.match(control, /shiftDayRange/)
  assert.match(control, /pickRangeDate/)
  assert.match(control, /<RangeCalendarPanel/)
  assert.doesNotMatch(control, /toggleRegularDay/)
  assert.doesNotMatch(control, /Tap multiple days/)
  assert.match(control, /resolveRegularTimeRange/)

  assert.match(reportsPanel, /<RegularTimePeriodPicker/)
  assert.match(reportsPanel, /<PeriodDropdown/)
})

test("both Logbook surfaces expose the shared month-range calendar without changing Reports", () => {
  for (const [name, source] of [
    ["Dashboard Logbook", widget],
    ["Full Logbook", fullPage],
  ]) {
    assert.equal((source.match(/<LogbookRangePicker\b/g) || []).length, 1, name)
    assert.match(source, /triggerTestId="logbook-date-range"/, name)
  }

  assert.match(control, /monthRange=\{monthRange\}/)
  assert.match(control, /onMonthRangePick=\{handlePickMonth\}/)
  assert.match(control, /onClearMonthRange=\{handleClearMonthRange\}/)
  assert.match(control, /shiftMonthRange\(source, delta\)/)
  assert.match(control, /setMonthRange\(next\.monthRange\)/)
  assert.match(monthDraftLib, /monthRange: EMPTY_RANGE/, "Clear should reset the month range")
  assert.match(regularPicker, /MonthRangeCalendarPanel/)
  assert.match(regularPicker, /formatAcademicMonthRangeLabel\(monthRange\)/)
  assert.match(regularPicker, /onClear=\{onClearMonthRange\}/)
  assert.match(sharedPicker, /aria-label="Previous year"/)
  assert.match(sharedPicker, /aria-label="Next year"/)
  assert.match(sharedPicker, /gc-month-grid/)

  assert.match(reportsPanel, /<RegularTimePeriodPicker/)
  assert.doesNotMatch(reportsPanel, /<RegularTimePeriodPicker[\s\S]*?monthRange=/)
})

test("selected dates reach both the screen filter and the API query", () => {
  assert.match(widget, /e\.dateISO >= dateFrom/)
  assert.match(widget, /e\.dateISO <= dateTo/)
  assert.match(fullPage, /function changeDateRange\(\{ from, to, period \}\)/)
  assert.match(fullPage, /setDatePeriod\(period \?\? "All Time"\)/)

  assert.ok(
    (widget.match(/buildLogbookQueryParams\(\{ dateFrom, dateTo \}\)/g) || []).length >= 2,
    "Dashboard Logbook should use the selected range for initial load and walk-in refresh"
  )
  assert.match(fullPage, /dateFrom,\s*\n\s*dateTo,/)
  assert.match(read("src/lib/logbookQuery.js"), /params\.date_from = dateFrom/)
  assert.match(read("src/lib/logbookQuery.js"), /params\.date_to = dateTo/)
})
