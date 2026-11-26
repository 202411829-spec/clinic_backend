import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  ADMIN_LOGIN_EMAIL_EXCEPTION,
  resolveAdminLoginEmail,
} from "../../src/lib/adminLoginEmail.js"
import { adminSignIn } from "../../src/lib/supabaseClient.js"

const client = readFileSync("src/lib/supabaseClient.js", "utf8")
const adminSignUp = readFileSync("src/pages/auth/AdminSignUp.jsx", "utf8")
const adminPanel = readFileSync("src/components/admin/AdminsPanel.jsx", "utf8")

test("exact Gmail exception is preserved as the complete admin login identifier", () => {
  assert.equal(
    resolveAdminLoginEmail(ADMIN_LOGIN_EMAIL_EXCEPTION),
    "josephramos0254@gmail.com"
  )
  assert.doesNotMatch(
    resolveAdminLoginEmail(ADMIN_LOGIN_EMAIL_EXCEPTION),
    /@gordoncollege\.edu\.ph/
  )
})

test("exact Gmail exception tolerates trim/case but still preserves the canonical address", () => {
  assert.equal(
    resolveAdminLoginEmail("  JOSEPHRAMOS0254@GMAIL.COM  "),
    "josephramos0254@gmail.com"
  )
})

test("normal Gordon username still receives the institutional domain", () => {
  assert.equal(
    resolveAdminLoginEmail("bautista.kenneth"),
    "bautista.kenneth@gordoncollege.edu.ph"
  )
  assert.equal(
    resolveAdminLoginEmail("  Bautista.Kenneth  "),
    "Bautista.Kenneth@gordoncollege.edu.ph"
  )
})

test("other Gmail addresses do not bypass the existing domain behavior", () => {
  assert.equal(
    resolveAdminLoginEmail("other.person@gmail.com"),
    "other.person@gmail.com@gordoncollege.edu.ph"
  )
  assert.equal(
    resolveAdminLoginEmail("josephramos0255@gmail.com"),
    "josephramos0255@gmail.com@gordoncollege.edu.ph"
  )
})

test("adminSignIn passes the resolved login identifier to Supabase Auth", () => {
  assert.match(
    client,
    /import \{ resolveAdminLoginEmail \} from '\.\/adminLoginEmail\.js'/
  )
  assert.match(client, /const email = resolveAdminLoginEmail\(username\)/)
  assert.match(client, /signInWithPassword\(\{ email, password \}\)/)
  assert.doesNotMatch(client, /josephramos0254@gmail\.com/)
})

test("Supabase Auth receives the exact Gmail exception as the login email", async () => {
  let received
  const fakeClient = {
    auth: {
      signInWithPassword: async (payload) => {
        received = payload
        return { data: { user: { id: "test-admin" } }, error: null }
      },
    },
  }

  await adminSignIn(ADMIN_LOGIN_EMAIL_EXCEPTION, "TestPassword123!", fakeClient)

  assert.deepEqual(received, {
    email: "josephramos0254@gmail.com",
    password: "TestPassword123!",
  })
})

test("Supabase Auth receives the institutional email for a normal username", async () => {
  let received
  const fakeClient = {
    auth: {
      signInWithPassword: async (payload) => {
        received = payload
        return { data: { user: { id: "test-admin" } }, error: null }
      },
    },
  }

  await adminSignIn("bautista.kenneth", "TestPassword123!", fakeClient)

  assert.equal(received.email, "bautista.kenneth@gordoncollege.edu.ph")
})

test("login exception stays isolated from signup and admin management", () => {
  for (const [name, source] of [
    ["AdminSignUp", adminSignUp],
    ["AdminsPanel", adminPanel],
  ]) {
    assert.doesNotMatch(source, /adminLoginEmail/, `${name} imports login-only helper`)
    assert.doesNotMatch(source, /ADMIN_LOGIN_EMAIL_EXCEPTION/, `${name} uses login exception`)
  }
})
