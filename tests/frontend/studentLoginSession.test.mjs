import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lightweight source-contract checks: this repo has no DOM test library, so
// these guard the auth/session behavior that is otherwise easy to regress.
const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

const STUDENT_LOGIN = 'src/pages/auth/StudentLogin.jsx'
const STUDENT_LOGIN_FORM = 'src/components/auth/StudentLoginForm.jsx'
const AUTH_ERRORS = 'src/lib/authSignInErrors.js'
const API = 'src/lib/api.js'
const PROTECTED_ROUTE = 'src/router/ProtectedRoute.jsx'
const AUTH_CONTEXT = 'src/context/AuthContext.jsx'
const SUPABASE_CLIENT = 'src/lib/supabaseClient.js'

test('student login clears stale session before attempting a fresh sign-in', () => {
  const source = read(STUDENT_LOGIN)

  assert.match(source, /import \{ supabase, studentSignIn \}/)
  assert.match(source, /supabase\.auth\.signOut\(\)\.catch\(\(\) => \{\}\)/)
  assert.match(source, /await studentSignIn\(username, password\)/)
})

test('student login confirms a live session before navigating to dashboard', () => {
  const source = read(STUDENT_LOGIN)

  assert.match(source, /supabase\.auth\.getSession\(\)/)
  assert.match(source, /session\?\.access_token/)
  assert.match(source, /Sign-in did not establish an active session/)
  assert.match(source, /navigate\('\/student\/dashboard', \{ replace: true \}\)/)
})

test('student login rejects a verified session for a different account', () => {
  const source = read(STUDENT_LOGIN)

  assert.match(source, /session\.user\?\.email/)
  assert.match(source, /expectedEmail/)
  assert.match(source, /signedInEmail !== expectedEmail/)
  assert.match(source, /You were signed in with a different account/)
})

test('failed student login stays on the page with a friendly Supabase error', () => {
  const source = read(STUDENT_LOGIN)

  assert.match(source, /friendlySignInError/)
  assert.match(source, /setError\(friendlySignInError\(err\)\)/)
  assert.ok(
    !source.includes("navigate('/student/dashboard')\n"),
    'navigation to the dashboard must not be unconditional after sign-in'
  )

  const errors = read(AUTH_ERRORS)
  assert.match(errors, /export function friendlySignInError/)
  assert.match(errors, /Incorrect student ID or password\. Please try again\./)
  assert.match(errors, /Please confirm your school email before signing in\./)
  assert.match(errors, /Too many sign-in attempts/)
})

test('student login form blocks empty passwords before calling Supabase', () => {
  const source = read(STUDENT_LOGIN_FORM)

  assert.match(source, /if \(!password\)/)
  assert.match(source, /Enter your password\./)
  assert.match(source, /onSubmit\?\.\(\{ username, password \}\)/)
})

test('protected API requests refresh near-expiry Supabase tokens before sending them', () => {
  const source = read(API)

  assert.match(source, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.match(source, /expires_at \* 1000 <= Date\.now\(\) \+ 10_000/)
  assert.match(source, /await refreshSessionOnce\(\)/)
  assert.match(source, /return refreshed\.session\.access_token/)
})

test('final 401 clears cached data and stale session instead of leaving the page loading', () => {
  const source = read(API)

  assert.match(source, /if \(response\.status === 401\)/)
  assert.match(source, /if \(!_retried\)/)
  assert.match(source, /clearApiCache\(\)/)
  assert.match(source, /supabase\??\.auth\.signOut\(\)\.catch\(\(\) => \{\}\)/)
  assert.match(source, /window\.location\.replace/)
  assert.match(source, /Your session has expired\. Please sign in again\./)
})

test('protected routes wait for AuthContext session restoration', () => {
  const source = read(PROTECTED_ROUTE)

  assert.match(source, /if \(loading\)/)
  assert.match(source, /Checking your session…/)
  assert.match(source, /if \(!isAuthenticated\) return <Navigate to=\{loginPath\} replace \/>/)
})

test('student identity still comes from the verified Supabase session email', () => {
  const source = read(AUTH_CONTEXT)

  assert.match(source, /const studentId = email \? email\.split\('@'\)\[0\] : null/)
  assert.match(source, /clearApiCache\(\)/)

  const client = read(SUPABASE_CLIENT)
  assert.match(client, /value\.includes\('@'\) \? value\.toLowerCase\(\)/)
  assert.match(client, /supabase\.auth\.signInWithPassword/)
})
