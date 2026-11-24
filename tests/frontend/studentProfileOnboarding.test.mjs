import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) =>
  readFileSync(path.join(here, "..", "..", relativePath), "utf8")

test("router exposes the protected onboarding edit route", () => {
  const router = read("src/router/index.jsx")
  const lazyPages = read("src/router/lazyPages.js")

  assert.match(router, /path: 'profile\/edit'/)
  assert.match(router, /<P\.StudentProfileEdit \/>/)
  assert.match(lazyPages, /StudentProfileEdit = lazy\(/)
})

test("layout redirects incomplete students to the edit route", () => {
  const source = read("src/layouts/StudentLayout.jsx")

  assert.match(source, /EDIT_PATH = "\/student\/profile\/edit"/)
  assert.match(source, /location\.pathname !== EDIT_PATH/)
  assert.match(source, /<Navigate to=\{EDIT_PATH\} replace \/>/)
  assert.match(source, /checking \? \(/)
})

test("onboarding page applies completion before navigating to dashboard", () => {
  const source = read("src/pages/student/ProfileEdit.jsx")

  assert.match(source, /onboarding/)
  assert.match(source, /flushSync/)
  assert.match(source, /submitStudentProfilePatch\(/)
  assert.match(source, /applyProfile/)
  assert.match(source, /complete/)
  assert.match(source, /navigate\("\/student\/dashboard", \{ replace: true \}\)/)

  const applyIndex = source.indexOf("submitStudentProfilePatch(")
  const navigateIndex = source.indexOf('navigate("/student/dashboard"')
  assert.ok(applyIndex !== -1 && navigateIndex !== -1)
  assert.ok(applyIndex < navigateIndex)
})

test("data privacy step clears stale save errors and submits consent from the form draft", () => {
  const modal = read("src/components/student/EditStudentInfoModal.jsx")
  const page = read("src/pages/student/ProfileEdit.jsx")

  assert.match(modal, /onClearSaveError/)
  assert.match(
    modal,
    /function handleStep2Next\(\)[\s\S]*?onClearSaveError\?\.\(\)[\s\S]*?setStep\(3\)/
  )
  assert.match(page, /onClearSaveError=\{\(\) => setSaveError\(null\)\}/)

  assert.match(modal, /buildSafeProfilePatch\([\s\S]*?form\.consent/)
  assert.doesNotMatch(modal, /isStudentProfileComplete/)
  assert.doesNotMatch(page, /isStudentProfileComplete/)
})

test("login files remain free of consent storage logic", () => {
  for (const file of [
    "src/pages/auth/StudentLogin.jsx",
    "src/components/auth/StudentLoginForm.jsx",
    "src/lib/supabaseClient.js",
  ]) {
    const source = read(file)
    assert.doesNotMatch(source, /data_privacy_consent/)
    assert.doesNotMatch(source, /localStorage/)
  }
})
