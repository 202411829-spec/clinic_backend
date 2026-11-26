import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminAuthApi } from '../../lib/api.js'
import { friendlyPasswordError } from '../../lib/authPasswordErrors.js'
import { EyeIcon, EyeOffIcon } from '../../components/ui/icons.jsx'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter.jsx'
import { normalizeEmail, validateAdminSignupEmail } from '../../lib/signupValidation.js'
import {
  formatAdminMiddleInitial,
  isValidAdminMiddleInitial,
} from '../../lib/format.js'
import { validatePassword } from '../../lib/passwordPolicy.js'

const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Profile' },
]

const MAX_SUFFIX = 20
const RESEND_COOLDOWN_SECONDS = 60

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20'

const primaryBtnClass =
  'btn-press w-full rounded-xl bg-gc-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

export default function AdminSignUp() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitedEmail = normalizeEmail(searchParams.get('email') || '')
  const invitationToken = (searchParams.get('invite_token') || '').trim()
  const invitationRole = (searchParams.get('role') || '').trim().toLowerCase()
  const isInvitation = Boolean(invitationToken && invitedEmail)
  const roleLabel = invitationRole === 'super_admin' ? 'Super Admin' : 'Admin'

  const [step, setStep] = useState(1)
  const [email, setEmail] = useState(invitedEmail)
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [middleInitial, setMiddleInitial] = useState('')
  const [suffix, setSuffix] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [fieldError, setFieldError] = useState(
    invitationToken && !invitedEmail
      ? 'This invitation link is missing its email address. Use the full link from your invitation.'
      : ''
  )
  const [info, setInfo] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const sendInFlightRef = useRef(false)

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  // Invitation tokens are the source of truth for the invited email. The
  // backend resolves the token and returns the canonical address so a stale
  // form value can never choose the OTP recipient or the final signup email.
  async function sendVerificationCode(emailToVerify) {
    const data = await adminAuthApi.sendCode(
      emailToVerify,
      isInvitation ? invitationToken : undefined,
    )
    const confirmedEmail = normalizeEmail(data?.email || emailToVerify)
    setEmail(confirmedEmail)
    return confirmedEmail
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
    const normalizedEmail = normalizeEmail(email)
    const validationError = validateAdminSignupEmail(normalizedEmail)
    if (validationError) {
      setFieldError(validationError)
      return
    }
    if (invitationToken && !invitedEmail) {
      setFieldError('This invitation link is missing its email address. Use the full link from your invitation.')
      return
    }
    setEmail(normalizedEmail)
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      const confirmedEmail = await sendVerificationCode(normalizedEmail)
      setInfo(`We sent a 6-digit code to ${confirmedEmail}. It may take a minute to arrive; check spam if needed.`)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setStep(2)
    } catch (err) {
      const msg = err?.message || ''
      if (/Already active/i.test(msg)) {
        setFieldError('This admin account is already active — please log in instead.')
      } else {
        setFieldError(msg || 'Could not verify this email. Please try again.')
      }
    } finally {
      finishCodeSend()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || busy || sendInFlightRef.current) return
    const normalizedEmail = normalizeEmail(email)
    setEmail(normalizedEmail)
    setFieldError('')
    if (!beginCodeSend()) return
    try {
      const confirmedEmail = await sendVerificationCode(normalizedEmail)
      setInfo(`We resent a 6-digit code to ${confirmedEmail}. It may take a minute to arrive; check spam if needed.`)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      const msg = err?.message || ''
      if (/Too many/i.test(msg)) {
        setFieldError('Too many codes sent. Please try again later.')
      } else {
        setFieldError(msg || 'Could not resend the code. Please try again.')
      }
    } finally {
      finishCodeSend()
    }
  }

  function handleCodeSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) {
      setFieldError('Enter the 6-digit code we sent you.')
      return
    }
    setFieldError('')
    setInfo('')
    setStep(3)
  }

  // Shared policy (12 chars, 3 of 4 groups, denylist, no email/username
  // substring…). Email context lets the validator reject personal passwords;
  // the local part is derived inside passwordPolicy.js.
  const passwordCheck = validatePassword(password, { email })

  async function handleProfileSubmit(e) {
    e.preventDefault()
    if (busy || submitted) return
    if (!lastName.trim()) {
      setFieldError('Last name is required.')
      return
    }
    if (!firstName.trim()) {
      setFieldError('First name is required.')
      return
    }
    if (!isValidAdminMiddleInitial(middleInitial)) {
      setFieldError('Middle initial must be a single letter, optionally followed by a period.')
      return
    }
    if (suffix.trim().length > MAX_SUFFIX) {
      setFieldError(`Suffix must be ${MAX_SUFFIX} characters or fewer.`)
      return
    }
    if (!passwordCheck.valid) {
      setFieldError(passwordCheck.message)
      return
    }
    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.')
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      await adminAuthApi.signup({
        email: normalizeEmail(email),
        code,
        password,
        confirmPassword,
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        middle_initial: formatAdminMiddleInitial(middleInitial) || undefined,
        suffix: suffix.trim() || undefined,
        license_no: licenseNo.trim() || undefined,
        // Invitations carry a server-issued token and the backend resolves the
        // assigned role from the invite row. Ordinary requests always ask for
        // the plain admin role; upgrades happen later in the Admins panel.
        ...(isInvitation
          ? { invitation_token: invitationToken }
          : { role: 'admin' }),
      })
      setInfo('')
      setSubmitted(true)
    } catch (err) {
      const msg = friendlyPasswordError(err, 'Could not create your account. Please try again.')
      if (/code/i.test(msg)) {
        setFieldError(msg)
        setCode('')
        setStep(2)
      } else {
        setFieldError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <SignUpLayout
        portalLabel="Admin Portal"
        title="Admin Sign Up"
        subtitle={isInvitation ? 'Your invitation is ready to accept.' : 'Create a request — an existing admin will review it.'}
        loginTo="/admin/login"
      >
        <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 px-6 py-8 text-center animate-fade-in-up">
          <h2 className="text-lg font-bold text-gray-900">{isInvitation ? 'Invitation accepted' : 'Request submitted'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {isInvitation
              ? 'Your admin account is active. You can sign in now.'
              : 'Admin request submitted successfully. Your request is pending approval from an existing administrator.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className={`btn-press mt-6 ${primaryBtnClass}`}
          >
            Back to Login
          </button>
        </div>
      </SignUpLayout>
    )
  }

  const message = fieldError

  return (
    <SignUpLayout
      portalLabel="Admin Portal"
      title="Admin Sign Up"
      subtitle={isInvitation ? 'Complete your invitation to activate admin access.' : 'Create a request — an existing admin will review it.'}
      loginTo="/admin/login"
    >
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
        onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handleProfileSubmit}
        className="mt-6 space-y-4 animate-fade-in-up motion-reduce:animate-none"
      >
        {step === 1 && (
          <div>
            <label htmlFor="admin-signup-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              {isInvitation ? 'Invited email' : 'Gordon College email'} <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              readOnly={isInvitation}
              aria-readonly={isInvitation}
              value={email}
              onChange={isInvitation ? undefined : (e) => {
                setEmail(e.target.value)
                setFieldError('')
              }}
              placeholder="lastname.firstname@gordoncollege.edu.ph"
              className={`${inputClass} ${isInvitation ? 'bg-gray-50 text-gray-500' : ''}`}
            />
            {isInvitation && (
              <p className="mt-1.5 text-xs text-gray-500">
                Invited as {roleLabel}. This address is locked to your invitation.
              </p>
            )}
            <button type="submit" disabled={busy} className={`mt-4 ${primaryBtnClass}`}>
              {sendingCode ? 'Sending code…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <label htmlFor="admin-signup-code" className="block text-sm font-semibold text-gray-900 mb-1.5">
              6-digit code <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-signup-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              aria-required="true"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                setFieldError('')
              }}
              placeholder="••••••"
              className={`${inputClass} text-center text-xl tracking-[0.5em]`}
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={busy || resendCooldown > 0}
              className="btn-press mt-2 text-xs font-semibold text-gc-green-700 hover:text-gc-green-800 disabled:opacity-60"
            >
              {sendingCode
                ? 'Sending code…'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
            </button>
            <button type="submit" disabled={busy} className={`mt-4 ${primaryBtnClass}`}>
              {busy ? 'Verifying…' : 'Continue'}
            </button>
            {!isInvitation && (
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setFieldError('')
                  setInfo('')
                }}
                disabled={busy}
                className="btn-press mt-2 w-full text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
              >
                Back
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="admin-signup-last-name" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="admin-signup-last-name"
                  name="last_name"
                  type="text"
                  autoComplete="family-name"
                  required
                  aria-required="true"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Last Name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="admin-signup-first-name" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="admin-signup-first-name"
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  required
                  aria-required="true"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="First Name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="admin-signup-middle-initial" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  Middle Initial <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="admin-signup-middle-initial"
                  name="middle_initial"
                  type="text"
                  autoComplete="additional-name"
                  maxLength={2}
                  value={middleInitial}
                  onChange={(e) => {
                    setMiddleInitial(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Middle Initial"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="admin-signup-suffix" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  Suffix <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="admin-signup-suffix"
                  name="suffix"
                  type="text"
                  maxLength={MAX_SUFFIX}
                  value={suffix}
                  onChange={(e) => {
                    setSuffix(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Suffix"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-signup-license" className="block text-sm font-semibold text-gray-900 mb-1.5">
                License No. <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="admin-signup-license"
                name="license_no"
                type="text"
                value={licenseNo}
                onChange={(e) => {
                  setLicenseNo(e.target.value)
                  setFieldError('')
                }}
                placeholder="License Number"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="admin-signup-password" className="block text-sm font-semibold text-gray-900 mb-1.5">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="admin-signup-password"
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
                  aria-describedby="admin-signup-password-strength"
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
              <PasswordStrengthMeter id="admin-signup-password-strength" check={passwordCheck} password={password} />
            </div>

            <div>
              <label htmlFor="admin-signup-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="admin-signup-confirm"
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

            <button type="submit" disabled={busy} className={primaryBtnClass}>
              {busy ? 'Submitting…' : isInvitation ? 'Complete signup' : 'Submit request'}
            </button>
            {!isInvitation && (
              <button
                type="button"
                onClick={() => {
                  setStep(2)
                  setFieldError('')
                  setInfo('')
                }}
                disabled={busy}
                className="btn-press w-full text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
              >
                Back
              </button>
            )}
          </>
        )}
      </form>

    </SignUpLayout>
  )
}
