import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../icons.jsx'

/**
 * Login form used by the Student Portal login page.
 * Kept as its own component (separate from LoginForm.jsx, which is admin-only)
 * so the student flow can evolve independently — different copy, different
 * field (ID / registration number instead of a username@domain login),
 * and the brighter "gc-accent" green from the student mockup instead of the
 * dark "gc-green" used on the admin button.
 *
 * `align="center"` -> mobile / bottom-sheet layout (headings centered)
 * `align="left"`   -> desktop split layout (headings left-aligned)
 */
export default function StudentLoginForm({ align = 'left', onSubmit, loading = false, error = '' }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isCentered = align === 'center'

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit?.({ username, password })
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={isCentered ? 'text-center' : 'text-left'}>
        <p className="text-xs font-bold tracking-[0.15em] text-gc-accent uppercase">
          Student Portal
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-gc-green-700">
          Welcome
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          Book, reschedule, or check the status of your clinic appointments.
        </p>
      </div>

      <div className="mt-7 space-y-5">
        <div>
          <label htmlFor="student-username" className="block text-sm font-semibold text-gray-900 mb-1.5">
            Username
          </label>
          <input
            id="student-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Email/ ID/ Registration Number"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20"
          />
        </div>

        <div>
          <label htmlFor="student-password" className="block text-sm font-semibold text-gray-900 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="student-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-7 w-full rounded-xl bg-gc-accent py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-600 focus:outline-none focus:ring-2 focus:ring-gc-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Logging in…' : 'Login'}
      </button>

      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        By clicking the login button, you recognize the authority of Gordon
        College to process your personal and sensitive information, pursuant
        to the Gordon College Privacy Notice and Applicable laws
      </p>

      <p className="mt-5 text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <a href="/student/signup" className="font-semibold text-gc-accent hover:text-gc-green-600">
          Sign up
        </a>
      </p>
    </form>
  )
}
