import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  ACADEMIC_TIMELINE_LABEL,
  ALL_MONTHS,
  buildAcademicDates,
  formatAcademicMonthRangeLabel,
  formatAcademicPeriodFileLabel,
  formatAcademicPeriodLabel,
  formatAcademicYearTriggerLabel,
  getMonthOptions,
  getSchoolYearRange,
  isConsecutiveSchoolYear,
  monthRangeDates,
  parseAcademicMonthISO,
  SEMESTER_DISPLAY_LABELS,
  SEMESTER_OPTIONS,
  TIME_CATEGORIES,
  TIME_CATEGORY_LABELS,
  TIME_CATEGORY_OPTIONS,
  toAcademicMonthISO,
} from "../../src/lib/academicPeriod.js"
import { EMPTY_RANGE, pickRangeDate } from "../../src/lib/dateRangeCalendar.js"
import { normalizeRegularTimePeriod, REGULAR_TIME_PERIODS } from "../../src/lib/reportPeriods.js"
import { fetchReportDates, mergeReportResponses } from "../../src/lib/reportAggregation.js"

const reportsPanel = readFileSync("src/components/admin/ReportsFullPanel.jsx", "utf8")
const periodDropdown = readFileSync("src/components/admin/PeriodDropdown.jsx", "utf8")
const schoolPicker = readFileSync("src/components/admin/SchoolBasedPeriodPicker.jsx", "utf8")
const dateRangePicker = readFileSync("src/components/ui/DateRangePicker.jsx", "utf8")
const academicPeriodSource = readFileSync("src/lib/academicPeriod.js", "utf8")
const calendarCss = readFileSync("src/assets/styles/gc-rfb-ui.css", "utf8")

test("time categories keep internal values but display Academic Timeline", () => {
  assert.deepEqual(TIME_CATEGORIES, ["Regular Time", "School-Based Time"])
  assert.deepEqual(TIME_CATEGORY_OPTIONS, [
    { value: "Regular Time", label: "Regular Time" },
    { value: "School-Based Time", label: "Academic Timeline" },
  ])
  assert.match(reportsPanel, /value=\{timeCategory\}/)
  assert.match(reportsPanel, /onChange=\{handleTimeCategoryChange\}/)
  assert.match(reportsPanel, /options=\{TIME_CATEGORY_OPTIONS\}/)
  assert.doesNotMatch(reportsPanel, /options=\{TIME_CATEGORIES\}/)
  assert.match(reportsPanel, /setTimeCategory\(nextCategory\)/)
  assert.match(reportsPanel, /setPickerOpen\(false\)/)
})

test("Reports UI displays Academic Timeline and no longer displays School-Based Time", () => {
  assert.equal(ACADEMIC_TIMELINE_LABEL, "Academic Timeline")
  assert.equal(TIME_CATEGORY_LABELS["School-Based Time"], "Academic Timeline")

  assert.match(schoolPicker, />\s*Academic Timeline\s*</)
  assert.doesNotMatch(schoolPicker, />\s*School-Based Time\s*</)
  assert.match(reportsPanel, /options=\{TIME_CATEGORY_OPTIONS\}/)
  assert.doesNotMatch(reportsPanel, /options=\{TIME_CATEGORIES\}/)
  assert.match(academicPeriodSource, /`AY: \$\{range\.startYear\} – \$\{range\.endYear\}`/)
  assert.equal(formatAcademicPeriodLabel({
    schoolStartYear: 2025,
    semester: "1st",
    monthRange: { from: "2025-08-01", to: "2026-07-01" },
  }).includes("School-Based Time"), false)
})

test("Academic Timeline trigger shows the full selected academic period", () => {
  assert.equal(formatAcademicYearTriggerLabel(2025), "Academic Year: 2025 - 2026")
  assert.equal(formatAcademicYearTriggerLabel("0"), "Academic Year: 0 - 1")
  assert.match(
    reportsPanel,
    /<CalendarTriggerButton[\s\S]*?aria-label="Select report period"[\s\S]*?title=\{periodLabel\}[\s\S]*?className="min-w-0 flex-1"[\s\S]*?\{periodLabel\}/
  )
  assert.doesNotMatch(reportsPanel, /formatAcademicYearTriggerLabel/)
  assert.match(reportsPanel, /drawRow\("Date Range", periodLabel\)/)
})

test("Regular Time dropdown exposes only non-academic periods", () => {
  assert.deepEqual(REGULAR_TIME_PERIODS, ["Day", "Week", "Month", "Year", "All Time"])
  assert.match(periodDropdown, /import \{ REGULAR_TIME_PERIODS \} from "\.\.\/\.\.\/lib\/reportPeriods\.js"/)
  assert.match(periodDropdown, /REGULAR_TIME_PERIODS\.map/)
  assert.doesNotMatch(periodDropdown, /\[\s*"Day",[\s\S]*?"All Time"\s*\]/)
  assert.match(reportsPanel, /timeCategory === "Regular Time" && \(\s*<PeriodDropdown/)
  assert.doesNotMatch(reportsPanel, /<PeriodDropdown[^>]*options=/)
})

test("Academic Timeline uses a selectable first year, derived second year, and a month range", () => {
  assert.match(schoolPicker, />\s*Academic Timeline\s*</)
  assert.match(schoolPicker, /type="number"/)
  assert.match(schoolPicker, /aria-label="Academic Year"/)
  assert.match(schoolPicker, /aria-label="Academic year end year"/)
  assert.match(schoolPicker, /aria-readonly="true"/)
  assert.match(schoolPicker, /options=\{SEMESTER_OPTIONS\}/)
  assert.match(schoolPicker, /<MonthRangeCalendarPanel/)
  assert.match(schoolPicker, /value=\{monthRange\}/)
  assert.match(schoolPicker, /onPick=\{onMonthRangePick\}/)
  assert.match(schoolPicker, /onClear=\{onClearMonthRange\}/)
  assert.match(reportsPanel, /timeCategory === "School-Based Time" \? \(\s*<SchoolBasedPeriodPicker/)
  assert.match(reportsPanel, /monthRange=\{academicMonthRange\}/)
  assert.match(reportsPanel, /onMonthRangePick=\{handlePickAcademicMonth\}/)
  assert.match(reportsPanel, /onClearMonthRange=\{handleClearAcademicMonthRange\}/)
  assert.doesNotMatch(reportsPanel, /monthsBySemester|toggleAcademicMonth/)
})

test("switching categories normalizes incompatible year and semester values", () => {
  assert.equal(normalizeRegularTimePeriod("Semester"), "Day")
  assert.equal(normalizeRegularTimePeriod("Academic Year"), "Day")
  assert.equal(normalizeRegularTimePeriod("Week"), "Week")
  assert.equal(normalizeRegularTimePeriod("All Time"), "All Time")

  assert.deepEqual(SEMESTER_OPTIONS, ["1st", "2nd", "Midyear"])
  assert.match(reportsPanel, /setSchoolStartYear\(\(current\) => parseNonNegativeYear\(current\) \?\? DEFAULT_SCHOOL_START_YEAR\)/)
  assert.match(reportsPanel, /setSemester\(\(current\) => \(SEMESTER_OPTIONS\.includes\(current\) \? current : SEMESTER_OPTIONS\[0\]\)\)/)
  assert.doesNotMatch(reportsPanel, /monthsBySemester|setMonthsBySemester/)
})

test("school years are consecutive and derived from existing reference data", () => {
  assert.ok(getSchoolYearRange(2025).label)
  assert.deepEqual(getSchoolYearRange(2025), {
    startYear: 2025,
    endYear: 2026,
    label: "2025–2026",
  })
  assert.equal(isConsecutiveSchoolYear(2025, 2026), true)
  assert.equal(isConsecutiveSchoolYear(2025, 2027), false)
  assert.match(schoolPicker, /range\?\.endYear/)
})

test("school period picker hides redundant summary labels without removing controls", () => {
  assert.match(schoolPicker, /aria-label="Academic Year"/)
  assert.match(schoolPicker, /type="number"/)
  assert.match(schoolPicker, /range\?\.endYear/)
  assert.match(schoolPicker, /options=\{SEMESTER_OPTIONS\}/)
  assert.match(schoolPicker, /Select month range/)
  assert.match(schoolPicker, /<MonthRangeCalendarPanel/)
  assert.match(schoolPicker, /formatAcademicMonthRangeLabel\(monthRange\)/)
  assert.match(schoolPicker, />\s*Academic Timeline\s*</)
  assert.match(schoolPicker, /AY: \{range\?\.startYear .*range\?\.endYear/)
  assert.doesNotMatch(schoolPicker, /School-Based Time/)
  assert.doesNotMatch(schoolPicker, /Calculated Year/)
  assert.doesNotMatch(schoolPicker, /Months included/)
  assert.doesNotMatch(schoolPicker, /Included dates:/)
  assert.doesNotMatch(schoolPicker, /At least one month stays selected/)
  assert.match(
    reportsPanel,
    /<CalendarTriggerButton\b[\s\S]*?title=\{periodLabel\}[\s\S]*?\{periodLabel\}/
  )
})

test("every semester exposes a short label and the calendar has all 12 months", () => {
  assert.deepEqual(SEMESTER_OPTIONS, ["1st", "2nd", "Midyear"])
  assert.deepEqual(SEMESTER_DISPLAY_LABELS, {
    "1st": "1st Sem",
    "2nd": "2nd Sem",
    Midyear: "Midyear",
  })
  assert.deepEqual(getMonthOptions(2025).map(({ value }) => value), ALL_MONTHS)
  assert.deepEqual(
    getMonthOptions(2025).map(({ label }) => label),
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  )
  assert.equal(getMonthOptions(2025).find(({ value }) => value === 5).yearLabel, "Jun 2025")
  assert.equal(getMonthOptions(2025).find(({ value }) => value === 7).yearLabel, "Aug 2025")
  assert.match(dateRangePicker, /MONTH_LABELS_LONG\[month\]/)
  assert.match(dateRangePicker, /MONTH_LABELS_SHORT\.map/)
  assert.doesNotMatch(
    academicPeriodSource,
    /getSemesterLabel|semesterMonths|getSemesterMonthOptions|getSemesterMonths|getDefaultAcademicMonths/
  )
  assert.doesNotMatch(schoolPicker, /getSemesterMonthOptions|getSemesterMonths|allowedMonths/)
})

test("month clicks reuse the Day range rules: start, end, reversal, replacement", () => {
  let range = pickRangeDate(EMPTY_RANGE, "2026-06-01")
  assert.deepEqual(range, { from: "2026-06-01", to: "" })

  range = pickRangeDate(range, "2027-01-01")
  assert.deepEqual(range, { from: "2026-06-01", to: "2027-01-01" })

  range = pickRangeDate({ from: "2026-06-01", to: "" }, "2025-12-01")
  assert.deepEqual(range, { from: "2025-12-01", to: "2026-06-01" })

  range = pickRangeDate(range, "2026-03-01")
  assert.deepEqual(range, { from: "2026-03-01", to: "" })

  assert.match(reportsPanel, /pickRangeDate\(academicMonthRange, iso\)/)
  assert.match(reportsPanel, /setAcademicMonthRange\(EMPTY_RANGE\)/)
})

test("MonthRangeCalendarPanel reuses the Day grid states and supports year navigation", () => {
  assert.match(dateRangePicker, /export function MonthRangeCalendarPanel/)
  assert.match(dateRangePicker, /getRangePreview\(value, hoverISO\)/)
  assert.match(dateRangePicker, /aria-label="Previous year"/)
  assert.match(dateRangePicker, /aria-label="Next year"/)
  assert.match(dateRangePicker, /aria-label=\{`Months in \$\{year\}`\}/)
  assert.match(dateRangePicker, /data-iso=\{iso\}/)
  assert.match(dateRangePicker, /gc-cal-cell gc-month-cell/)
  assert.match(dateRangePicker, /is-in-range/)
  assert.match(dateRangePicker, /is-range-start/)
  assert.match(dateRangePicker, /is-range-end/)
  assert.match(dateRangePicker, /gc-cal-clear gc-no-btn-anim/)
  assert.match(calendarCss, /\.gc-month-grid/)
  assert.match(calendarCss, /\.gc-month-cell\s+\.gc-cal-day/)
})

test("selected month range generates inclusive report dates directly", () => {
  const monthRange = { from: "2025-12-01", to: "2026-03-01" }
  const dates = buildAcademicDates({ schoolStartYear: 2025, semester: "1st", monthRange })

  assert.deepEqual(dates, monthRangeDates(monthRange))
  assert.equal(dates.length, 121)
  assert.equal(dates[0], "2025-12-01")
  assert.equal(dates.at(-1), "2026-03-31")
  assert.ok(dates.includes("2025-12-31"))
  assert.ok(dates.includes("2026-01-01"))
  assert.ok(dates.includes("2026-02-28"))
  assert.ok(dates.includes("2026-03-31"))

  assert.equal(toAcademicMonthISO(2026, 5), "2026-06-01")
  assert.equal(parseAcademicMonthISO("2026-06-01")?.getMonth(), 5)
  assert.match(reportsPanel, /buildAcademicDates\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/)
})

test("displayed label and PDF filename reflect the actual selected month range", () => {
  const args = {
    schoolStartYear: 2025,
    semester: "1st",
    monthRange: { from: "2025-12-01", to: "2026-03-01" },
  }
  const label = formatAcademicPeriodLabel(args)

  assert.equal(label, "AY: 2025 – 2026 · 1st Sem · December 2025 to March 2026")
  assert.equal(
    formatAcademicMonthRangeLabel(args.monthRange),
    "December 2025 – March 2026"
  )
  const fileLabel = formatAcademicPeriodFileLabel(args)
  assert.match(fileLabel, /^AY-2025-2026-1st-Sem-/)
  assert.match(fileLabel, /December-2025-to-March-2026/)
  assert.match(reportsPanel, /formatAcademicPeriodLabel\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/)
  assert.match(reportsPanel, /formatAcademicPeriodFileLabel\(\{ schoolStartYear, semester, monthRange: academicMonthRange \}\)/)
})

test("Reports UI swaps Regular Time and Academic Timeline controls while preserving report requests", () => {
  assert.match(reportsPanel, /timeCategory === "Regular Time" && \(\s*<PeriodDropdown/)
  assert.match(reportsPanel, /timeCategory === "School-Based Time" \? \(\s*<SchoolBasedPeriodPicker/)
  assert.match(reportsPanel, /: \(\s*<RegularTimePeriodPicker/)
  assert.match(reportsPanel, /fetchReportDates\(academicDates, departmentIds, reportsApi\.get\)/)
  assert.match(reportsPanel, /fetchReportDates\(dates, departmentIds, reportsApi\.get\)/)
  assert.match(reportsPanel, /mergeReportResponses\(responses\)/)
  assert.match(reportsPanel, /reportsApi\.get\(\{ date: toYMD\(date\), department_id: deptId \}\)/)
})

test("date-set report responses merge into the existing report shape", () => {
  const merged = mergeReportResponses([
    {
      date: "2025-08-01",
      total_appointments: 2,
      total_students: 2,
      status_breakdown: [{ label: "Completed", count: 2, percent: 100 }],
      reason_breakdown: [{ label: "Consultation", count: 2, percent: 100 }],
    },
    {
      date: "2025-08-02",
      total_appointments: 1,
      total_students: 1,
      status_breakdown: [{ label: "Pending", count: 1, percent: 100 }],
      reason_breakdown: [{ label: "Consultation", count: 1, percent: 100 }],
    },
  ])

  assert.equal(merged.total_appointments, 3)
  assert.equal(merged.total_students, 3)
  assert.deepEqual(merged.status_breakdown, [
    { label: "Completed", count: 2, percent: 66.7 },
    { label: "Pending", count: 1, percent: 33.3 },
  ])
  assert.deepEqual(merged.reason_breakdown, [
    { label: "Consultation", count: 3, percent: 100 },
  ])
})

test("date-set fetching calls the existing reports endpoint for each date", async () => {
  const seen = []
  const responses = await fetchReportDates(
    ["2025-08-01", "2025-08-02"],
    7,
    async (params) => {
      seen.push(params)
      return { date: params.date }
    },
    2
  )

  assert.deepEqual(seen, [
    { date: "2025-08-01", department_id: 7 },
    { date: "2025-08-02", department_id: 7 },
  ])
  assert.deepEqual(responses, [{ date: "2025-08-01" }, { date: "2025-08-02" }])
})
