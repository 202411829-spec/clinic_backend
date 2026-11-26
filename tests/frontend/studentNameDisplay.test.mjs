import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  formatDisplayName,
  formatMiddleInitial,
  formatStudentNaturalName,
} from "../../src/lib/format.js"
import { adaptStudent } from "../../src/lib/studentProfileAdapter.js"
import { adaptStudentProfile } from "../../src/lib/studentAdapter.js"

const PROFILE = {
  student_id: "202311330",
  first_name: "Juan",
  middle_initial: "B",
  last_name: "Doe",
  suffix: null,
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

test("middle initial formatting is idempotent and preserves full middle names", () => {
  assert.equal(formatMiddleInitial("B"), "B.")
  assert.equal(formatMiddleInitial("B."), "B.")
  assert.equal(formatMiddleInitial("B......"), "B.")
  assert.equal(formatMiddleInitial("Daniel"), "Daniel.")
  assert.equal(formatMiddleInitial("Daniel."), "Daniel.")
  assert.equal(formatMiddleInitial(""), "")
  assert.equal(formatMiddleInitial(null), "")
})

test("student record display collapses legacy dotted middle initials", () => {
  const profile = { ...PROFILE, middle_initial: "B......" }

  const student = adaptStudent(profile, null)
  assert.equal(student.name, "Doe, Juan B.")
  assert.equal(formatDisplayName(student.name), "Juan B. Doe")

  const adminStudent = adaptStudentProfile(profile, null)
  assert.equal(adminStudent.name, "Doe, Juan B.")

  assert.equal(formatDisplayName("Doe, Juan B......"), "Juan B. Doe")
})

test("profile header and student record use the normalized display helpers", () => {
  assert.equal(formatStudentNaturalName("Juan", "B......", "Doe"), "Juan B. Doe")

  const layout = readFileSync("src/layouts/StudentLayout.jsx", "utf8")
  const studentRecord = readFileSync("src/components/student/StudentRecordPanel.jsx", "utf8")

  assert.match(layout, /formatStudentNaturalName\(/)
  assert.match(studentRecord, /formatDisplayName\(student\.name\)/)
})
