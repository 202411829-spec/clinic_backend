import { useEffect, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../ui/icons.jsx'
import { forgotApi } from '../../lib/api.js'
import { friendlyPasswordError } from '../../lib/authPasswordErrors.js'
import { friendlyForgotEmailError } from '../../lib/forgotPasswordErrors.js'
import { FORGOT_PASSWORD_VARIANTS } from '../../lib/forgotPasswordVariants.js'
import { validatePassword } from '../../lib/passwordPolicy.js'
import PasswordStrengthMeter from './PasswordStrengthMeter.jsx'

const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Password' },
]

const RESEND_COOLDOWN_SECONDS = 60

function codeSentMessage(target, variant, isResend = false) {
  const arrival = 'It may take a minute to arrive; check spam if needed.'
  if (variant === 'student') {
    const subject = isResend ? 'A new 6-digit code' : 'A 6-digit code'
    return `${subject} is on its way to ${target}. ${arrival}`
  }
  const subject = isResend ? 'a new 6-digit code' : 'a 6-digit code'
  return `If an account exists, ${subject} is on its way to ${target}. ${arrival}`
}

// Shared control classes, kept identical to StudentLoginForm so the reset
// flow reads as the same product as the login screen.
const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20'

const primaryBtnClass =
  'btn-press w-full rounded-xl bg-gc-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

/**
 * Multi-step "forgot password" form, reused by both the Student and Admin
 * portals via the `variant` prop.
 *
 * Step 1: collect the email/username, validate the request
 *         (POST /api/auth/forgot/check-email), then trigger a 6-digit code
 *         email (POST /api/auth/forgot/send-code). The student endpoint reports
 *         a missing account explicitly; admin keeps the generic response.
 * Step 2: let the user paste the 6-digit code they received.
 * Step 3: collect + confirm a new password, then reset the account
 *         (POST /api/auth/forgot/reset). On success the parent redirects
 *         the user to the login screen.
 *
 * `onSuccess()` is called after the backend confirms the reset succeeded,
 * once a short success message has been shown, so the page can route the
 * user to the login screen.
 *
 * Pass `showHeader={false}` when the surrounding shell (SignUpLayout) already
 * renders the portal label, title and subtitle, so they are not duplicated.
 */
export default function ForgotPasswordForm({
  variant = 'student',
  align = 'left',
  showHeader = true,
  onSuccess,
  loading = false,
  error = '',
}) {
  const cfg = FORGOT_PASSWORD_VARIANTS[variant] ?? FORGOT_PASSWORD_VARIANTS.student

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
  const [done, setDone] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const sendInFlightRef = useRef(false)

  const isCentered = align === 'center'
  const isBusy = busy || loading

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

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
    const emailError = cfg.validateEmail(email)
    if (emailError) {
      setFieldError(emailError)
      return
    }
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      const target = cfg.normalizeEmail(email.trim())
      setEmail(target)
      await forgotApi.checkEmail(target)
      await forgotApi.sendCode(target)
      setInfo(codeSentMessage(target, variant))
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setStep(2)
    } catch (err) {
      setFieldError(
        friendlyForgotEmailError(err, 'Could not verify this email. Please try again.')
      )
    } finally {
      finishCodeSend()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isBusy || sendInFlightRef.current) return
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      const target = cfg.normalizeEmail(email.trim())
      setEmail(target)
      await forgotApi.sendCode(target)
      setInfo(codeSentMessage(target, variant, true))
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setFieldError(
        friendlyForgotEmailError(err, 'Could not resend the code. Please try again.')
      )
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
    const pwError = validatePasswordFields()
    if (pwError) {
      setFieldError(pwError)
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const target = cfg.normalizeEmail(email.trim())
      await forgotApi.reset({
        email: target,
        code,
        password,
        confirmPassword,
      })
      setDone(true)
      setInfo('')
      // Let the success message breathe, then hand off to the page to redirect.
      setTimeout(() => onSuccess?.(), 1500)
    } catch (err) {
      const message = friendlyPasswordError(err, 'Could not reset your password. Please try again.')
      // If the backend rejected the code, send the user back to re-enter it.
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

  if (done) {
    return (
      <div className="mt-6 w-full text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gc-green-700/10">
          <svg className="h-8 w-8 text-gc-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-gc-green-700">Password reset</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          Your password has been updated. Redirecting you to the login page…
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handlePasswordSubmit}
      className="mt-6 space-y-4"
    >
      {showHeader && (
        <div className={isCentered ? 'text-center' : 'text-left'}>
          <p className={`text-xs font-bold tracking-[0.15em] ${cfg.textAccent} uppercase`}>
            {cfg.portalLabel}
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-gc-green-700">
            Reset your password
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            {cfg.subtitle}
          </p>
        </div>
      )}

      {/* Step indicator */}
      <ol className="flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = s.id === step
          const doneStep = s.id < step
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active || doneStep ? `${cfg.bgAccent} text-white` : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {s.id}
              </span>
              <span className={`text-xs font-semibold ${active || doneStep ? 'text-gc-green-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {idx < STEPS.length - 1 && (
                <span className={`h-0.5 flex-1 ${doneStep ? cfg.bgAccent : 'bg-gray-100'}`} />
              )}
            </li>
          )
        })}
      </ol>

      <div className="space-y-4">
        {step === 1 && (
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              {cfg.emailLabel}
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError('')
              }}
              placeholder={cfg.emailPlaceholder}
              className={inputClass}
            />
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="forgot-code" className="block text-sm font-semibold text-gray-900 mb-1.5">
                6-digit code
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setFieldError('')
                  setInfo('')
                }}
                className={`mb-1.5 text-xs font-semibold ${cfg.textAccent} ${cfg.hoverAccent}`}
              >
                Change email
              </button>
            </div>
            <input
              id="forgot-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-[22px] tracking-[0.5em] text-gray-900 shadow-sm placeholder:text-gray-300 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20"
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy || resendCooldown > 0}
              className={`mt-2 text-xs font-semibold ${cfg.textAccent} ${cfg.hoverAccent} disabled:opacity-60`}
            >
              {sendingCode
                ? 'Sending code…'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
            </button>
          </div>
        )}

        {step === 3 && (
          <>
            <div>
              <label htmlFor="forgot-password" className="block text-sm font-semibold text-gray-900 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="forgot-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="12+ characters"
                  aria-describedby="forgot-password-strength"
                  className={`${inputClass} pr-11`}
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
              <PasswordStrengthMeter id="forgot-password-strength" check={passwordCheck} password={password} />
            </div>

            <div>
              <label htmlFor="forgot-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="forgot-confirm"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
          </>
        )}
      </div>

      {info && !message ? (
        <p className="text-sm font-medium text-gc-green-700 animate-fade-in-up">{info}</p>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm font-medium text-red-600 animate-fade-in-up">
          {message}
        </p>
      ) : null}

      <button type="submit" disabled={isBusy} className={primaryBtnClass}>
        {step === 1
          ? (sendingCode ? 'Sending code…' : isBusy ? 'Loading…' : 'Continue')
          : isBusy
            ? (step === 2 ? 'Verifying…' : 'Resetting password…')
            : step === 2
              ? 'Verify code'
              : 'Reset password'}
      </button>

      {step > 1 && !isBusy && (
        <button
          type="button"
          onClick={() => {
            setStep((s) => s - 1)
            setFieldError('')
            setInfo('')
          }}
          className="w-full text-center text-sm font-semibold text-gray-500 hover:text-gc-green-700"
        >
          Back
        </button>
      )}

      <p className="text-center text-sm text-gray-600">
        Remembered it?{' '}
        <a href={cfg.loginPath} className={`font-semibold ${cfg.textAccent} ${cfg.hoverAccent}`}>
          Log in
        </a>
      </p>
    </form>
  )
}
