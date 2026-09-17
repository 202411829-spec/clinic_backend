import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeftIcon } from '../icons.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

// Medical Certificate / Medical Summary are printable official documents
// (letterhead layout) — the "Back" link and admin profile chip don't belong
// on top of them, so TopBar hides itself entirely on those routes.
const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

export default function TopBar({ showBack = true }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const displayName = user?.user_metadata?.full_name || user?.email || 'Admin'
  const displayRole = user?.user_metadata?.role || 'Nurse'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'AD'

  if (HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))) {
    return null
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 lg:px-10 print:hidden">
      {showBack ? (
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-1 text-sm font-semibold text-gc-green-700 transition-colors duration-200 hover:text-gc-green-600"
        >
          <ChevronLeftIcon className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Back
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-3 animate-fade-in">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-xs font-semibold text-gc-accent">{displayRole}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gc-green-700 text-sm font-bold text-white transition-transform duration-200 hover:scale-105">
          {initials}
        </div>
      </div>
    </div>
  )
}
