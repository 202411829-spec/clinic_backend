import test from 'node:test'
import assert from 'node:assert/strict'
import { FORGOT_PASSWORD_VARIANTS } from '../../src/lib/forgotPasswordVariants.js'

const STUDENT_MESSAGE =
  'Please use your official 9-digit Gordon College student email (e.g., 202311330@gordoncollege.edu.ph).'
const ADMIN_MESSAGE =
  'Please use your official Gordon College admin email (lastname.firstname@gordoncollege.edu.ph).'
const REQUIRED_MESSAGE = 'Please enter your email address.'

test('student forgot-password variant uses the student placeholder', () => {
  assert.equal(FORGOT_PASSWORD_VARIANTS.student.emailPlaceholder, '@gordoncollege.edu.ph')
})

test('admin forgot-password variant uses the admin placeholder', () => {
  assert.equal(
    FORGOT_PASSWORD_VARIANTS.admin.emailPlaceholder,
    'lastname.firstname@gordoncollege.edu.ph'
  )
})

test('student forgot-password validator accepts only 9-digit school emails', () => {
  const validate = FORGOT_PASSWORD_VARIANTS.student.validateEmail

  assert.equal(validate('202311330@gordoncollege.edu.ph'), null)
  assert.equal(validate(' 202311330@GORDONCOLLEGE.EDU.PH '), null)

  for (const value of [
    '20231133@gordoncollege.edu.ph',
    '2023113300@gordoncollege.edu.ph',
    'student@gordoncollege.edu.ph',
    'bautista.kenneth@gordoncollege.edu.ph',
    '202311330@gmail.com',
  ]) {
    assert.equal(validate(value), STUDENT_MESSAGE, value)
  }
})

test('admin forgot-password validator accepts only lastname.firstname school emails', () => {
  const validate = FORGOT_PASSWORD_VARIANTS.admin.validateEmail

  assert.equal(validate('bautista.kenneth@gordoncollege.edu.ph'), null)
  assert.equal(validate(' BAUTISTA.KENNETH@GORDONCOLLEGE.EDU.PH '), null)

  for (const value of [
    '202311330@gordoncollege.edu.ph',
    'kenneth@gordoncollege.edu.ph',
    'bautista.kenneth123@gordoncollege.edu.ph',
    'bautista..kenneth@gordoncollege.edu.ph',
    'bautista.kenneth@gmail.com',
  ]) {
    assert.equal(validate(value), ADMIN_MESSAGE, value)
  }
})

test('forgot-password validators require a non-empty email', () => {
  assert.equal(FORGOT_PASSWORD_VARIANTS.student.validateEmail('   '), REQUIRED_MESSAGE)
  assert.equal(FORGOT_PASSWORD_VARIANTS.admin.validateEmail(''), REQUIRED_MESSAGE)
})
