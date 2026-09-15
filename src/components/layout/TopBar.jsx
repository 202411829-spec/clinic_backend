import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Medical Certificate / Medical Summary are printable official documents —
// the app chrome doesn't belong on top of a letterhead.
const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

const CRUMBS = {
  dashboard: 'Dashboard',
  appointments: 'Appointments',
  logbook: 'Logbook',
  masterlist: 'Masterlist',
  'clinic-schedule': 'Clinic schedule',
  reports: 'Reports',
  admins: 'Admins',
  profile: 'Profile',
}

function initialsFrom(value = '') {
  const source = value.includes('@') ? value.split('@')[0] : value
  const parts = source.trim().split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export default function TopBar() {
  const location = useLocation()
  const { name, role, email } = useAuth() || {}

  if (HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))) return null

  const segment = location.pathname.split('/').filter(Boolean).pop()
  const current = CRUMBS[segment] || 'Clinic'
  const displayName = name || email || 'Signed in'

  return (
    // Sticky with a hairline and a backdrop blur — no shadow, so it never
    // competes with the panels scrolling underneath it.
    //
    // The global search field is gone. Each page already has its own scoped
    // search ("Search by name, email, or role" on Admins, and the same on
    // Logbook and Masterlist), so a second box in the chrome was ambiguous
    // about what it searched and just added noise.
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-ink-100 bg-canvas/85 px-6 py-3.5 backdrop-blur-md print:hidden lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="text-ink-400">Clinic</span>
        <span className="text-ink-300">/</span>
        <span className="truncate font-medium text-ink-900">{current}</span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden text-right sm:block">
          <p className="text-[13px] font-medium leading-tight text-ink-900">{displayName}</p>
          {role && <p className="text-xs leading-tight text-ink-500">{role}</p>}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-brand-100">
          {initialsFrom(displayName)}
        </span>
      </div>
    </header>
  )
}
