import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../icons.jsx'
import { forgotApi } from '../../lib/api.js'

const EMAIL_DOMAIN = '@gordoncollege.edu.ph'
const EMAIL_RE = /^[^\s@]+@gordoncollege\.edu\.ph$/i

const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Password' },
]

/**
 * Multi-step "forgot password" form for the Student Portal.
 *
 * Step 1: collect the Gordon College email, confirm an account exists
 *         (POST /api/auth/forgot/check-email), then trigger a 6-digit code
 *         email (POST /api/auth/forgot/send-code).
 * Step 2: let the student paste the 6-digit code they received.
 * Step 3: collect + confirm a new password, then reset the account
 *         (POST /api/auth/forgot/reset). On success the parent redirects
 *         the student to /student/login.
 *
 * `onSuccess()` is called after the backend confirms the reset succeeded,
 * once a short success message has been shown, so the page can route the
 * student to the login screen.
 */
export default function ForgotPasswordForm({ align = 'left', onSuccess, loading = false, error = '' }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [info, setInfo] = useState('')
  const [done, setDone] = useState(false)

  const isCentered = align === 'center'
  const isBusy = busy || loading

  function validateEmail() {
    if (!email.trim()) return 'Please enter your email address.'
    if (!EMAIL_RE.test(email.trim())) {
      return `Use your Gordon College email (ending in ${EMAIL_DOMAIN}).`
    }
    return ''
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    const emailError = validateEmail()
    if (emailError) {
      setFieldError(emailError)
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const result = await forgotApi.checkEmail(email.trim())
      // A 200 means an account exists. If the backend explicitly flags it as
      // missing, surface that so the student can correct the email.
      if (result && result.exists === false) {
        setFieldError('We could not find an account with that email. Check the address and try again.')
        return
      }
      await forgotApi.sendCode(email.trim())
      setInfo(`We sent a 6-digit code to ${email.trim()}.`)
      setStep(2)
    } catch (err) {
      // The backend returns 404 when no account matches the email.
      const message = err?.message || 'Could not verify this email. Please try again.'
      if (/not found|no account|404/i.test(message)) {
        setFieldError('We could not find an account with that email. Check the address and try again.')
      } else {
        setFieldError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setFieldError('')
    setBusy(true)
    try {
      await forgotApi.sendCode(email.trim())
      setInfo(`We resent a 6-digit code to ${email.trim()}.`)
    } catch (err) {
      setFieldError(err?.message || 'Could not resend the code. Please try again.')
    } finally {
      setBusy(false)
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

  function validatePassword() {
    if (!password) return 'Please enter a new password.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    return ''
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    const pwError = validatePassword()
    if (pwError) {
      setFieldError(pwError)
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      await forgotApi.reset({
        email: email.trim(),
        code,
        password,
        confirmPassword,
      })
      setDone(true)
      setInfo('')
      // Let the success message breathe, then hand off to the page to redirect.
      setTimeout(() => onSuccess?.(), 1500)
    } catch (err) {
      const message = err?.message || 'Could not reset your password. Please try again.'
      // If the backend rejected the code, send the student back to re-enter it.
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
      <div className="w-full text-center">
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
      className="w-full"
    >
      <div className={isCentered ? 'text-center' : 'text-left'}>
        <p className="text-xs font-bold tracking-[0.15em] text-gc-accent uppercase">
          Student Portal
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-gc-green-700">
          Reset your password
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          We'll send a code to your Gordon College email to verify it's you.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = s.id === step
          const doneStep = s.id < step
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active || doneStep ? 'bg-gc-accent text-white' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {s.id}
              </span>
              <span className={`text-xs font-semibold ${active || doneStep ? 'text-gc-green-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {idx < STEPS.length - 1 && (
                <span className={`h-0.5 flex-1 ${doneStep ? 'bg-gc-accent' : 'bg-gray-100'}`} />
              )}
            </li>
          )
        })}
      </ol>

      <div className="mt-7 space-y-5">
        {step === 1 && (
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              Gordon College email
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
              placeholder={`name${EMAIL_DOMAIN}`}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
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
                className="mb-1.5 text-xs font-semibold text-gc-accent hover:text-gc-green-600"
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
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center text-[22px] tracking-[0.5em] text-gray-900 shadow-sm placeholder:text-gray-300 focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy}
              className="mt-2 text-xs font-semibold text-gc-accent hover:text-gc-green-600 disabled:opacity-60"
            >
              Resend code
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
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-11 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
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
              {password.length > 0 && password.length < 8 && (
                <p className="mt-1.5 text-xs font-medium text-gray-500">
                  Use at least 8 characters.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="forgot-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm new password
              </label>
              <input
                id="forgot-confirm"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setFieldError('')
                }}
                placeholder="Re-enter your password"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
              />
            </div>
          </>
        )}
      </div>

      {info && !message ? (
        <p className="mt-4 text-sm font-medium text-gc-green-700">{info}</p>
      ) : null}

      {message ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-7 w-full rounded-xl bg-gc-accent py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-600 focus:outline-none focus:ring-2 focus:ring-gc-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy
          ? 'Please wait…'
          : step === 1
            ? 'Continue'
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
          className="mt-3 w-full text-center text-sm font-semibold text-gray-500 hover:text-gc-green-700"
        >
          Back
        </button>
      )}

      <p className="mt-5 text-center text-sm text-gray-600">
        Remembered it?{' '}
        <a href="/student/login" className="font-semibold text-gc-accent hover:text-gc-green-600">
          Log in
        </a>
      </p>
    </form>
  )
}
