import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptStudent } from '../../src/lib/studentProfileAdapter.js'

const PROFILE = {
  student_id: '202311330',
  first_name: 'Juan',
  middle_initial: 'A',
  last_name: 'Doe',
  birth_date: '2003-07-15',
  gender: 'Male',
  civil_status: 'Single',
  contact_number: '09171234567',
  present_address: 'Campus',
  year_level: 'IV',
  course_name: 'BSIT',
  department_name: 'CCS',
  department_id: 3,
  course_id: 9,
  photo: null,
}

test('adaptStudent renders basic profile fields before medical summary arrives', () => {
  const student = adaptStudent(PROFILE, null)

  assert.equal(student.studentId, '202311330')
  assert.equal(student.name, 'Doe, Juan A.')
  assert.equal(student.course, 'BSIT')
  assert.equal(student.emergencyContact.name, '-')
  assert.deepEqual(student.medicalConditions, [])
  assert.equal(student.previousOperation.procedure, '-')
})

test('adaptStudent applies emergency contact and medical history when summary arrives', () => {
  const student = adaptStudent(PROFILE, {
    emergency_contact: {
      contact_name: 'Maria Doe',
      relationship: 'Mother',
      contact_number: '09180000000',
      present_address: 'Town',
    },
    medical_history: {
      has_asthma: true,
      has_diabetes: false,
      operation_date: '2020-03-08',
      operation_procedure: 'Appendectomy',
    },
  })

  assert.equal(student.emergencyContact.name, 'Maria Doe')
  assert.equal(student.emergencyContact.contactNumber, '09180000000')
  assert.deepEqual(student.medicalConditions, ['has_asthma'])
  assert.equal(student.previousOperation.date, '03/08/2020')
  assert.equal(student.previousOperation.procedure, 'Appendectomy')
  assert.equal(student.name, 'Doe, Juan A.')
})
