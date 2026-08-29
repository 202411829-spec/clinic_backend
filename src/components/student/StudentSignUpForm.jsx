import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../icons.jsx'
import { authApi } from '../../lib/api.js'

const EMAIL_DOMAIN = '@gordoncollege.edu.ph'
const EMAIL_RE = /^[^\s@]+@gordoncollege\.edu\.ph$/i

const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Password' },
]

/**
 * Multi-step student sign-up form.
 *
 * Step 1: collect the Gordon College email and confirm it is available
 *         (POST /api/auth/check-email).
 * Step 2: trigger a 6-digit code email (POST /api/auth/send-code) and let the
 *         student paste the code they received.
 * Step 3: collect + confirm a password, then create the account
 *         (POST /api/auth/signup). On success the parent performs the
 *         auto-login (Supabase) and redirects.
 *
 * `onSignupSuccess({ email, password })` is called only after the backend
 * confirms the account was created, so the page can sign the student in and
 * route them into the first-login "complete your record" gate.
 */
export default function StudentSignUpForm({ align = 'left', onSignupSuccess, loading = false, error = '' }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [info, setInfo] = useState('')

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
      const result = await authApi.checkEmail(email.trim())
      // A 200 with no error means the email is usable. Some responses may
      // explicitly flag availability/conflict — honor those when present.
      if (result && result.available === false) {
        setFieldError('That email is already registered. Try logging in instead.')
        return
      }
      if (result && result.exists === true) {
        setFieldError('That email is already registered. Try logging in instead.')
        return
      }
      await authApi.sendCode(email.trim())
      setInfo(`We sent a 6-digit code to ${email.trim()}.`)
      setStep(2)
    } catch (err) {
      setFieldError(err?.message || 'Could not verify this email. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setFieldError('')
    setBusy(true)
    try {
      await authApi.sendCode(email.trim())
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
    if (!password) return 'Please enter a password.'
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
      await authApi.signup({
        email: email.trim(),
        code,
        password,
        confirmPassword,
      })
      onSignupSuccess?.({ email: email.trim(), password })
    } catch (err) {
      const message = err?.message || 'Could not create your account. Please try again.'
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

  return (
    <form onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handlePasswordSubmit} className="w-full">
      <div className={isCentered ? 'text-center' : 'text-left'}>
        <p className="text-xs font-bold tracking-[0.15em] text-gc-accent uppercase">
          Student Portal
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-gc-green-700">
          Create your account
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          Sign up with your Gordon College email to book clinic appointments.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = s.id === step
          const done = s.id < step
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active || done ? 'bg-gc-accent text-white' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {s.id}
              </span>
              <span className={`text-xs font-semibold ${active || done ? 'text-gc-green-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {idx < STEPS.length - 1 && (
                <span className={`h-0.5 flex-1 ${done ? 'bg-gc-accent' : 'bg-gray-100'}`} />
              )}
            </li>
          )
        })}
      </ol>

      <div className="mt-7 space-y-5">
        {step === 1 && (
          <div>
            <label htmlFor="signup-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              Gordon College email
            </label>
            <input
              id="signup-email"
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
              <label htmlFor="signup-code" className="block text-sm font-semibold text-gray-900 mb-1.5">
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
              id="signup-code"
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
              <label htmlFor="signup-password" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
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
            </div>

            <div>
              <label htmlFor="signup-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm password
              </label>
              <input
                id="signup-confirm"
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
              : 'Create account'}
      </button>

      {step > 1 && (
        <button
          type="button"
          onClick={() => {
            setStep((s) => s - 1)
            setFieldError('')
            setInfo('')
          }}
          disabled={isBusy}
          className="mt-3 w-full text-center text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
        >
          Back
        </button>
      )}

      <p className="mt-5 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <a href="/student/login" className="font-semibold text-gc-accent hover:text-gc-green-600">
          Log in
        </a>
      </p>
    </form>
  )
}
