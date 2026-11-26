import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const flows = {
  studentSignup: readFileSync("src/components/auth/StudentSignUpForm.jsx", "utf8"),
  adminSignup: readFileSync("src/pages/auth/AdminSignUp.jsx", "utf8"),
  forgotPassword: readFileSync("src/components/auth/ForgotPasswordForm.jsx", "utf8"),
}

test("all OTP send flows use a 60-second resend cooldown", () => {
  for (const [name, source] of Object.entries(flows)) {
    assert.match(source, /RESEND_COOLDOWN_SECONDS = 60/, name)
    assert.match(source, /const \[resendCooldown, setResendCooldown\] = useState\(0\)/, name)
    assert.match(source, /window\.setTimeout\(\(\) => setResendCooldown\(\(s\) => s - 1\), 1000\)/, name)
    assert.match(source, /setResendCooldown\(RESEND_COOLDOWN_SECONDS\)/, name)
  }
})

test("resend handlers reject duplicate or cooling-down requests", () => {
  for (const [name, source] of Object.entries(flows)) {
    assert.match(
      source,
      /if \(resendCooldown > 0 \|\| (?:isBusy|busy) \|\| sendInFlightRef\.current\) return/,
      `${name} must gate resend on cooldown and in-flight state`
    )
    assert.match(
      source,
      /disabled=\{[^\n]*resendCooldown > 0[^\n]*\}/,
      `${name} resend button must be disabled during cooldown`
    )
  }
})

test("cooling-down resend button shows a visible countdown", () => {
  for (const [name, source] of Object.entries(flows)) {
    assert.match(source, /Resend code in \$\{resendCooldown\}s/, name)
  }
})

test("OTP requests show explicit Sending code… wording", () => {
  for (const [name, source] of Object.entries(flows)) {
    assert.match(source, /const \[sendingCode, setSendingCode\] = useState\(false\)/, name)
    assert.match(source, /'Sending code…'/, name)
    assert.match(source, /sendingCode \? 'Sending code…'/, name)
    assert.doesNotMatch(source, /'Please wait…'/, name)
  }
})

test("OTP loading state resets on both success and failure paths", () => {
  for (const [name, source] of Object.entries(flows)) {
    assert.match(source, /const sendInFlightRef = useRef\(false\)/, name)
    assert.match(
      source,
      /function finishCodeSend\(\) \{[\s\S]*?setSendingCode\(false\)[\s\S]*?setBusy\(false\)/,
      `${name} must clear both loading flags`
    )
    const finallyResets = source.match(/finally \{[\s\S]{0,80}?finishCodeSend\(\)/g) || []
    assert.ok(
      finallyResets.length >= 2,
      `${name} must reset loading state in both send handlers`
    )
  }
})
