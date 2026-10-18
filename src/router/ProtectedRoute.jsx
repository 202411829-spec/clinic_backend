import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Redirects to `loginPath` once we are certain the visitor is signed out.
 * While the session is still restoring we render the layout immediately
 * (it shows its own sidebar-visible loading state), so there is no
 * blank-screen flash.
 */
export default function ProtectedRoute({ loginPath, children }) {
  const { isAuthenticated, loading } = useAuth()
  if (!loading && !isAuthenticated) return <Navigate to={loginPath} replace />
  return children
}
