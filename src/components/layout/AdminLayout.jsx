import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import MobileSidebarOverlay from '../admin/MobileSidebarOverlay.jsx'
import MobileMenuHandle from '../admin/MobileMenuHandle.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { adminsApi } from '../../lib/api.js'
import Pending from '../../pages/admin/Pending.jsx'
import AgentBubble from '../agent/AgentBubble.jsx'
import AgentPanel from '../agent/AgentPanel.jsx'

// Medical Certificate / Medical Summary are printable official documents —
// TopBar already hides itself there, so the mobile nav handle should too.
const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const hideMobileNav = HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))
  const { email, loading: authLoading } = useAuth()
  const [checkingPending, setCheckingPending] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)

  // After login, fetch own admin record to check is_active. Inactive admins
  // (is_active === false or status !== 'active') see the Pending page instead.
  useEffect(() => {
    if (authLoading) return
    if (!email) {
      setCheckingPending(false)
      setIsPending(false)
      return
    }

    let cancelled = false

    async function checkPending() {
      setCheckingPending(true)
      try {
        const res = await adminsApi.me()
        const record = res?.admin || res
        if (!cancelled && record) {
          const hasIsActive = Object.prototype.hasOwnProperty.call(record, 'is_active')
          if (hasIsActive) {
            setIsPending(record.is_active === false)
          } else if (Object.prototype.hasOwnProperty.call(record, 'isActive')) {
            setIsPending(record.isActive === false)
          } else if (record.status) {
            setIsPending(String(record.status).toLowerCase() !== 'active')
          } else {
            setIsPending(false)
          }
        } else if (!cancelled) {
          setIsPending(false)
        }
      } catch {
        if (!cancelled) setIsPending(false)
      } finally {
        if (!cancelled) setCheckingPending(false)
      }
    }

    checkPending()

    return () => {
      cancelled = true
    }
  }, [email, authLoading])

  return (
    <div className="flex h-screen overflow-hidden bg-gc-green-700 print:h-auto print:overflow-visible print:bg-white">
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

      <div className="flex flex-1 flex-col overflow-y-auto bg-white lg:rounded-tl-[48px] lg:rounded-bl-[48px] print:overflow-visible print:rounded-none">
        <TopBar />
        <main className="px-4 pb-4 lg:px-10 lg:pb-6 print:px-0 print:pb-0">
          {checkingPending ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <p className="text-sm font-medium text-gray-500">Loading…</p>
            </div>
          ) : isPending ? (
            <Pending />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      {!isPending && !checkingPending && (
        <>
          <AgentBubble isPending={isPending} open={agentOpen} onClick={() => setAgentOpen((v) => !v)} />
          <AgentPanel
            open={agentOpen}
            onClose={() => setAgentOpen(false)}
            onClear={() => {}}
            history={[]}
            preview={null}
            onSend={async () => {}}
            onConfirm={async () => {}}
            onDismissPreview={() => {}}
            error={null}
            loading={false}
          />
        </>
      )}
    </div>
  )
}
