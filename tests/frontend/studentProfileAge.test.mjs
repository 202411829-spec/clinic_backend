import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { computeAge } from "../../src/lib/format.js"
import { isStudentProfileComplete } from "../../src/lib/profileCompleteness.js"
import { buildSafeProfilePatch } from "../../src/lib/studentProfileEditPayload.js"

const NOW = new Date(2026, 10, 25)
const modalSource = readFileSync("src/components/student/EditStudentInfoModal.jsx", "utf8")

test("computeAge handles ISO and legacy birthdays before and after this year's birthday", () => {
  assert.equal(computeAge("2004-11-20", NOW), 22)
  assert.equal(computeAge("2004-11-26", NOW), 21)
  assert.equal(computeAge("11/20/2004", NOW), 22)
  assert.equal(computeAge("11/26/2004", NOW), 21)
})

test("Age follows Birthday changes through the form's derived value", () => {
  const before = computeAge("2004-11-20", NOW)
  const after = computeAge("2004-11-26", NOW)

  assert.equal(before, 22)
  assert.equal(after, 21)
  assert.notEqual(before, after)
  assert.match(modalSource, /const age = computeAge\(form\.birthday\)/)
  assert.match(modalSource, /onChange=\{\(e\) => update\(\{ birthday: e\.target\.value \}\)\}/)
})

test("computeAge returns null for empty or invalid birthdays", () => {
  for (const value of ["", "   ", null, undefined, "not-a-date", "2004-99-99", "02/31/2004"]) {
    assert.equal(computeAge(value, NOW), null, `expected null for ${JSON.stringify(value)}`)
  }
})

test("Age stays derived, read-only, non-required, and outside the PATCH payload", () => {
  const ageInput = modalSource.match(
    /<input[\s\S]*?value=\{age != null \? age : ""\}[\s\S]*?\/>/
  )?.[0]
  assert.ok(ageInput, "Age input should render the derived value")
  assert.match(ageInput, /readOnly/)
  assert.match(ageInput, /disabled/)
  assert.match(ageInput, /placeholder="—"/)

  const profile = {
    first_name: "Juan",
    last_name: "Dela Cruz",
    gender: "Male",
    birth_date: "2004-11-20",
    civil_status: "Single",
    contact_number: "09123456789",
    present_address: "Gordon College",
    department_id: 1,
    course_id: 2,
    data_privacy_consented_at: "2026-11-25T10:00:00+00:00",
  }
  assert.equal(Object.hasOwn(profile, "age"), false)
  assert.equal(
    isStudentProfileComplete({ profile, emergency_contact: { contact_name: "Maria" } }),
    true
  )

  const patch = buildSafeProfilePatch({ first_name: "Juan" }, true, false)
  assert.equal(Object.hasOwn(patch, "age"), false)

  const payloadStart = modalSource.indexOf("const payload = {")
  const payloadEnd = modalSource.indexOf("return payload;", payloadStart)
  assert.ok(payloadStart > -1 && payloadEnd > payloadStart)
  assert.doesNotMatch(modalSource.slice(payloadStart, payloadEnd), /\bage\s*:/)
})
