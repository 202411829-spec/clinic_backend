import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx'
import PageLoader from '../components/ui/PageLoader.jsx'

/** Wraps every route: lazy-chunk fallback, error boundary, scroll-to-top. */
export default function RouteShell() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  )
}
