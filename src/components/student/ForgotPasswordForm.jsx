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
 * Per-portal branding + behavior for the forgot-password form. The class
 * strings are written out in full (not interpolated) so Tailwind's content
 * scanner still picks them up at build time.
 */
const VARIANTS = {
  student: {
    portalLabel: 'Student Portal',
    emailLabel: 'Gordon College email',
    emailPlaceholder: `name${EMAIL_DOMAIN}`,
    subtitle: "We'll send a code to your Gordon College email to verify it's you.",
    loginPath: '/student/login',
    normalizeEmail: (value) => value,
    validateEmail: (value) => {
      if (!value.trim()) return 'Please enter your email address.'
      if (!EMAIL_RE.test(value.trim())) {
        return `Use your Gordon College email (ending in ${EMAIL_DOMAIN}).`
      }
      return ''
    },
    textAccent: 'text-gc-accent',
    bgAccent: 'bg-gc-accent',
    borderAccent: 'focus:border-gc-accent',
    ringAccent: 'focus:ring-gc-accent/20',
    ringAccentStrong: 'focus:ring-gc-accent/30',
    hoverAccent: 'hover:text-gc-green-600',
    hoverBgAccent: 'hover:bg-gc-green-600',
  },
  admin: {
    portalLabel: 'Admin Portal',
    emailLabel: 'Email',
    emailPlaceholder: 'Email / Username',
    subtitle: "We'll send a code to your email to verify it's you.",
    loginPath: '/admin/login',
    // Admins log in as username@gordoncollege.edu.ph, so accept a bare
    // username and complete the address before hitting the API.
    normalizeEmail: (value) =>
      value.includes('@') ? value : `${value}@gordoncollege.edu.ph`,
    validateEmail: (value) =>
      value.trim() ? '' : 'Please enter your email or username.',
    textAccent: 'text-gc-accent',
    bgAccent: 'bg-gc-green-700',
    borderAccent: 'focus:border-gc-green-700',
    ringAccent: 'focus:ring-gc-green-700/30',
    ringAccentStrong: 'focus:ring-gc-green-700/30',
    hoverAccent: 'hover:text-gc-green-600',
    hoverBgAccent: 'hover:bg-gc-green-800',
  },
}

/**
 * Multi-step "forgot password" form, reused by both the Student and Admin
 * portals via the `variant` prop.
 *
 * Step 1: collect the email/username, confirm an account exists
 *         (POST /api/auth/forgot/check-email), then trigger a 6-digit code
 *         email (POST /api/auth/forgot/send-code).
 * Step 2: let the user paste the 6-digit code they received.
 * Step 3: collect + confirm a new password, then reset the account
 *         (POST /api/auth/forgot/reset). On success the parent redirects
 *         the user to the login screen.
 *
 * `onSuccess()` is called after the backend confirms the reset succeeded,
 * once a short success message has been shown, so the page can route the
 * user to the login screen.
 */
export default function ForgotPasswordForm({
  variant = 'student',
  align = 'left',
  onSuccess,
  loading = false,
  error = '',
}) {
  const cfg = VARIANTS[variant] ?? VARIANTS.student

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

  async function handleEmailSubmit(e) {
    e.preventDefault()
    const emailError = cfg.validateEmail(email)
    if (emailError) {
      setFieldError(emailError)
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const target = cfg.normalizeEmail(email.trim())
      const result = await forgotApi.checkEmail(target)
      // A 200 means an account exists. If the backend explicitly flags it as
      // missing, surface that so the user can correct the email.
      if (result && result.exists === false) {
        setFieldError('We could not find an account with that email. Check the address and try again.')
        return
      }
      await forgotApi.sendCode(target)
      setInfo(`We sent a 6-digit code to ${target}.`)
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
      const target = cfg.normalizeEmail(email.trim())
      await forgotApi.sendCode(target)
      setInfo(`We resent a 6-digit code to ${target}.`)
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
      const message = err?.message || 'Could not reset your password. Please try again.'
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

      <div className="mt-7 space-y-5">
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
              className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 ${cfg.borderAccent} focus:outline-none focus:ring-2 ${cfg.ringAccent}`}
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
              className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center text-[22px] tracking-[0.5em] text-gray-900 shadow-sm placeholder:text-gray-300 ${cfg.borderAccent} focus:outline-none focus:ring-2 ${cfg.ringAccent}`}
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy}
              className={`mt-2 text-xs font-semibold ${cfg.textAccent} ${cfg.hoverAccent} disabled:opacity-60`}
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
                  className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-11 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 ${cfg.borderAccent} focus:outline-none focus:ring-2 ${cfg.ringAccent}`}
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
                className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 ${cfg.borderAccent} focus:outline-none focus:ring-2 ${cfg.ringAccent}`}
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
        className={`mt-7 w-full rounded-xl ${cfg.bgAccent} py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors ${cfg.hoverBgAccent} focus:outline-none focus:ring-2 ${cfg.ringAccentStrong} disabled:cursor-not-allowed disabled:opacity-60`}
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
        <a href={cfg.loginPath} className={`font-semibold ${cfg.textAccent} ${cfg.hoverAccent}`}>
          Log in
        </a>
      </p>
    </form>
  )
}
