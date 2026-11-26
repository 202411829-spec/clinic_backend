import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { adaptStudent } from "../../src/lib/studentProfileAdapter.js"
import { adaptStudentProfile } from "../../src/lib/studentAdapter.js"

const PROFILE = {
  student_id: "202311330",
  first_name: "Juan",
  middle_initial: "A",
  last_name: "Doe",
  suffix: "Jr.",
  birth_date: "2003-07-15",
  gender: "Male",
  civil_status: "Single",
  contact_number: "09171234567",
  present_address: "Campus",
  year_level: "IV",
  course_name: "BSIT",
  department_name: "CCS",
  department_id: 3,
  course_id: 9,
  photo: null,
}

const STRUCTURED_EMERGENCY = {
  contact_name: "Doe, Juan A. Jr.",
  first_name: "Juan",
  middle_initial: "A",
  last_name: "Doe",
  suffix: "Jr.",
  relationship: "Brother",
  contact_number: "09180000000",
  present_address: "Town",
}

test("student profile adapts suffix and structured emergency name fields", () => {
  const student = adaptStudent(PROFILE, {
    emergency_contact: STRUCTURED_EMERGENCY,
    medical_history: {},
  })

  assert.equal(student.suffix, "Jr.")
  assert.equal(student.middleName, "A")
  assert.equal(student.emergencyContact.firstName, "Juan")
  assert.equal(student.emergencyContact.middleName, "A")
  assert.equal(student.emergencyContact.lastName, "Doe")
  assert.equal(student.emergencyContact.suffix, "Jr.")
  assert.equal(student.emergencyContact.name, "Doe, Juan A. Jr.")
  assert.equal(student.emergencyContact.legacyName, "")
})

test("admin profile adapter exposes the same suffix fields", () => {
  const student = adaptStudentProfile(PROFILE, {
    emergency_contact: STRUCTURED_EMERGENCY,
    medical_history: {},
  })

  assert.equal(student.suffix, "Jr.")
  assert.equal(student.emergencyContact.suffix, "Jr.")
  assert.equal(student.emergencyContact.lastName, "Doe")
})

test("legacy emergency names are preserved without parsing", () => {
  const student = adaptStudent(PROFILE, {
    emergency_contact: {
      contact_name: "Maria Santos",
      relationship: "Mother",
      contact_number: "09180000000",
      present_address: "Town",
    },
    medical_history: {},
  })

  assert.equal(student.emergencyContact.name, "Maria Santos")
  assert.equal(student.emergencyContact.legacyName, "Maria Santos")
  assert.equal(student.emergencyContact.firstName, "")
  assert.equal(student.emergencyContact.middleName, "")
  assert.equal(student.emergencyContact.lastName, "")
  assert.equal(student.emergencyContact.suffix, "")
})

test("edit form keeps suffix optional and submits structured names without re-parsing", () => {
  const modal = readFileSync("src/components/student/EditStudentInfoModal.jsx", "utf8")
  const completeness = readFileSync("src/lib/profileCompleteness.js", "utf8")

  assert.match(modal, /function composeContactName\(emergency\)/)
  assert.match(modal, /suffix: student\.suffix \|\| ""/)
  assert.match(modal, /suffix: form\.suffix(?:\.trim\(\))? \|\| null/)
  assert.match(modal, /first_name: ec\.firstName \|\| null/)
  assert.match(modal, /middle_initial: ec\.middleName \|\| null/)
  assert.match(modal, /last_name: ec\.lastName \|\| null/)
  assert.match(modal, /contact_name(?::|=) (?:composeContactName\(ec\)|ec\.legacyName)/)
  assert.doesNotMatch(modal, /splitName\(updated\.name\)/)
  assert.match(modal, /label="Suffix"/)
  assert.doesNotMatch(modal, /label=\{form\.emergency\.structuredName \? "Full Name/)
  assert.doesNotMatch(modal, /placeholder="Contact Person Name"/)
  assert.doesNotMatch(modal, /Optional: enter structured name parts/)

  const requiredBlock = completeness.slice(
    completeness.indexOf("REQUIRED_PROFILE_FIELDS"),
    completeness.indexOf("];", completeness.indexOf("REQUIRED_PROFILE_FIELDS"))
  )
  assert.doesNotMatch(requiredBlock, /"suffix"/)
})
