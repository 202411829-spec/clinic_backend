import { useEffect, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../ui/icons.jsx'
import { authApi } from '../../lib/api.js'
import { friendlyPasswordError } from '../../lib/authPasswordErrors.js'
import {
  normalizeEmail,
  validateStudentEmail,
} from '../../lib/signupValidation.js'
import { validatePassword } from '../../lib/passwordPolicy.js'
import PasswordStrengthMeter from './PasswordStrengthMeter.jsx'

const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Password' },
]

const RESEND_COOLDOWN_SECONDS = 60

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20'

const primaryBtnClass =
  'btn-press w-full rounded-xl bg-gc-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

export default function StudentSignUpForm({ onSignupSuccess, loading = false, error = '' }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [info, setInfo] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const sendInFlightRef = useRef(false)

  const isBusy = busy || loading

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  function validateEmail() {
    if (!email.trim()) return 'Please enter your email address.'
    return validateStudentEmail(email)
  }

  function beginCodeSend() {
    if (sendInFlightRef.current) return false
    sendInFlightRef.current = true
    setSendingCode(true)
    setBusy(true)
    return true
  }

  function finishCodeSend() {
    sendInFlightRef.current = false
    setSendingCode(false)
    setBusy(false)
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    const validationError = validateEmail()
    if (validationError) {
      setFieldError(validationError)
      return
    }
    const normalizedEmail = normalizeEmail(email)
    setEmail(normalizedEmail)
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      const result = await authApi.checkEmail(normalizedEmail)
      if (result && result.available === false) {
        setFieldError('That email is already registered. Try logging in instead.')
        return
      }
      if (result && result.exists === true) {
        setFieldError('That email is already registered. Try logging in instead.')
        return
      }
      await authApi.sendCode(normalizedEmail)
      setInfo(`We sent a 6-digit code to ${normalizedEmail}. It may take a minute to arrive; check spam if needed.`)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setStep(2)
    } catch (err) {
      setFieldError(err?.message || 'Could not verify this email. Please try again.')
    } finally {
      finishCodeSend()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isBusy || sendInFlightRef.current) return
    const normalizedEmail = normalizeEmail(email)
    setEmail(normalizedEmail)
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      await authApi.sendCode(normalizedEmail)
      setInfo(`We resent a 6-digit code to ${normalizedEmail}. It may take a minute to arrive; check spam if needed.`)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setFieldError(err?.message || 'Could not resend the code. Please try again.')
    } finally {
      finishCodeSend()
    }
  }

  function handleCodeChange(value) {
    setCode(value.replace(/\D/g, '').slice(0, 6))
    setFieldError('')
  }

  function handleCodeSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) {
      setFieldError('Enter the 6-digit code we sent you.')
      return
    }
    setFieldError('')
    setStep(3)
  }

  // Shared policy (12 chars, 3 of 4 groups, denylist, no email/username
  // substring…). Email context lets the validator reject personal passwords;
  // the local part is derived inside passwordPolicy.js.
  const passwordCheck = validatePassword(password, { email })

  function validatePasswordFields() {
    if (!passwordCheck.valid) return passwordCheck.message
    if (password !== confirmPassword) return 'Passwords do not match.'
    return ''
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    const passwordError = validatePasswordFields()
    if (passwordError) {
      setFieldError(passwordError)
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      await authApi.signup({
        email: normalizeEmail(email),
        code,
        password,
        confirmPassword,
      })
      onSignupSuccess?.({ email: normalizeEmail(email), password })
    } catch (err) {
      const message = friendlyPasswordError(err, 'Could not create your account. Please try again.')
      if (/code/i.test(message)) {
        setFieldError(message)
        setCode('')
        setStep(2)
      } else {
        setFieldError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const message = fieldError || error

  return (
    <>
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = s.id === step
          const done = s.id < step
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                  active || done ? 'bg-gc-green-700 text-white' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {s.id}
              </span>
              <span className={`text-xs font-semibold transition-colors duration-200 ${active || done ? 'text-gc-green-700' : 'text-gray-400'}`}>{s.label}</span>
              {idx < STEPS.length - 1 && <span className={`h-0.5 flex-1 transition-colors duration-300 ${done ? 'bg-gc-green-700' : 'bg-gray-100'}`} />}
            </li>
          )
        })}
      </ol>

      {info && !message ? <p className="mt-4 text-sm font-medium text-gc-green-700 animate-fade-in-up">{info}</p> : null}
      {message ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600 animate-fade-in-up">
          {message}
        </p>
      ) : null}

      <form
        key={step}
        noValidate
        onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handlePasswordSubmit}
        className="mt-6 space-y-4 animate-fade-in-up motion-reduce:animate-none"
      >
        {step === 1 && (
          <div>
            <label htmlFor="signup-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              Gordon College email <span className="text-red-500">*</span>
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError('')
              }}
              placeholder="@gordoncollege.edu.ph"
              className={inputClass}
            />
            <button type="submit" disabled={isBusy} className={`mt-4 ${primaryBtnClass}`}>
              {sendingCode ? 'Sending code…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="signup-code" className="block text-sm font-semibold text-gray-900 mb-1.5">
                6-digit code <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setFieldError('')
                  setInfo('')
                }}
                className="mb-1.5 text-xs font-semibold text-gc-green-700 hover:text-gc-green-800"
              >
                Change email
              </button>
            </div>
            <input
              id="signup-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              aria-required="true"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="••••••"
              className={`${inputClass} text-center text-xl tracking-[0.5em]`}
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy || resendCooldown > 0}
              className="btn-press mt-2 text-xs font-semibold text-gc-green-700 hover:text-gc-green-800 disabled:opacity-60"
            >
              {sendingCode
                ? 'Sending code…'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
            </button>
            <button type="submit" disabled={isBusy} className={`mt-4 ${primaryBtnClass}`}>
              {isBusy ? 'Verifying…' : 'Verify code'}
            </button>
          </div>
        )}

        {step === 3 && (
          <>
            <div>
              <label htmlFor="signup-password" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  aria-required="true"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="12+ characters"
                  aria-describedby="signup-password-strength"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              <PasswordStrengthMeter id="signup-password-strength" check={passwordCheck} password={password} />
            </div>

            <div>
              <label htmlFor="signup-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="signup-confirm"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  aria-required="true"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Re-enter your password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isBusy} className={primaryBtnClass}>
              {isBusy ? 'Creating account…' : 'Create account'}
            </button>
          </>
        )}

        {step > 1 && (
          <button
            type="button"
            onClick={() => {
              setStep((s) => s - 1)
              setFieldError('')
              setInfo('')
            }}
            disabled={isBusy}
            className="btn-press w-full text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
          >
            Back
          </button>
        )}
      </form>
    </>
  )
}
