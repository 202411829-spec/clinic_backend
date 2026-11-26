import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSafeProfilePatch } from '../../src/lib/studentProfileEditPayload.js'

const PAYLOAD = {
  first_name: 'Juan',
  emergency_contact: { contact_name: 'Maria' },
  medical_history: { has_asthma: true },
}

test('buildSafeProfilePatch preserves medical sections when summary is loaded', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true), PAYLOAD)
})

test('buildSafeProfilePatch omits medical sections when summary is unavailable', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false), {
    first_name: 'Juan',
  })
})

test('buildSafeProfilePatch adds consent only when explicitly requested', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, false), PAYLOAD)
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, false), {
    first_name: 'Juan',
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, true), {
    ...PAYLOAD,
    data_privacy_consent: true,
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, true), {
    first_name: 'Juan',
    data_privacy_consent: true,
  })
})

test('edit form restores persisted department/course IDs and submits numeric IDs', () => {
  const modal = readFileSync('src/components/student/EditStudentInfoModal.jsx', 'utf8')
  const profileEdit = readFileSync('src/pages/student/ProfileEdit.jsx', 'utf8')
  const panel = readFileSync('src/components/student/StudentRecordPanel.jsx', 'utf8')

  assert.match(modal, /const deptId = student\.departmentId \?\? student\.department_id \?\? ""/)
  assert.match(modal, /departmentId: deptId \? String\(deptId\)/)
  assert.match(modal, /courseId: courseId \? String\(courseId\)/)
  assert.match(modal, /payload\.department_id = Number\(form\.departmentId\)/)
  assert.match(modal, /payload\.course_id = Number\(form\.courseId\)/)
  assert.match(modal, /String\(d\.department_id\) === String\(deptId\)/)
  assert.match(modal, /String\(c\.course_id\) === String\(courseId\)/)
  assert.match(
    modal,
    /coursesProp\.some\([\s\S]*String\(c\.course_id\) === String\(form\.courseId\)/
  )
  assert.match(profileEdit, /String\(d\.department_id\) === String\(profile\.department_id\)/)
  assert.match(panel, /String\(d\.department_id\) === String\(student\.departmentId\)/)
})
