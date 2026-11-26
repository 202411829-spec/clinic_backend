import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/components/auth/ForgotPasswordForm.jsx', 'utf8')

function extractBlock(startPattern) {
  const match = source.match(startPattern)
  assert.ok(match, `expected to find ${startPattern}`)
  return match[0]
}

const codeSentHelper = extractBlock(/function codeSentMessage\([\s\S]*?\n\}/)
const emailHandler = extractBlock(/async function handleEmailSubmit\(e\) \{[\s\S]*?\n  \}/)
const resendHandler = extractBlock(/async function handleResend\(\) \{[\s\S]*?\n  \}/)

test('student forgot success wording confirms the code instead of saying "if an account exists"', () => {
  assert.match(codeSentHelper, /variant === 'student'/)
  assert.match(
    codeSentHelper,
    /const subject = isResend \? 'A new 6-digit code' : 'A 6-digit code'/
  )
  assert.match(codeSentHelper, /return `\$\{subject\} is on its way to \$\{target\}/)
  assert.match(
    codeSentHelper,
    /return `If an account exists, \$\{subject\} is on its way to \$\{target\}/,
    'admin wording must remain generic'
  )
})

test('student forgot advances only after sendCode resolves successfully', () => {
  const sendIndex = emailHandler.indexOf('await forgotApi.sendCode(target)')
  const infoIndex = emailHandler.indexOf('setInfo(codeSentMessage(target, variant))')
  const cooldownIndex = emailHandler.indexOf('setResendCooldown(RESEND_COOLDOWN_SECONDS)')
  const stepIndex = emailHandler.indexOf('setStep(2)')
  const catchIndex = emailHandler.indexOf('} catch (err) {')

  assert.ok(sendIndex > 0, 'email handler must call sendCode')
  assert.ok(infoIndex > sendIndex, 'success info must follow a successful sendCode')
  assert.ok(cooldownIndex > infoIndex, 'cooldown starts only after success')
  assert.ok(stepIndex > cooldownIndex, 'verification step starts only after success')
  assert.ok(catchIndex > stepIndex, 'failure handling must not run on the success path')
  assert.ok(
    !emailHandler.slice(catchIndex).includes('setStep(2)'),
    'send failure must keep the student on the email step'
  )
  assert.ok(
    !emailHandler.slice(catchIndex).includes('setResendCooldown('),
    'send failure must not start the cooldown'
  )
  assert.match(
    emailHandler.slice(catchIndex),
    /friendlyForgotEmailError\(err, 'Could not verify this email\. Please try again\.'\)/,
    'backend error message must be shown to the student'
  )
})

test('student forgot resend still gates on cooldown and clears loading state', () => {
  assert.match(
    resendHandler,
    /if \(resendCooldown > 0 \|\| isBusy \|\| sendInFlightRef\.current\) return/
  )
  assert.match(resendHandler, /await forgotApi\.sendCode\(target\)/)
  assert.match(resendHandler, /setInfo\(codeSentMessage\(target, variant, true\)\)/)
  assert.match(resendHandler, /setResendCooldown\(RESEND_COOLDOWN_SECONDS\)/)
  assert.match(resendHandler, /finally \{[\s\S]*finishCodeSend\(\)/)
})
