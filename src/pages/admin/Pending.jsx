import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Pending() {
  const { email, user, signOut } = useAuth()
  const navigate = useNavigate()

  const displayEmail = email || user?.email || ''

  function handleRefresh() {
    window.location.reload()
  }

  async function handleLogout() {
    try {
      await signOut()
    } finally {
      navigate('/admin/login', { replace: true })
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-gray-50 p-6 sm:min-h-[70vh]">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-100">
        {/* Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <h1 className="mt-4 text-xl font-bold text-gray-900">Pending approval</h1>

        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Your admin request is pending approval — an existing admin will review your request. You&apos;ll get access
          once accepted.
        </p>

        {displayEmail && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 break-all">
            {displayEmail}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gc-accent/20 sm:flex-none"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gc-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gc-green-600 focus:outline-none focus:ring-2 focus:ring-gc-accent/30 sm:flex-none"
          >
            Log out
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-400">You can refresh after an admin approves your request.</p>
      </div>
    </div>
  )
}
