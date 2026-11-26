import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Redirects to `loginPath` once we are certain the visitor is signed out.
 * While the session is still restoring we show a small status instead of
 * mounting the protected layout, so no dashboard/profile request can fire
 * with a token that has not been verified yet.
 */
export default function ProtectedRoute({ loginPath, children }) {
  const { isAuthenticated, loading } = useAuth()

  // Do not mount dashboard/profile children until the Supabase session has
  // been restored. Otherwise a stale token can fire protected Flask requests
  // before we know whether the visitor is actually signed in.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm font-medium text-gray-500">
        Checking your session…
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to={loginPath} replace />
  return children
}
