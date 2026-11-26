import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lightweight source-contract checks: there is no DOM test library installed,
// so these assert on the source itself instead of rendered markup.
const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

const STUDENT_RESET_PAGE = 'src/pages/auth/ForgotPassword.jsx'
const ADMIN_RESET_PAGE = 'src/pages/auth/AdminForgotPassword.jsx'
const RESET_FORM = 'src/components/auth/ForgotPasswordForm.jsx'
const STUDENT_LOGIN_PAGE = 'src/pages/auth/StudentLogin.jsx'
const ADMIN_LOGIN_PAGE = 'src/pages/auth/AdminLogin.jsx'
const STUDENT_LOGIN_FORM = 'src/components/auth/StudentLoginForm.jsx'

function extractClassConst(source, name, fileLabel) {
  const match = source.match(new RegExp(`const ${name} =\\s*'([^']+)'`))
  assert.ok(match, `${fileLabel} should declare const ${name} with a quoted class string`)
  return match[1]
}

function assertSignUpLayoutContract(source, label) {
  assert.match(source, /import SignUpLayout from/, `${label} should import SignUpLayout`)
  assert.match(source, /<SignUpLayout[\s>]/, `${label} should render SignUpLayout as its shell`)
  assert.ok(!source.includes('AuthShell'), `${label} should no longer use AuthShell`)
  assert.ok(
    source.includes('showHeader={false}'),
    `${label} should pass showHeader={false} so the layout owns the portal label/title/subtitle`
  )
}

test('student reset page uses SignUpLayout instead of AuthShell', () => {
  assertSignUpLayoutContract(read(STUDENT_RESET_PAGE), 'Student reset page')
})

test('admin reset page replaces its inline shell with SignUpLayout', () => {
  const source = read(ADMIN_RESET_PAGE)
  assertSignUpLayoutContract(source, 'Admin reset page')
  assert.ok(!source.includes('min-h-screen'), 'Admin reset page should not duplicate the shell markup')
  assert.ok(
    !source.includes('rounded-tl-[5rem]'),
    'Admin reset page should not duplicate the split-screen shell markup'
  )
})

test('reset form exposes showHeader so the layout owns the header block', () => {
  const source = read(RESET_FORM)
  assert.match(source, /showHeader\s*=\s*true/, 'form should default showHeader to true')
  assert.ok(
    source.includes('{showHeader &&'),
    'form should render its portal label/title/subtitle only when showHeader is set'
  )
})

test('reset form keeps its three-step indicator', () => {
  const source = read(RESET_FORM)
  const steps = source.match(/const STEPS = \[([\s\S]*?)\]/)
  assert.ok(steps, 'form should keep the STEPS constant')
  const ids = steps[1].match(/id:\s*\d+/g) ?? []
  assert.equal(ids.length, 3, 'form should keep exactly three steps')
  assert.match(steps[1], /label:\s*'Email'/)
  assert.match(steps[1], /label:\s*'Verify'/)
  assert.match(steps[1], /label:\s*'Password'/)
})

test('reset form controls match the Student Login control classes', () => {
  const form = read(RESET_FORM)
  const login = read(STUDENT_LOGIN_FORM)

  assert.equal(
    extractClassConst(form, 'inputClass', 'Reset form'),
    extractClassConst(login, 'inputClass', 'StudentLoginForm'),
    'reset inputs should use the same input class as the Student Login form'
  )
  assert.equal(
    extractClassConst(form, 'primaryBtnClass', 'Reset form'),
    extractClassConst(login, 'primaryBtnClass', 'StudentLoginForm'),
    'reset submit button should use the same primary button class as the Student Login form'
  )
  assert.ok(
    form.includes('mt-6 space-y-4'),
    'reset form should use login-like form spacing (mt-6 space-y-4)'
  )
  assert.ok(!form.includes('py-3.5'), 'reset inputs should no longer use the larger py-3.5 padding')
  assert.ok(
    (form.match(/\binputClass\b/g) ?? []).length >= 4,
    'email/password/confirm inputs should reuse the shared inputClass constant'
  )
})

test('reset pages keep their redirect targets and admin variant', () => {
  const student = read(STUDENT_RESET_PAGE)
  const admin = read(ADMIN_RESET_PAGE)
  assert.ok(student.includes("navigate('/student/login'"), 'student reset should return to student login')
  assert.ok(admin.includes("navigate('/admin/login'"), 'admin reset should return to admin login')
  assert.ok(admin.includes('variant="admin"'), 'admin reset should keep the admin form variant')
})

test('reset form keeps its verification and password flow', () => {
  const form = read(RESET_FORM)
  for (const marker of [
    'forgotApi.checkEmail',
    'forgotApi.sendCode',
    'forgotApi.reset',
    'handleResend',
    'validatePassword',
    'PasswordStrengthMeter',
    'friendlyPasswordError',
  ]) {
    assert.ok(form.includes(marker), `reset form should keep ${marker}`)
  }
})

test('login source-of-truth files keep the frozen layout contract', () => {
  const studentLogin = read(STUDENT_LOGIN_PAGE)
  const adminLogin = read(ADMIN_LOGIN_PAGE)
  const loginForm = read(STUDENT_LOGIN_FORM)

  assert.match(studentLogin, /import SignUpLayout from/, 'StudentLogin should keep using SignUpLayout')
  assert.match(adminLogin, /import SignUpLayout from/, 'AdminLogin should keep using SignUpLayout')
  assert.ok(
    !studentLogin.includes('AuthShell') && !adminLogin.includes('AuthShell'),
    'login pages should not use AuthShell'
  )
  assert.ok(loginForm.includes('mt-6 space-y-4'), 'StudentLoginForm should keep its form spacing')
  assert.ok(loginForm.includes('py-3 text-sm'), 'StudentLoginForm should keep its input sizing')
  assert.ok(loginForm.includes('hover:bg-gc-green-800'), 'StudentLoginForm should keep its button hover')
})
