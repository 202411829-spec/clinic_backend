import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeftIcon } from '../icons.jsx'
import LogoutMenu from '../LogoutMenu.jsx'

// TODO: replace with the real logged-in admin once auth/session wiring
// lands — matches the mockup's placeholder "Joseph Daniel B. Ramos / Nurse".
const CURRENT_ADMIN = { name: 'Joseph Daniel B. Ramos', role: 'Nurse', initials: 'JR' }

// Medical Certificate / Medical Summary are printable official documents
// (letterhead layout) — the "Back" link and admin profile chip don't belong
// on top of them, so TopBar hides itself entirely on those routes.
const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

export default function TopBar({ showBack = true }) {
  const navigate = useNavigate()
  const location = useLocation()

  if (HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))) {
    return null
  }

  return (
    <div className="flex items-center justify-between px-6 py-5 lg:px-10 print:hidden">
      {showBack ? (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm font-semibold text-gc-green-700"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{CURRENT_ADMIN.name}</p>
          <p className="text-xs font-semibold text-gc-accent">{CURRENT_ADMIN.role}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gc-green-700 text-sm font-bold text-white">
          {CURRENT_ADMIN.initials}
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <LogoutMenu redirectTo="/admin/login" />
      </div>
    </div>
  )
}
