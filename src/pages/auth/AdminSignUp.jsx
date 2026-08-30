import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminAuthApi } from '../../lib/api.js'
import { EyeIcon, EyeOffIcon } from '../../components/icons.jsx'

const EMAIL_RE = /^[^\s@]+@gordoncollege\.edu\.ph$/i
const STEPS = [
  { id: 1, label: 'Email' },
  { id: 2, label: 'Verify' },
  { id: 3, label: 'Profile' },
]

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20'

const primaryBtnClass =
  'w-full rounded-xl bg-gc-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30 disabled:cursor-not-allowed disabled:opacity-60'

export default function AdminSignUp() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [role, setRole] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [info, setInfo] = useState('')

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError('Use your Gordon College email (@gordoncollege.edu.ph).')
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      await adminAuthApi.sendCode(email.trim())
      setInfo(`We sent a 6-digit code to ${email.trim()}.`)
      setStep(2)
    } catch (err) {
      const msg = err?.message || ''
      if (/Already active/i.test(msg)) {
        setFieldError('This admin account is already active — please log in instead.')
      } else {
        setFieldError(msg || 'Could not verify this email. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setFieldError('')
    setBusy(true)
    try {
      await adminAuthApi.sendCode(email.trim())
      setInfo(`We resent a 6-digit code to ${email.trim()}.`)
    } catch (err) {
      const msg = err?.message || ''
      if (/Too many/i.test(msg)) {
        setFieldError('Too many codes sent. Please try again later.')
      } else {
        setFieldError(msg || 'Could not resend the code. Please try again.')
      }
    } finally {
      setBusy(false)
    }
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

  async function handleProfileSubmit(e) {
    e.preventDefault()
    if (!firstName.trim()) {
      setFieldError('First name is required.')
      return
    }
    if (!lastName.trim()) {
      setFieldError('Last name is required.')
      return
    }
    if (!role || !['nurse', 'doctor'].includes(role)) {
      setFieldError('Please select a role (Nurse or Doctor).')
      return
    }
    if (!password || password.length < 8) {
      setFieldError('Password must be at least 8 characters.')
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
        email: email.trim(),
        code,
        password,
        confirmPassword,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        license_no: licenseNo.trim() || undefined,
        role,
      })
      setInfo('Request submitted — pending approval. An existing admin will review.')
      setTimeout(() => navigate('/admin/login'), 2000)
    } catch (err) {
      const msg = err?.message || 'Could not create your account. Please try again.'
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

  const message = fieldError

  const BRAND = {
    logo: '/gordon-college-logo.png',
    name: 'GORDON COLLEGE',
    tagline: 'Clinic Appointment System',
  }

  const card = (
    <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl shadow-black/5">
      <p className="text-xs font-bold tracking-[0.15em] text-gc-green-700 uppercase">Admin Portal</p>
      <h1 className="mt-2 text-2xl font-extrabold text-gc-green-700">Admin Sign Up</h1>
      <p className="mt-1 text-sm text-gray-500">Create a request — an existing admin will review it.</p>

      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = s.id === step
          const done = s.id < step
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active || done ? 'bg-gc-green-700 text-white' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
              >
                {s.id}
              </span>
              <span className={`text-xs font-semibold ${active || done ? 'text-gc-green-700' : 'text-gray-400'}`}>{s.label}</span>
              {idx < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${done ? 'bg-gc-green-700' : 'bg-gray-100'}`} />}
            </li>
          )
        })}
      </ol>

      {info && !message ? <p className="mt-4 text-sm font-medium text-gc-green-700">{info}</p> : null}
      {message ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {message}
        </p>
      ) : null}

      <form
        onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handleProfileSubmit}
        className="mt-6 space-y-4"
      >
        {step === 1 && (
          <div>
            <label htmlFor="admin-signup-email" className="block text-sm font-semibold text-gray-900 mb-1.5">
              Gordon College email
            </label>
            <input
              id="admin-signup-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError('')
              }}
              placeholder="name@gordoncollege.edu.ph"
              className={inputClass}
            />
            <button type="submit" disabled={busy} className={`mt-4 ${primaryBtnClass}`}>
              {busy ? 'Please wait…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <label htmlFor="admin-signup-code" className="block text-sm font-semibold text-gray-900 mb-1.5">
              6-digit code
            </label>
            <input
              id="admin-signup-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
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
              disabled={busy}
              className="mt-2 text-xs font-semibold text-gc-green-700 hover:text-gc-green-800 disabled:opacity-60"
            >
              Resend code
            </button>
            <button type="submit" disabled={busy} className={`mt-4 ${primaryBtnClass}`}>
              {busy ? 'Please wait…' : 'Verify code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setFieldError('')
                setInfo('')
              }}
              disabled={busy}
              className="mt-2 w-full text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
            >
              Back
            </button>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="admin-signup-first-name" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="admin-signup-first-name"
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Juan"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="admin-signup-last-name" className="block text-sm font-semibold text-gray-900 mb-1.5">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="admin-signup-last-name"
                  name="last_name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="Dela Cruz"
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
                placeholder="e.g. RN-123456"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="admin-signup-role" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                id="admin-signup-role"
                name="role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value)
                  setFieldError('')
                }}
                className={inputClass}
              >
                <option value="">Select role</option>
                <option value="nurse">Nurse</option>
                <option value="doctor">Doctor</option>
              </select>
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
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFieldError('')
                  }}
                  placeholder="At least 8 characters"
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
            </div>

            <div>
              <label htmlFor="admin-signup-confirm" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="admin-signup-confirm"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setFieldError('')
                }}
                placeholder="Re-enter your password"
                className={inputClass}
              />
            </div>

            <button type="submit" disabled={busy} className={primaryBtnClass}>
              {busy ? 'Please wait…' : 'Submit request'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(2)
                setFieldError('')
                setInfo('')
              }}
              disabled={busy}
              className="w-full text-sm font-semibold text-gray-500 hover:text-gc-green-700 disabled:opacity-60"
            >
              Back
            </button>
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link to="/admin/login" className="font-semibold text-gc-green-700 hover:text-gc-green-800">
          Log in
        </Link>
      </p>
    </div>
  )

  return (
    <div className="min-h-screen w-full bg-gc-green-700">
      <div className="flex min-h-screen flex-col lg:hidden">
        <div className="flex flex-col items-center px-6 pt-14 pb-16">
          <img src={BRAND.logo} alt="Gordon College seal" className="h-[140px] w-[140px] object-contain" />
          <h1 className="mt-6 text-2xl font-extrabold tracking-wide text-white">{BRAND.name}</h1>
          <p className="mt-1 text-[15px] text-white/90">{BRAND.tagline}</p>
        </div>
        <div className="-mt-8 flex-1 rounded-t-panel bg-white px-6 pb-10 pt-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm">{card}</div>
        </div>
      </div>

      <div className="hidden h-screen w-full overflow-hidden lg:flex">
        <div className="flex h-[calc(100%-4px)] w-full">
          <div className="flex w-[31%] shrink-0 flex-col items-center justify-center">
            <img src={BRAND.logo} alt="Gordon College seal" className="h-[155px] w-[155px] object-contain" />
            <h1 className="mt-5 text-xl font-extrabold tracking-wide text-white">{BRAND.name}</h1>
            <p className="mt-1 text-sm text-white/90">{BRAND.tagline}</p>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-tl-[5rem] rounded-bl-[5rem] bg-white px-10">
            <div className="w-full max-w-md">{card}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
