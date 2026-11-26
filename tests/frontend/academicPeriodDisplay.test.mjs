import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  buildAcademicDates,
  formatAcademicDateRangeLabel,
  formatAcademicMonthRangeLabel,
  formatAcademicPeriodLabel,
  getAcademicDateRange,
  getMonthOptions,
  monthRangeDates,
} from "../../src/lib/academicPeriod.js"
import { fetchReportDates } from "../../src/lib/reportAggregation.js"

const reportsPanel = readFileSync("src/components/admin/ReportsFullPanel.jsx", "utf8")
const schoolPicker = readFileSync("src/components/admin/SchoolBasedPeriodPicker.jsx", "utf8")

const firstSemesterRange = {
  schoolStartYear: 2026,
  semester: "1st",
  monthRange: { from: "2026-08-01", to: "2026-10-01" },
}

const crossYearRange = {
  schoolStartYear: 2026,
  semester: "1st",
  monthRange: { from: "2026-06-01", to: "2027-01-01" },
}

test("academic period label uses AY, semester, and configured start/end month years", () => {
  assert.equal(
    formatAcademicPeriodLabel(firstSemesterRange),
    "AY: 2026 – 2027 · 1st Sem · August 2026 to October 2026"
  )
  assert.equal(
    formatAcademicPeriodLabel({
      schoolStartYear: 2025,
      semester: "2nd",
      monthRange: { from: "2025-12-01", to: "2026-01-01" },
    }),
    "AY: 2025 – 2026 · 2nd Sem · December 2025 to January 2026"
  )
  assert.equal(
    formatAcademicPeriodLabel({
      schoolStartYear: 2024,
      semester: "Midyear",
      monthRange: { from: "2025-06-01", to: "2025-07-01" },
    }),
    "AY: 2024 – 2025 · Midyear · June 2025 to July 2025"
  )
  assert.equal(
    formatAcademicPeriodLabel({
      schoolStartYear: 2026,
      semester: "1st",
      monthRange: { from: "", to: "" },
    }),
    "AY: 2026 – 2027 · 1st Sem"
  )
})

test("academic label updates when year, semester, or picked month range changes", () => {
  const base = formatAcademicPeriodLabel(firstSemesterRange)

  assert.notEqual(
    base,
    formatAcademicPeriodLabel({ ...firstSemesterRange, schoolStartYear: 2027 })
  )
  assert.notEqual(
    base,
    formatAcademicPeriodLabel({ ...firstSemesterRange, semester: "2nd" })
  )
  assert.notEqual(
    base,
    formatAcademicPeriodLabel({
      ...firstSemesterRange,
      monthRange: { from: "2026-08-01", to: "2026-11-01" },
    })
  )
})

test("timeline month options expose the viewed calendar year for every month", () => {
  const byValue = new Map(getMonthOptions(2026).map((option) => [option.value, option]))

  assert.equal(getMonthOptions(2026).length, 12)
  assert.equal(byValue.get(0).yearLabel, "Jan 2026")
  assert.equal(byValue.get(5).yearLabel, "Jun 2026")
  assert.equal(byValue.get(7).yearLabel, "Aug 2026")
  assert.equal(byValue.get(11).yearLabel, "Dec 2026")
  assert.equal(byValue.get(0).calendarYear, 2026)
  assert.equal(byValue.get(11).calendarYear, 2026)

  assert.match(schoolPicker, /<MonthRangeCalendarPanel/)
  assert.match(schoolPicker, /viewYear=\{viewYear\}/)
  assert.match(schoolPicker, /aria-label="Academic year end year"/)
})

test("academic periods derive real start and end dates across year boundaries", () => {
  const range = getAcademicDateRange(crossYearRange)
  const dates = buildAcademicDates(crossYearRange)

  assert.deepEqual(range, {
    from: "2026-06-01",
    to: "2027-01-31",
    dateCount: 245,
  })
  assert.equal(dates[0], range.from)
  assert.equal(dates.at(-1), range.to)
  assert.equal(dates.length, range.dateCount)
  assert.equal(
    formatAcademicDateRangeLabel(crossYearRange),
    "June 2026 to January 2027"
  )
  assert.equal(
    formatAcademicMonthRangeLabel(crossYearRange.monthRange),
    "June 2026 – January 2027"
  )
})

test("timeline picker shows the academic year, semester, and continuous month range", () => {
  assert.match(schoolPicker, /AY: \{range\?\.startYear .*range\?\.endYear .*formatSemesterDisplayLabel\(semester\)/)
  assert.match(schoolPicker, /formatAcademicMonthRangeLabel\(monthRange\)/)
  assert.match(schoolPicker, /Select start and end month/)
  assert.match(schoolPicker, /options=\{SEMESTER_OPTIONS\}/)
  assert.doesNotMatch(schoolPicker, /Included dates:/)
  assert.match(reportsPanel, /title=\{periodLabel\}/)
})

test("Reports filters receive every date in the selected academic range", async () => {
  const dates = buildAcademicDates(crossYearRange)
  const range = getAcademicDateRange(crossYearRange)
  const seen = []

  await fetchReportDates(dates, 7, async (params) => {
    seen.push(params)
    return { date: params.date }
  })

  assert.equal(seen.length, range.dateCount)
  assert.equal(seen[0].date, range.from)
  assert.equal(seen.at(-1).date, range.to)
  assert.ok(seen.every(({ date }) => date >= range.from && date <= range.to))
  assert.match(reportsPanel, /fetchReportDates\(academicDates, departmentIds, reportsApi\.get\)/)
  assert.match(reportsPanel, /buildAcademicDates\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/)
})

test("month ranges include every day of each selected month", () => {
  assert.deepEqual(monthRangeDates({ from: "2025-03-01", to: "2025-03-01" }), [
    ...Array.from({ length: 31 }, (_, day) => `2025-03-${String(day + 1).padStart(2, "0")}`),
  ])
  const leapFebruary = monthRangeDates({ from: "2024-02-01", to: "2024-02-01" })
  assert.equal(leapFebruary.length, 29)
  assert.equal(leapFebruary.at(-1), "2024-02-29")
})
