import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FORGOT_SEND_ERROR_MESSAGE,
  friendlyForgotEmailError,
} from '../../src/lib/forgotPasswordErrors.js'

test('forgot-password email errors keep backend-friendly messages unchanged', () => {
  const message = 'Could not send the verification email. Please try again later.'
  assert.equal(friendlyForgotEmailError(new Error(message)), message)
})

test('forgot-password errors preserve an explicit account-not-found message', () => {
  const message =
    'No account found with this email address. Please check your email or sign up.'
  assert.equal(friendlyForgotEmailError(new Error(message)), message)
})

test('forgot-password email errors use the supplied fallback when empty', () => {
  assert.equal(
    friendlyForgotEmailError(new Error(''), 'Could not verify this email. Please try again.'),
    'Could not verify this email. Please try again.'
  )
  assert.equal(friendlyForgotEmailError(null), FORGOT_SEND_ERROR_MESSAGE)
})

test('forgot-password email errors replace raw technical details', () => {
  for (const raw of [
    '[WinError 10061] No connection could be made because the target machine actively refused it',
    'ConnectionRefusedError: [Errno 111] Connection refused',
    'Request failed (500)',
    'Internal Server Error: SMTP connect failed',
    'The server could not complete this request. Please try again.',
  ]) {
    const result = friendlyForgotEmailError(new Error(raw))
    assert.equal(result, FORGOT_SEND_ERROR_MESSAGE, raw)
    assert.ok(!result.includes('WinError'))
    assert.ok(!result.includes('10061'))
    assert.ok(!result.includes('SMTP'))
  }
})
