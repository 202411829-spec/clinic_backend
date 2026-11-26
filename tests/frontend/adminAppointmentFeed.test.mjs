import test from "node:test"
import assert from "node:assert/strict"

import { appointmentsApi, referenceApi } from "../../src/lib/api.js"
import {
  fetchAdminAppointmentSlots,
  mergeAppointmentSlots,
} from "../../src/lib/adminAppointmentFeed.js"

const REASONS = [
  { reason_id: 1, description: "Consultation" },
  { reason_id: 14, description: "Dental Service", uses_dedicated_schedule: true },
]

const GENERAL_SLOTS = [
  {
    id: 301,
    slot_id: 301,
    schedule_id: 53,
    time: "08:00 - 08:30",
    slot_start: "08:00",
    capacity: 10,
    bookings: [
      {
        id: 900,
        appointment_id: 900,
        reason: "Consultation",
        status: "Pending",
      },
    ],
  },
]

const DENTAL_SLOTS = [
  {
    id: 401,
    slot_id: 401,
    schedule_id: 52,
    time: "08:00 - 08:30",
    slot_start: "08:00",
    capacity: 5,
    bookings: [
      {
        id: 901,
        appointment_id: 901,
        reason: "Dental Service",
        status: "Pending",
      },
    ],
  },
]

function reasonsIn(slots) {
  return slots
    .flatMap((slot) => slot.bookings || [])
    .map((booking) => booking.reason)
    .sort()
}

test("merging slot feeds keeps distinct schedule blocks with the same time", () => {
  const merged = mergeAppointmentSlots(GENERAL_SLOTS, DENTAL_SLOTS)

  assert.equal(merged.length, 2)
  assert.deepEqual(reasonsIn(merged), ["Consultation", "Dental Service"])
  assert.deepEqual(
    merged.map((slot) => slot.schedule_id).sort(),
    [52, 53]
  )
  assert.equal(merged.find((slot) => slot.schedule_id === 52).booked, 1)
  assert.equal(merged.find((slot) => slot.schedule_id === 53).booked, 1)
})

test("admin feed discovers and fetches dedicated reason scopes", async () => {
  const originalSlots = appointmentsApi.slots
  const originalReasons = referenceApi.reasons
  const calls = []

  try {
    referenceApi.reasons = async () => ({ reasons: REASONS })
    appointmentsApi.slots = async (date, reasonId) => {
      calls.push([date, reasonId])
      return {
        success: true,
        slots: reasonId === 14 ? DENTAL_SLOTS : GENERAL_SLOTS,
      }
    }

    const slots = await fetchAdminAppointmentSlots("2026-11-27")

    assert.deepEqual(calls, [
      ["2026-11-27", undefined],
      ["2026-11-27", 14],
    ])
    assert.deepEqual(reasonsIn(slots), ["Consultation", "Dental Service"])
  } finally {
    appointmentsApi.slots = originalSlots
    referenceApi.reasons = originalReasons
  }
})

test("duplicate booking ids are collapsed when feeds overlap", () => {
  const duplicate = {
    ...DENTAL_SLOTS[0],
    bookings: [...DENTAL_SLOTS[0].bookings],
  }
  const merged = mergeAppointmentSlots(DENTAL_SLOTS, duplicate)

  assert.equal(merged.length, 1)
  assert.equal(merged[0].bookings.length, 1)
  assert.equal(merged[0].booked, 1)
})
