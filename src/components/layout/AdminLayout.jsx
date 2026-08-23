import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import MobileSidebarOverlay from '../admin/MobileSidebarOverlay.jsx'
import MobileMenuHandle from '../admin/MobileMenuHandle.jsx'

// Medical Certificate / Medical Summary are printable official documents —
// TopBar already hides itself there, so the mobile nav handle should too.
const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const hideMobileNav = HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      {!hideMobileNav && (
        <>
          <MobileSidebarOverlay
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          />
          <MobileMenuHandle onClick={() => setMobileNavOpen(true)} />
        </>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto">
        <TopBar />
        <main className="px-4 pb-16 lg:px-10 md:pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
