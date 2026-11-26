import { useAuth } from '../../context/AuthContext.jsx'
import { useAdminAccess } from '../../context/AdminAccessContext.jsx'

const ROLE_LABELS = {
  admin: 'Admin',
  super_admin: 'Super Admin',
}

function initialsFromEmail(email) {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(0, 2).map((p) => p[0]) : [local[0], local[1]])
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'AD'
}

export default function AdminSidebarProfile() {
  const { email: authEmail, user } = useAuth()
  const { role } = useAdminAccess()
  const email = authEmail || user?.email || 'Admin'
  const displayRole = ROLE_LABELS[role] ?? 'Admin'

  return (
    <div className="shrink-0 border-b border-white/15 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-1 ring-white/25">
          {initialsFromEmail(email)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-white" title={email}>
            {email}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-white/70">{displayRole}</p>
        </div>
      </div>
    </div>
  )
}
