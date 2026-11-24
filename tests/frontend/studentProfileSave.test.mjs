import test from "node:test"
import assert from "node:assert/strict"

import { submitStudentProfilePatch } from "../../src/lib/studentProfileSave.js"

test("submitStudentProfilePatch applies the PATCH echo before returning", async () => {
  const echo = {
    data: {
      profile: {
        first_name: "Juan",
        last_name: "Dela Cruz",
        gender: "Male",
        birth_date: "2004-02-05",
        civil_status: "Single",
        contact_number: "09123456789",
        present_address: "Gordon College",
        department_id: 1,
        course_id: 2,
        data_privacy_consented_at: "2026-11-25T10:00:00+00:00",
      },
      emergency_contact: { contact_name: "Maria" },
    },
  }
  const calls = []
  const fakeUpdate = async (studentId, payload) => {
    calls.push(["patch", studentId, payload])
    return echo
  }
  const fakeApply = (data) => calls.push(["apply", data])

  const result = await submitStudentProfilePatch(
    "202311330",
    { first_name: "Juan", data_privacy_consent: true },
    fakeApply,
    fakeUpdate
  )

  assert.equal(result.complete, true)
  assert.deepEqual(result.data, echo.data)
  assert.deepEqual(calls[0], [
    "patch",
    "202311330",
    { first_name: "Juan", data_privacy_consent: true },
  ])
  assert.deepEqual(calls[1], ["apply", echo.data])
})

test("submitStudentProfilePatch rejects a missing echo without applying it", async () => {
  let applied = false
  const fakeUpdate = async () => ({})
  const fakeApply = () => {
    applied = true
  }

  await assert.rejects(
    () => submitStudentProfilePatch("202311330", {}, fakeApply, fakeUpdate),
    /Save failed/
  )
  assert.equal(applied, false)
})

test("submitStudentProfilePatch reports incomplete records without throwing", async () => {
  const echo = {
    data: {
      profile: {
        first_name: "Juan",
        data_privacy_consented_at: null,
      },
      emergency_contact: null,
    },
  }
  const fakeUpdate = async () => echo
  const applied = []
  const result = await submitStudentProfilePatch(
    "202311330",
    {},
    (data) => applied.push(data),
    fakeUpdate
  )

  assert.equal(result.complete, false)
  assert.deepEqual(applied, [echo.data])
})
