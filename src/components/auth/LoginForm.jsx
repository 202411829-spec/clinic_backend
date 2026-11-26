import { useState } from 'react'
import { EyeIcon, EyeOffIcon, LockIcon, UserIcon } from '../ui/icons.jsx'
import { GoogleSignInPlaceholder, RememberMe } from './LoginFormExtras.jsx'

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20'

const primaryBtnClass =
  'btn-press w-full rounded-xl bg-gc-green-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

export default function LoginForm({ onSubmit, loading = false, error = '' }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit?.({ username, password })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-4 animate-fade-in-up motion-reduce:animate-none"
    >
      <div>
        <label htmlFor="username" className="block text-sm font-semibold text-gray-900 mb-1.5">
          Username
        </label>
        <div className="relative">
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className={`${inputClass} pl-11 pr-[124px] sm:pr-[168px]`}
          />
          <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-gray-400 sm:text-sm">
            @gordoncollege.edu.ph
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-gray-900 mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className={`${inputClass} pl-11 pr-11`}
          />
          <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <RememberMe id="admin-remember" />
          <a href="/admin/forgot-password" className="text-sm font-semibold text-gc-green-700 hover:text-gc-green-800">
            Forgot password?
          </a>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600 animate-fade-in-up">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={loading} className={primaryBtnClass}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Logging in…
          </span>
        ) : (
          'Login'
        )}
      </button>

      <GoogleSignInPlaceholder />

      <p className="text-xs leading-relaxed text-gray-500">
        By clicking the login button, you recognize the authority of Gordon
        College to process your personal and sensitive information, pursuant
        to the Gordon College Privacy Notice and Applicable laws
      </p>
    </form>
  )
}
