import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

import {
  getMissingProfileFields,
  isStudentProfileComplete,
} from "../../src/lib/profileCompleteness.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) =>
  readFileSync(path.join(here, "..", "..", relativePath), "utf8")

const PROFILE = {
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
}

const RECORD = {
  profile: PROFILE,
  emergency_contact: { contact_name: "Maria" },
}

test("complete record requires persistent data privacy consent", () => {
  assert.equal(isStudentProfileComplete(RECORD), true)

  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, data_privacy_consented_at: null },
    }),
    false
  )
  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, data_privacy_consented_at: undefined },
    }),
    false
  )
})

test("string department and course IDs from the edit form count as filled", () => {
  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, department_id: "3", course_id: "9" },
    }),
    true
  )
})

test("consent alone does not replace missing required fields", () => {
  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, department_id: null },
    }),
    false
  )
  assert.equal(
    isStudentProfileComplete({ profile: PROFILE }),
    false
  )
})

test("missing persistent fields are named for the user", () => {
  assert.deepEqual(getMissingProfileFields(RECORD), [])
  assert.deepEqual(
    getMissingProfileFields({
      ...RECORD,
      profile: { ...PROFILE, data_privacy_consented_at: null, department_id: "" },
      emergency_contact: null,
    }),
    ["Department", "Data privacy consent timestamp", "Emergency Contact"]
  )
})

test("profileCompleteness source names the consent timestamp", () => {
  const source = read("src/lib/profileCompleteness.js")
  assert.match(source, /"data_privacy_consented_at"|'data_privacy_consented_at'/)
})
