import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { buildAppointmentPayload } from "../../src/lib/appointmentPayload.js"
import {
  BOOKING_STEPS,
  availabilityDates,
  canProceed,
  clearOnReasonChange,
  findReason,
  isDedicatedReason,
  isReasonSelected,
  normalizeReasonId,
  reasonUsesDedicatedSchedule,
  summarizeSelection,
} from "../../src/lib/bookingFlow.js"

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8")
const bookingPage = read("pages/student/Book.jsx")
const apiSource = read("lib/api.js")
const reasonPanel = read("components/student/SelectReasonPanel.jsx")
const stepIndicator = read("components/student/BookingStepIndicator.jsx")
const dateCalendar = read("components/admin/SelectDateCalendar.jsx")
const schedulePanel = read("components/admin/ClinicScheduleFullPanel.jsx")
const logbookPanel = read("components/admin/LogbookPanel.jsx")
const logbookFullPanel = read("components/admin/LogbookFullPanel.jsx")
const appointmentsPanel = read("components/admin/AppointmentsPanel.jsx")

const REASONS = [
  { reason_id: 1, description: "Consultation", uses_dedicated_schedule: false },
  { reason_id: 2, description: "Medical Certificate", uses_dedicated_schedule: false },
  { reason_id: 3, description: "Dental Service", uses_dedicated_schedule: true },
]

test("booking steps put Reason before date/time and keep Summary before Confirm", () => {
  assert.deepEqual(BOOKING_STEPS.map(({ n, key }) => [n, key]), [
    [1, "reason"],
    [2, "calendar"],
    [3, "time"],
    [4, "summary"],
    [5, "confirm"],
  ])

  assert.match(stepIndicator, /import \{ BOOKING_STEPS \} from "\.\.\/\.\.\/lib\/bookingFlow\.js"/)
  assert.match(stepIndicator, /BOOKING_STEPS\.map/)
  assert.match(reasonPanel, /Select Reason/)
})

test("reason helpers normalize ids and identify dedicated service schedules", () => {
  assert.equal(normalizeReasonId(" 3 "), 3)
  assert.equal(normalizeReasonId("abc"), "")
  assert.equal(normalizeReasonId(null), "")
  assert.equal(isReasonSelected("2"), true)
  assert.equal(isReasonSelected(0), false)

  assert.equal(findReason(REASONS, "3")?.description, "Dental Service")
  assert.equal(findReason(REASONS, 99), null)
  assert.equal(isDedicatedReason(REASONS, 3), true)
  assert.equal(isDedicatedReason(REASONS, 1), false)
})

test("dedicated detection tolerates a partially migrated reasons payload", () => {
  const partial = [
    { reason_id: 1, description: "Consultation" },
    { reason_id: 14, description: "Dental Service" },
  ]

  assert.equal(reasonUsesDedicatedSchedule(partial[1]), true)
  assert.equal(isDedicatedReason(partial, 14), true)
  assert.equal(reasonUsesDedicatedSchedule(partial[0]), false)
  assert.deepEqual(
    availabilityDates({
      reason: partial[1],
      schedule: [{ working_date: "2026-11-27", is_enabled: true }],
      minDate: new Date(2026, 10, 25),
    }),
    { restricted: true, dates: ["2026-11-27"] }
  )
})

test("changing reason clears date-based state and restarts the flow", () => {
  assert.deepEqual(clearOnReasonChange(), {
    selectedDate: null,
    selectedTime: null,
    slots: [],
    slotsStatus: "idle",
    availableDates: null,
  })

  assert.match(bookingPage, /const cleared = clearOnReasonChange\(\);/)
  assert.match(bookingPage, /setSelectedDate\(cleared\.selectedDate\)/)
  assert.match(bookingPage, /setSelectedTime\(cleared\.selectedTime\)/)
  assert.match(bookingPage, /setSlots\(cleared\.slots\)/)
  assert.match(bookingPage, /setScheduleRows\(cleared\.availableDates\)/)
  assert.match(bookingPage, /setStep\(1\)/)
})

test("dedicated reasons expose only their enabled schedule dates", () => {
  const minDate = new Date(2026, 10, 25)
  const schedule = [
    { working_date: "2026-11-24", is_enabled: true },
    { working_date: "2026-11-26T00:00:00", is_enabled: true },
    { working_date: "2026-11-27", is_enabled: true },
    { working_date: "2026-11-28", is_enabled: true },
    { working_date: "2026-11-28", is_enabled: true },
    { working_date: "2026-11-29", is_enabled: false },
  ]

  const general = availabilityDates({ reason: REASONS[0], schedule, minDate })
  assert.deepEqual(general, { restricted: false, dates: null })

  const dental = availabilityDates({ reason: REASONS[2], schedule, minDate })
  assert.deepEqual(dental, { restricted: true, dates: ["2026-11-26", "2026-11-27", "2026-11-28"] })

  assert.deepEqual(
    availabilityDates({ reason: REASONS[2], schedule: [], minDate }),
    { restricted: true, dates: [] }
  )
})

test("step gating requires the reason before date, time, summary, or confirm", () => {
  assert.equal(canProceed(1, { reasonId: 3 }), true)
  assert.equal(canProceed(1, { reasonId: "" }), false)
  assert.equal(canProceed(2, { reasonId: 3, date: new Date() }), true)
  assert.equal(canProceed(2, { reasonId: "", date: new Date() }), false)
  assert.equal(canProceed(3, { reasonId: 3, date: new Date(), time: "09:00" }), true)
  assert.equal(canProceed(4, { reasonId: 3, date: new Date(), time: "" }), false)
  assert.equal(canProceed(5, {}), false)
  assert.equal(canProceed(99, { reasonId: 3, date: new Date(), time: "09:00" }), false)
})

test("summary and confirm use the selected reason label", () => {
  const date = new Date(2026, 10, 26)
  const summary = summarizeSelection({
    reasons: REASONS,
    reasonId: "3",
    date,
    time: "09:00 - 10:00",
  })

  assert.deepEqual(summary, {
    reasonId: 3,
    reasonLabel: "Dental Service",
    date,
    time: "09:00 - 10:00",
  })

  assert.match(bookingPage, /reason=\{summary\.reasonLabel\}/)
})

test("booking payload carries the selected reason for every reason option", () => {
  const date = new Date(2026, 10, 26)
  for (const reason of REASONS) {
    const payload = buildAppointmentPayload({
      studentId: "202311330",
      slot: { id: 7, slot_start: "10:00" },
      reason,
      selectedDate: date,
    })

    assert.equal(payload.reason_id, reason.reason_id)
    assert.equal(payload.purpose, reason.description)
    assert.equal(payload.appointment_date, "2026-11-26")
    assert.equal(payload.appointment_time, "10:00")
    assert.equal("rescheduled_id" in payload, false)
  }
})

test("student page loads reason-scoped schedules, availability, and slots", () => {
  assert.match(bookingPage, /referenceApi\s*\.reasons\(\)/)
  assert.match(bookingPage, /dedicatedSchedule = isDedicatedReason\(reasonList, reasonId\)/)
  assert.match(bookingPage, /clinicScheduleApi\s*\.list\(\{ reason_id: normalizeReasonId\(reasonId\) \}\)/)
  assert.match(bookingPage, /availabilityDates\(\{[\s\S]*?reason: reasonRecord,[\s\S]*?schedule: scheduleRows,[\s\S]*?minDate: tomorrow/)
  assert.match(bookingPage, /availableDates=\{availableDates\}/)
  assert.match(bookingPage, /appointmentsApi\s*\.slots\(slotsDate, slotsReasonId\)/)
  assert.match(
    bookingPage,
    /step === 1[\s\S]*?SelectReasonPanel[\s\S]*?step === 2[\s\S]*?SelectDateCalendar[\s\S]*?step === 3[\s\S]*?SelectTimeSlots/
  )
})

test("API sends reason_id only when a reason is selected", () => {
  assert.match(apiSource, /slots: \(date, reasonId, opts\) =>/)
  assert.match(apiSource, /reason_id: reasonId/)
  assert.match(apiSource, /reasonId === undefined \|\| reasonId === null \|\| reasonId === ''/)
})

test("calendar can restrict dates to a reason's available schedule", () => {
  assert.match(dateCalendar, /availableDates = null/)
  assert.match(dateCalendar, /availableSet = Array\.isArray\(availableDates\)/)
  assert.match(dateCalendar, /availableSet\.has\(toYMD\(d\)\)/)
})

test("admin schedule panel lists and saves schedules per appointment reason", () => {
  assert.match(schedulePanel, /referenceApi\s*\.reasons\(\)/)
  assert.match(schedulePanel, /const \[reasonScope, setReasonScope\] = useState\(GENERAL_SCOPE\)/)
  assert.match(schedulePanel, /reason_id: scopeReasonId/)
  assert.match(schedulePanel, /scopeIsReasonSpecific = scopeReasonId !== null/)
  assert.match(schedulePanel, /toTimeInput\(saved\.work_start/)
  // The admin filter is literal for every reason; only student booking
  // consults uses_dedicated_schedule.
  assert.doesNotMatch(schedulePanel, /uses_dedicated_schedule/)
})

test("admin logbook and dashboard reason filters come from the shared reason list", () => {
  assert.match(logbookPanel, /reasonRecords\.map\(\(r\) => r\.description\)/)
  assert.match(logbookFullPanel, /reasonRecords\.map\(\(r\) => \(\{/)
  assert.match(logbookFullPanel, /label: r\.description/)
  // Dashboard's AppointmentsPanel previously derived reasons only from slots,
  // which hid Dental Service until its first appointment existed.
  assert.match(appointmentsPanel, /\(reasonRecords \|\| \[\]\)\.forEach/)
  assert.match(appointmentsPanel, /values\.add\(description\)/)
})
