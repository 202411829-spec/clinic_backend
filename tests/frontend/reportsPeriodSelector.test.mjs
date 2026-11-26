import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  buildRegularTimeDates,
  formatDailyAverage,
  formatRegularPeriodLabel,
  getDailyAverage,
  getWeekDates,
  getWeeksForMonth,
  parseNonNegativeYear,
  toggleRegularDay,
  toggleRegularMonth,
} from "../../src/lib/reportPeriodSelection.js"
import {
  getSchoolYearRange,
  monthRangeDates,
  toAcademicMonthISO,
} from "../../src/lib/academicPeriod.js"

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8")
const reportsPanel = read("components/admin/ReportsFullPanel.jsx")
const regularPicker = read("components/admin/RegularTimePeriodPicker.jsx")
const schoolPicker = read("components/admin/SchoolBasedPeriodPicker.jsx")
const selectDateCalendar = read("components/admin/SelectDateCalendar.jsx")
const universalDropdown = read("components/ui/UniversalDropdown.jsx")
const studentRecordPanel = read("components/admin/StudentRecordPanel.jsx")
const academicPeriodSource = read("lib/academicPeriod.js")

test("week options use real calendar-month boundaries, including a partial final week", () => {
  const weeks = getWeeksForMonth(2026, 10)
  assert.equal(weeks.length, 5)
  assert.equal(weeks[0].label, "Week 1 — November 1, 2026 – November 7, 2026")
  assert.equal(weeks[1].label, "Week 2 — November 8, 2026 – November 14, 2026")
  assert.equal(weeks.at(-1).label, "Week 5 — November 29, 2026 – November 30, 2026")
  assert.deepEqual(getWeekDates(2026, 10, 4), ["2026-11-29", "2026-11-30"])
})

test("Day supports multiple days, Month supports multiple months, and Year accepts 0", () => {
  const date = new Date(2026, 7, 6)
  assert.deepEqual(
    buildRegularTimeDates({
      period: "Day",
      date,
      selectedDays: ["2026-08-06", "2026-08-08", "2026-08-12"],
    }),
    ["2026-08-06", "2026-08-08", "2026-08-12"]
  )
  assert.deepEqual(toggleRegularDay(["2026-08-06"], "2026-08-08"), ["2026-08-06", "2026-08-08"])
  assert.deepEqual(toggleRegularDay(["2026-08-06", "2026-08-08"], "2026-08-06"), ["2026-08-08"])

  const months = buildRegularTimeDates({
    period: "Month",
    date,
    monthsYear: 2026,
    selectedMonths: [10, 11],
  })
  assert.equal(months[0], "2026-11-01")
  assert.equal(months.at(-1), "2026-12-31")
  assert.deepEqual(toggleRegularMonth([10], 11), [10, 11])

  const yearZero = buildRegularTimeDates({ period: "Year", date, year: 0 })
  assert.equal(yearZero.length, 366)
  assert.equal(yearZero[0], "0000-01-01")
  assert.equal(yearZero.at(-1), "0000-12-31")
})

test("year input validates empty and invalid values without rejecting 0", () => {
  assert.equal(parseNonNegativeYear(""), null)
  assert.equal(parseNonNegativeYear("  "), null)
  assert.equal(parseNonNegativeYear("-1"), null)
  assert.equal(parseNonNegativeYear("abc"), null)
  assert.equal(parseNonNegativeYear("0"), 0)
  assert.equal(parseNonNegativeYear(0), 0)
  assert.equal(
    formatRegularPeriodLabel({ period: "Year", year: null }),
    "Enter a valid year"
  )
})

test("Daily Average uses every calendar day in the active period", () => {
  assert.equal(getDailyAverage(12, 5), 2.4)
  assert.equal(formatDailyAverage(getDailyAverage(12, 5)), "2.4 consultations/day")
  assert.equal(formatDailyAverage(getDailyAverage(0, 5)), "0.0 consultations/day")
  assert.equal(getDailyAverage(5, 0), null)
  assert.equal(formatDailyAverage(null), "—")
})

test("Daily Average card shows only the rounded integer value", () => {
  const card = reportsPanel.match(/<KpiCard\s+label="Daily Average"[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(card, /value=\{dailyAverage \?\? 0\}/)
  assert.doesNotMatch(card, /badge=/)
  assert.doesNotMatch(card, /calendar day/i)
  assert.doesNotMatch(card, /consultations\/day/i)
  assert.match(reportsPanel, /drawRow\("Daily Average", dailyAverageLabel\)/)
})

test("academic years are arbitrary and non-negative", () => {
  assert.deepEqual(getSchoolYearRange(0), {
    startYear: 0,
    endYear: 1,
    label: "0–1",
  })
  assert.equal(toAcademicMonthISO(0, 1), "0000-02-01")
  assert.equal(monthRangeDates({ from: "0000-02-01", to: "0000-02-01" }).length, 29)
  assert.doesNotMatch(academicPeriodSource, /knownYear/)
})

test("Reports UI exposes every selector and keeps single-date and date-set requests", () => {
  assert.match(reportsPanel, /<RegularTimePeriodPicker/)
  assert.match(reportsPanel, /buildRegularTimeDates\(\{/)
  assert.match(reportsPanel, /formatRegularPeriodLabel\(regularPeriodArgs\)/)
  assert.match(reportsPanel, /formatRegularFileLabel\(regularPeriodArgs\)/)
  assert.match(reportsPanel, /getDailyAverage\(totalConsultations, data\.dayCount\)/)
  assert.match(reportsPanel, /label="Daily Average"/)
  assert.match(reportsPanel, /Daily Average/, { message: "PDF summary should include the metric" })
  assert.match(reportsPanel, /fetchReportDates\(dates, departmentIds, reportsApi\.get\)/)
  assert.match(reportsPanel, /reportsApi\.get\(\{ date: toYMD\(date\), department_id: deptId \}\)/)
})

test("selectors use compact inputs and multi-day calendar support", () => {
  assert.match(regularPicker, /type="number"/)
  assert.match(regularPicker, /min="0"/)
  assert.match(regularPicker, /<SelectDateCalendar/)
  assert.match(regularPicker, /selectedDates=\{dayLabels\}/)
  assert.match(regularPicker, /onToggleDate=\{onToggleDay\}/)
  assert.match(regularPicker, /getWeeksForMonth\(parsedYear, month\)/)
  assert.match(regularPicker, /toggleRegularMonth\(selectedMonths, value\)/)
  assert.match(selectDateCalendar, /selectedDates = null/)
  assert.match(selectDateCalendar, /onToggleDate = null/)
  assert.match(selectDateCalendar, /multiSelect/)
  assert.match(schoolPicker, /min="0"/)
  assert.match(schoolPicker, /aria-label="Academic Year"/)
  assert.doesNotMatch(schoolPicker, /SCHOOL_YEAR_OPTIONS/)
})

test("generic placeholder text is display-only and never becomes a dropdown option", () => {
  assert.match(universalDropdown, /placeholder = "Choose an option"/)
  assert.doesNotMatch(universalDropdown, /value: "", label: placeholder/)
  assert.doesNotMatch(universalDropdown, /showPlaceholderOption/)
  assert.doesNotMatch(universalDropdown, /placeholder = "Select"/)
  assert.doesNotMatch(studentRecordPanel, /placeholder="Select"/)
})
