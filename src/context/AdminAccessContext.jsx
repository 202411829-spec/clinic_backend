// src/context/AdminAccessContext.jsx
// Tiny read-only context for the signed-in admin's authoritative role.
// AdminLayout fetches it once via adminsApi.me() and passes the role down;
// TopBar and AdminsPanel consume it instead of guessing from user_metadata.
// Fail closed: a missing/unknown role resolves to a plain (non-super) admin.
import { createContext, useContext, useMemo } from 'react'

const AdminAccessContext = createContext({ role: null, isSuperAdmin: false })

export function AdminAccessProvider({ role, children }) {
  const value = useMemo(() => {
    const resolved = role === 'admin' || role === 'super_admin' ? role : null
    return {
      role: resolved,
      isSuperAdmin: resolved === 'super_admin',
    }
  }, [role])

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>
}

export function useAdminAccess() {
  return useContext(AdminAccessContext)
}
