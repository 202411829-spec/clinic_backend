import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  getRangePreview,
  pickRangeDate,
} from "../../src/lib/dateRangeCalendar.js"
import { REGULAR_TIME_PERIODS } from "../../src/lib/reportPeriods.js"
import {
  dayRangeDates,
  normalizeDayRange,
  resolveRegularTimeRange,
} from "../../src/lib/regularTimeRange.js"

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

const pickerSource = read("src/components/ui/DateRangePicker.jsx")
const controlSource = read("src/components/admin/LogbookRangePicker.jsx")
const cssSource = read("src/assets/styles/gc-rfb-ui.css")
const querySource = read("src/lib/logbookQuery.js")
const surfaces = [
  ["Dashboard Logbook", read("src/components/admin/LogbookPanel.jsx")],
  ["Full Logbook", read("src/components/admin/LogbookFullPanel.jsx")],
]

test("Day range selection starts, completes, reverses, and restarts cleanly", () => {
  const first = pickRangeDate({ from: "", to: "" }, "2026-11-10")
  assert.deepEqual(first, { from: "2026-11-10", to: "" })

  const forward = pickRangeDate(first, "2026-11-14")
  assert.deepEqual(forward, { from: "2026-11-10", to: "2026-11-14" })

  const reversed = pickRangeDate({ from: "2026-11-10", to: "" }, "2026-11-06")
  assert.deepEqual(reversed, { from: "2026-11-06", to: "2026-11-10" })

  assert.deepEqual(
    pickRangeDate(forward, "2026-11-20"),
    { from: "2026-11-20", to: "" },
    "a third click starts a new range instead of toggling individual days"
  )

  assert.deepEqual(normalizeDayRange({ from: "2026-11-14", to: "2026-11-10" }), {
    from: "2026-11-10",
    to: "2026-11-14",
  })
})

test("reversed ranges expand into inclusive continuous dates and existing query values", () => {
  const range = resolveRegularTimeRange({
    period: "Day",
    date: new Date(2026, 10, 14),
    dayRange: normalizeDayRange({ from: "2026-11-14", to: "2026-11-10" }),
    yearInput: "2026",
    month: 10,
  })

  assert.deepEqual(range.dates, [
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
  ])
  assert.equal(range.from, "2026-11-10")
  assert.equal(range.to, "2026-11-14")
  assert.equal(range.label, "Nov 10, 2026 - Nov 14, 2026")
  assert.deepEqual(dayRangeDates({ from: "2026-11-10", to: "2026-11-10" }), ["2026-11-10"])

  assert.match(querySource, /params\.date_from = dateFrom/)
  assert.match(querySource, /params\.date_to = dateTo/)
  for (const [name, source] of surfaces) {
    assert.match(source, /onChange=\{changeDateRange\}/, name)
    assert.match(source, /setDateFrom\(from\)/, name)
    assert.match(source, /setDateTo\(to\)/, name)
    assert.match(source, /setPage\(1\)/, name)
  }
})

test("range start, end, and middle days use the shared GC-RFB calendar states", () => {
  assert.deepEqual(getRangePreview({ from: "2026-11-20", to: "" }, "2026-11-15"), {
    start: "2026-11-15",
    end: "2026-11-20",
    isPreview: true,
  })
  assert.deepEqual(getRangePreview({ from: "2026-11-20", to: "2026-11-10" }, ""), {
    start: "2026-11-10",
    end: "2026-11-20",
    isPreview: false,
  })

  assert.match(pickerSource, /export function RangeCalendarPanel/)
  assert.match(pickerSource, /const isStart = Boolean\(start && sameDay\(day, start\)\)/)
  assert.match(pickerSource, /const isEnd = Boolean\(end && sameDay\(day, end\)\)/)
  assert.match(pickerSource, /const isMiddle = inRange && !isStart && !isEnd/)
  assert.match(pickerSource, /isStart \? "is-range-start" : ""/)
  assert.match(pickerSource, /isEnd \? "is-range-end" : ""/)
  assert.match(pickerSource, /isMiddle \? "is-in-range" : ""/)
  assert.match(pickerSource, /isStart && isEnd \? "is-range-solo" : ""/)
  assert.match(cssSource, /\.gc-cal-cell\.is-in-range::before/)
  assert.match(cssSource, /\.gc-cal-cell\.is-range-start::before/)
  assert.match(cssSource, /\.gc-cal-cell\.is-range-end::before/)
  assert.match(cssSource, /\.gc-cal-day\.is-range-start,[\s\S]*?background: #16a34a/)
})

test("both Logbook surfaces share the continuous range picker, not individual-day picks", () => {
  assert.deepEqual(REGULAR_TIME_PERIODS, ["Day", "Week", "Month", "Year", "All Time"])

  assert.match(controlSource, /import \{ CalendarTriggerButton, RangeCalendarPanel \}/)
  assert.match(controlSource, /<PeriodDropdown/)
  assert.match(controlSource, /<RegularTimePeriodPicker/)
  assert.match(controlSource, /<RangeCalendarPanel/)
  assert.match(controlSource, /pickRangeDate\(dayRange, iso\)/)
  assert.match(controlSource, /dayRangeDates\(dayRange\)/)
  assert.match(controlSource, /<PortalOverlay/)
  assert.match(controlSource, /preferredWidth=\{336\}/)
  assert.match(controlSource, /gc-cal-pop gc-cal-pop-portal/)
  assert.doesNotMatch(controlSource, /toggleRegularDay/)
  assert.doesNotMatch(controlSource, /Tap multiple days/)
  assert.doesNotMatch(controlSource, /onToggleDate=/)

  for (const [name, source] of surfaces) {
    assert.equal(
      (source.match(/<LogbookRangePicker\b/g) || []).length,
      1,
      `${name} should render exactly one shared control`
    )
    assert.match(source, /import LogbookRangePicker/, name)
    assert.doesNotMatch(source, /<DateRangePicker\b/, name)
    assert.doesNotMatch(source, /<SelectDateCalendar\b/, name)
    assert.doesNotMatch(source, /type="date"/, name)
  }
})
