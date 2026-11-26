import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeEmail,
  validateStudentEmail,
  validateAdminEmail,
  validateAdminSignupEmail,
  validateAdminInviteEmail,
  ADMIN_SIGNUP_EMAIL_EXCEPTION,
  ADMIN_INVITE_EMAIL_EXCEPTION,
} from '../../src/lib/signupValidation.js'

const STUDENT_MESSAGE =
  'Please use your official 9-digit Gordon College student email (e.g., 202311330@gordoncollege.edu.ph).'
const ADMIN_MESSAGE =
  'Please use your official Gordon College admin email (lastname.firstname@gordoncollege.edu.ph).'
const INVITE_MESSAGE = 'Please use a @gordoncollege.edu.ph email address.'

test('normalizeEmail trims whitespace and lowercases', () => {
  assert.equal(normalizeEmail('  202311330@GORDONCOLLEGE.EDU.PH  '), '202311330@gordoncollege.edu.ph')
})

test('validates supplied student email cases', () => {
  const cases = [
    ['202311330@gordoncollege.edu.ph', null],
    ['20231133@gordoncollege.edu.ph', STUDENT_MESSAGE],
    ['2023113300@gordoncollege.edu.ph', STUDENT_MESSAGE],
    ['student@gordoncollege.edu.ph', STUDENT_MESSAGE],
    ['bautista.kenneth@gordoncollege.edu.ph', STUDENT_MESSAGE],
    ['202311330@gmail.com', STUDENT_MESSAGE],
    ['202311330@GORDONCOLLEGE.EDU.PH', null],
  ]

  for (const [input, expected] of cases) {
    assert.equal(validateStudentEmail(input), expected, input)
  }
})

test('validates supplied admin email cases', () => {
  const cases = [
    ['bautista.kenneth@gordoncollege.edu.ph', null],
    ['kenneth@gordoncollege.edu.ph', ADMIN_MESSAGE],
    ['202311330@gordoncollege.edu.ph', ADMIN_MESSAGE],
    ['bautista.kenneth123@gordoncollege.edu.ph', ADMIN_MESSAGE],
    ['bautista.kenneth@gmail.com', ADMIN_MESSAGE],
    ['bautista..kenneth@gordoncollege.edu.ph', ADMIN_MESSAGE],
  ]

  for (const [input, expected] of cases) {
    assert.equal(validateAdminEmail(input), expected, input)
  }
})

test('admin validator accepts uppercase domain after normalization', () => {
  assert.equal(validateAdminEmail('  BAUTISTA.KENNETH@GORDONCOLLEGE.EDU.PH '), null)
})

test('admin signup accepts only the exact live-QA Gmail exception', () => {
  assert.equal(ADMIN_SIGNUP_EMAIL_EXCEPTION, 'josephramos0254@gmail.com')
  assert.equal(validateAdminSignupEmail('  JOSEPHRAMOS0254@GMAIL.COM  '), null)
  assert.equal(validateAdminSignupEmail('another.person@gmail.com'), ADMIN_MESSAGE)
  assert.equal(validateAdminSignupEmail('202311330@gordoncollege.edu.ph'), ADMIN_MESSAGE)
})

test('general admin validator still rejects the Gmail exception', () => {
  assert.equal(validateAdminEmail('josephramos0254@gmail.com'), ADMIN_MESSAGE)
})

test('admin invite accepts the exact Gmail exception and normal Gordon addresses', () => {
  assert.equal(ADMIN_INVITE_EMAIL_EXCEPTION, 'josephramos0254@gmail.com')
  assert.equal(ADMIN_INVITE_EMAIL_EXCEPTION, ADMIN_SIGNUP_EMAIL_EXCEPTION)
  assert.equal(validateAdminInviteEmail('josephramos0254@gmail.com'), null)
  assert.equal(validateAdminInviteEmail('  JOSEPHRAMOS0254@GMAIL.COM  '), null)
  assert.equal(validateAdminInviteEmail('ramos.joseph@gordoncollege.edu.ph'), null)
  assert.equal(validateAdminInviteEmail('clinic.staff@gordoncollege.edu.ph'), null)
  assert.equal(validateAdminInviteEmail('  CLINIC.STAFF@GORDONCOLLEGE.EDU.PH '), null)
})

test('admin invite rejects every other address while keeping the domain restriction', () => {
  const cases = [
    'another.person@gmail.com',
    'josephramos0255@gmail.com',
    'josephramos0254@gordoncollege.edu.ph.evil.com',
    'not-an-email',
    '202311330@gmail.com',
  ]
  for (const input of cases) {
    assert.equal(validateAdminInviteEmail(input), INVITE_MESSAGE, input)
  }
})

test('invite validator does not weaken the signup validator', () => {
  // The signup validator still only allows first.last Gordon addresses
  // plus its own exact exception — never the invite relaxations.
  assert.equal(validateAdminSignupEmail('staff@gordoncollege.edu.ph'), ADMIN_MESSAGE)
  assert.equal(validateAdminSignupEmail('another.person@gmail.com'), ADMIN_MESSAGE)
  assert.equal(validateAdminInviteEmail('staff@gordoncollege.edu.ph'), null)
})
