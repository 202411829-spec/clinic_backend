// src/components/admin/AdminsPanel.jsx
// Admin & Staff management page: roster table, pending-requests queue, and
// the "add admin" invite flow. Redesigned for a Gordon-College-branded,
// look, built on the brand/ink token ramp.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'
import { SearchIcon, ShieldIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'

const ALLOWED_ROLES = ['nurse', 'doctor']
const EMAIL_DOMAIN = '@gordoncollege.edu.ph'
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function initials(admin) {
  const a = (admin.first_name || '')[0] || ''
  const b = (admin.last_name || '')[0] || ''
  const combo = (a + b).toUpperCase()
  return combo || (admin.email || '?')[0].toUpperCase()
}

function roleTone(role) {
  return role === 'doctor'
    ? 'bg-brand-900 text-brand-100'
    : 'bg-ink-100 text-ink-600'
}

function RolePill({ role }) {
  return (
    <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium capitalize text-ink-700">
      {role || '—'}
    </span>
  )
}

function StatusPill({ status }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-amber-bg px-2 py-0.5 text-2xs font-medium text-signal-amber ring-1 ring-inset ring-signal-amber-ring">
      <span className="h-1.5 w-1.5 rounded-full bg-signal-amber" />
      Pending
    </span>
  )
}

// One surface split by hairlines instead of three floating cards. The coloured
// icon tiles are gone — a shield glyph repeated three times carried no
// information, it just told you three times that this page is about admins.
// Numbers are font-medium with tabular figures: at 30px, weight 500 reads far
// more expensive than weight 800.
function StatRail({ items }) {
  const TONE = {
    default: 'text-ink-900',
    positive: 'text-brand-700',
    warning: 'text-signal-amber',
  }
  return (
    <section className="grid grid-cols-3 overflow-hidden rounded-panel bg-white shadow-e2 sm:divide-x sm:divide-ink-100">
      {items.map((it) => (
        <div key={it.label} className="px-5 py-4">
          <p className="text-xs font-medium text-ink-500">{it.label}</p>
          <p className={`tnum mt-1 text-[30px] font-medium leading-none ${TONE[it.tone || 'default']}`}>{it.value}</p>
        </div>
      ))}
    </section>
  )
}

function PowerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M12 3v8" strokeLinecap="round" />
      <path d="M6.5 6.5a8 8 0 1 0 11 0" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </svg>
  )
}

// Shared modal shell: portal to <body>, Escape-to-close, backdrop click,
// and body-scroll lock — matches the pattern already used elsewhere in the
// admin panel (see AddAnnualExamModal.jsx).
function ModalShell({ onClose, maxWidth = 'max-w-md', children, labelledBy }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[3px] animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`flex max-h-[85vh] w-full ${maxWidth} flex-col overflow-hidden rounded-panel bg-white shadow-e4 animate-pop-in motion-reduce:animate-none`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function AdminsPanel() {
  // Roster (active admins)
  const [admins, setAdmins] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Counts for the stat strip (active + pending, from the backend)
  const [counts, setCounts] = useState({ active: 0, pending: 0 })

  // Pending requests
  const [showRequests, setShowRequests] = useState(false)
  const [pendingAdmins, setPendingAdmins] = useState([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [pendingLoading, setPendingLoading] = useState(false)

  // Add admin
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('nurse')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')

  // Confirm delete / reject
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  async function fetchAdmins() {
    setLoading(true)
    setError('')
    try {
      const res = await adminsApi.list({ page, page_size: pageSize, search: debouncedSearch || undefined, view: 'roster' })
      setAdmins(res.admins || [])
      setTotal(res.total || 0)
      if (res.counts) setCounts(res.counts)
    } catch (err) {
      setError(err?.message || 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPending() {
    setPendingLoading(true)
    try {
      const res = await adminsApi.list({ page: 1, page_size: 100, view: 'pending' })
      setPendingAdmins(res.admins || [])
      setPendingTotal(res.total || 0)
      if (res.counts) setCounts(res.counts)
    } catch {
      // Badge/queue just stays at its last known value on failure.
    } finally {
      setPendingLoading(false)
    }
  }

  useEffect(() => { fetchAdmins() }, [page, pageSize, debouncedSearch])
  // Pending is independent of the roster search box — it only needs to
  // refresh on mount and after mutations (handled explicitly below).
  useEffect(() => { fetchPending() }, [])

  // Derive self email via the Supabase session, used to block someone from
  // deactivating or deleting their own account from this screen.
  const [selfEmail, setSelfEmail] = useState('')
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setSelfEmail((data?.user?.email || '').toLowerCase()))
  }, [])

  async function refreshAll() {
    await Promise.all([fetchAdmins(), fetchPending()])
  }

  async function handleDeactivate(admin) {
    setError('')
    try {
      await adminsApi.deactivate(admin.admin_id)
      refreshAll()
    } catch (err) {
      setError(err?.message || 'Action failed')
    }
  }

  async function handleAccept(admin) {
    setError('')
    try {
      await adminsApi.activate(admin.admin_id)
      refreshAll()
    } catch (err) {
      setError(err?.message || 'Action failed')
    }
  }

  async function handleConfirmedRemoval() {
    if (!confirmTarget) return
    setConfirmSubmitting(true)
    setConfirmError('')
    try {
      await adminsApi.remove(confirmTarget.admin_id, confirmEmail.trim())
      setConfirmTarget(null)
      setConfirmEmail('')
      refreshAll()
    } catch (err) {
      setConfirmError(err?.message || 'Action failed')
    } finally {
      setConfirmSubmitting(false)
    }
  }

  async function handleAddAdmin() {
    setAddSubmitting(true)
    setAddError('')
    setAddSuccess('')
    try {
      await adminsApi.add({ email: addEmail.trim().toLowerCase(), role: addRole })
      setAddSuccess(`Invite created for ${addEmail.trim()}. They'll appear under Requests once they sign up.`)
      setAddEmail('')
      fetchPending()
    } catch (err) {
      setAddError(err?.message || 'Failed to add admin')
    } finally {
      setAddSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const emailValid = EMAIL_RE.test(addEmail.trim()) && addEmail.trim().toLowerCase().endsWith(EMAIL_DOMAIN)
  const confirmMatches = confirmTarget && confirmEmail.trim().toLowerCase() === (confirmTarget.email || '').toLowerCase()

  const skeletonRows = useMemo(() => Array.from({ length: 5 }), [])

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* The "ADMIN MANAGEMENT" eyebrow is gone: a tracked-out all-caps
              label above a heading that already says the same thing is the
              commonest generic-admin-template tell, and the sidebar already
              shows you where you are. */}
          <h1 className="font-serif text-3xl font-semibold text-ink-900">Admins &amp; staff</h1>
          <p className="mt-1 text-base text-ink-500">Nurse and doctor accounts for the Health Services portal.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowRequests(true)}
            className="btn-press relative inline-flex items-center gap-2 rounded-control border border-ink-200 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 shadow-e1 hover:bg-ink-50"
          >
            <BellIcon className="h-4 w-4 text-ink-500" />
            Requests
            {pendingTotal > 0 && (
              <span className="tnum absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-signal-amber px-1 text-2xs font-semibold leading-none text-white ring-2 ring-canvas">
                {pendingTotal > 99 ? '99+' : pendingTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowAdd(true); setAddError(''); setAddSuccess('') }}
            className="btn-press inline-flex items-center gap-2 rounded-control bg-brand-900 px-3.5 py-2 text-sm font-medium text-white shadow-e1 hover:bg-brand-800 active:bg-brand-950"
          >
            <PlusIcon className="h-4 w-4" />
            New Admin
          </button>
        </div>
      </div>

      {/* ---------- Stat strip ---------- */}
      <StatRail
        items={[
          { label: 'Active staff', value: counts.active, tone: 'positive' },
          { label: 'Pending requests', value: counts.pending, tone: counts.pending ? 'warning' : 'default' },
          { label: 'Total on record', value: counts.active + counts.pending },
        ]}
      />

      {error && <p role="alert" className="text-sm font-medium text-signal-rose">{error}</p>}

      {/* ---------- Roster ---------- */}
      {/* Search moves inside the panel header: it only filters this table, so
          floating it above as a separate element made its scope ambiguous. */}
      <div className="overflow-hidden rounded-panel bg-white shadow-e2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Staff roster</h2>
            <p className="text-xs text-ink-500">{total} {total === 1 ? 'account' : 'accounts'}</p>
          </div>
          <div className="relative w-full max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search name, email, or role"
              className="w-full rounded-control border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Sentence case, not NAME / EMAIL / ROLE. Tracked-out caps make
                headers shout louder than the data they label. */}
            <thead className="border-b border-ink-100 text-left text-xs font-medium text-ink-500">
              <tr>
                <th className="px-3 py-2.5 pl-5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">License no.</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 pr-5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="tbl-animate divide-y divide-ink-100">
              {loading ? (
                skeletonRows.map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={6}>
                      <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
                    </td>
                  </tr>
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    {/* An empty screen is an invitation to act, so it carries
                        the action that fills it. */}
                    <p className="text-base font-medium text-ink-900">
                      {debouncedSearch ? `No staff match “${debouncedSearch}”` : 'No staff accounts yet'}
                    </p>
                    <p className="mx-auto mt-1 max-w-[42ch] text-sm text-ink-500">
                      {debouncedSearch
                        ? 'Check the spelling, or search by email instead.'
                        : 'Invite a nurse or doctor and they’ll appear here once they sign up.'}
                    </p>
                    {!debouncedSearch && (
                      <button
                        onClick={() => { setShowAdd(true); setAddError(''); setAddSuccess('') }}
                        className="btn-press mt-4 inline-flex items-center gap-2 rounded-control bg-brand-900 px-3.5 py-2 text-sm font-medium text-white shadow-e1 hover:bg-brand-800"
                      >
                        <PlusIcon className="h-4 w-4" />
                        New admin
                      </button>
                    )}
                  </td>
                </tr>
              ) : admins.map((a) => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                const isSelf = (a.email || '').toLowerCase() === selfEmail
                return (
                  <tr key={a.admin_id} className="group/row row-hover hover:bg-ink-50/70">
                    <td className="px-3 py-3 pl-5">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-semibold ${roleTone(a.role)}`}>
                          {initials(a)}
                        </span>
                        <span className="font-medium text-ink-900">
                          {name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-ink-400">You</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{a.email}</td>
                    <td className="px-3 py-3"><RolePill role={a.role} /></td>
                    <td className="tnum px-3 py-3 text-ink-600">{a.license_no || '—'}</td>
                    <td className="px-3 py-3"><StatusPill status={a.status} /></td>
                    <td className="px-3 py-3 pr-5">
                      {/* Actions rest at 60% and come up to full on row hover
                          or keyboard focus. Eight fully-saturated controls in a
                          four-row table competed with the data itself — but
                          hiding them outright would hurt discoverability, so
                          they dim rather than disappear. */}
                      <div className="flex items-center justify-end gap-1.5 opacity-60 transition-opacity duration-150 focus-within:opacity-100 group-hover/row:opacity-100">
                        <button
                          onClick={() => handleDeactivate(a)}
                          disabled={isSelf}
                          title={isSelf ? "You can't deactivate your own account" : 'Deactivate'}
                          className="btn-press inline-flex items-center gap-1.5 rounded-control border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <PowerIcon className="h-3.5 w-3.5" />
                          Deactivate
                        </button>
                        <button
                          onClick={() => { setConfirmTarget(a); setConfirmEmail(''); setConfirmError('') }}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot delete yourself' : 'Delete'}
                          className="btn-press inline-flex h-8 w-8 items-center justify-center rounded-control text-signal-rose hover:bg-signal-rose-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Pagination ---------- */}
      <div className="flex items-center justify-between gap-2">
        <p className="tnum text-xs text-ink-500">Page {page} of {totalPages} &middot; {total} total</p>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-control border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-control border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ---------- Requests modal ---------- */}
      {showRequests && (
        <ModalShell onClose={() => setShowRequests(false)} maxWidth="max-w-3xl" labelledBy="requests-title">
          <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
            <h3 id="requests-title" className="flex items-center gap-2 text-base font-semibold text-ink-900">
              Pending Requests
              <span className="tnum rounded-full bg-signal-amber-bg px-2 py-0.5 text-xs font-medium text-signal-amber ring-1 ring-inset ring-signal-amber-ring">{pendingTotal}</span>
            </h3>
            <button onClick={() => setShowRequests(false)} className="btn-press rounded-control p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Close">✕</button>
          </div>
          <div className="overflow-auto p-5">
            {pendingLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded-control bg-ink-100" />
                ))}
              </div>
            ) : pendingAdmins.length === 0 ? (
              <div className="py-14 text-center">
                <BellIcon className="mx-auto h-8 w-8 text-ink-300" />
                <p className="mt-3 text-base font-medium text-ink-900">No pending requests</p>
                <p className="mt-1 text-sm text-ink-500">New sign-ups and re-activation requests will show up here.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-card ring-1 ring-ink-100">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink-100 text-left text-xs font-medium text-ink-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium">Role</th>
                      <th className="px-4 py-2.5 font-medium">License no.</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="tbl-animate divide-y divide-ink-100">
                    {pendingAdmins.map((a) => {
                      const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                      return (
                        <tr key={a.admin_id} className="row-hover hover:bg-ink-50/70">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${roleTone(a.role)}`}>
                                {initials(a)}
                              </span>
                              {name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-600">{a.email}</td>
                          <td className="px-4 py-3"><RolePill role={a.role} /></td>
                          <td className="px-4 py-3 text-ink-600">{a.license_no || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleAccept(a)} className="btn-press rounded-control bg-brand-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Accept</button>
                              <button onClick={() => { setConfirmTarget(a); setConfirmEmail(''); setConfirmError('') }} className="btn-press rounded-control px-3 py-1.5 text-xs font-medium text-signal-rose hover:bg-signal-rose-bg">Reject</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-ink-100 px-6 py-3.5">
            <button onClick={() => setShowRequests(false)} className="btn-press rounded-control border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Close</button>
          </div>
        </ModalShell>
      )}

      {/* ---------- Add admin modal ---------- */}
      {showAdd && (
        <ModalShell onClose={() => setShowAdd(false)} labelledBy="add-admin-title">
          <div className="px-6 pb-2 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
              <ShieldIcon className="h-5 w-5" />
            </div>
            <h3 id="add-admin-title" className="mt-3 text-lg font-semibold text-ink-900">Invite a new admin</h3>
            <p className="mt-1 text-sm text-ink-500">
              They'll need to sign up with this email before they can be activated.
            </p>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-600">Email address</label>
              <input
                type="email"
                autoFocus
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder={`name${EMAIL_DOMAIN}`}
                className="w-full rounded-control border border-ink-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />
              {addEmail.trim() && !emailValid && (
                <p className="mt-1.5 text-xs text-signal-rose">Use a {EMAIL_DOMAIN} address.</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-600">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ALLOWED_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAddRole(r)}
                    className={`btn-press rounded-xl border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                      addRole === r
                        ? 'border-brand-900 bg-brand-900 text-white shadow-e1'
                        : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {addError && (
              <div className="rounded-control bg-signal-rose-bg px-4 py-3 text-sm font-medium text-signal-rose ring-1 ring-inset ring-signal-rose-ring animate-fade-in">{addError}</div>
            )}
            {addSuccess && (
              <div className="rounded-control bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200 animate-fade-in">{addSuccess}</div>
            )}
          </div>
          <div className="flex gap-3 border-t border-ink-100 px-6 py-4">
            <button onClick={() => setShowAdd(false)} className="btn-press flex-1 rounded-control border border-ink-200 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50">
              {addSuccess ? 'Done' : 'Cancel'}
            </button>
            {!addSuccess && (
              <button
                onClick={handleAddAdmin}
                disabled={!emailValid || addSubmitting}
                className="btn-press flex-1 rounded-control bg-brand-900 py-2.5 text-sm font-medium text-white shadow-e1 hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addSubmitting ? 'Sending invite…' : 'Send invite'}
              </button>
            )}
          </div>
        </ModalShell>
      )}

      {/* ---------- Confirm delete / reject modal ---------- */}
      {confirmTarget && (
        <ModalShell onClose={() => setConfirmTarget(null)} maxWidth="max-w-md" labelledBy="confirm-title">
          <div className="px-6 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-signal-rose-bg text-signal-rose">
              <TrashIcon className="h-5 w-5" />
            </div>
            <h3 id="confirm-title" className="mt-3 text-lg font-semibold text-ink-900">
              {confirmTarget.status === 'pending' ? 'Reject request?' : 'Delete admin?'}
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              This can't be undone. Type <span className="font-medium text-ink-900">{confirmTarget.email}</span> to confirm.
            </p>
          </div>
          <div className="px-6 py-4">
            <input
              autoFocus
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={confirmTarget.email}
              className="w-full rounded-control border border-ink-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-signal-rose focus:ring-2 focus:ring-signal-rose/15"
            />
            {confirmError && <p role="alert" className="mt-3 text-sm font-medium text-signal-rose animate-fade-in">{confirmError}</p>}
          </div>
          <div className="flex gap-3 border-t border-ink-100 px-6 py-4">
            <button
              onClick={() => { setConfirmTarget(null); setConfirmEmail(''); setConfirmError('') }}
              className="btn-press flex-1 rounded-control border border-ink-200 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmedRemoval}
              disabled={!confirmMatches || confirmSubmitting}
              className="btn-press flex-1 rounded-control bg-signal-rose py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmSubmitting ? 'Please wait…' : confirmTarget.status === 'pending' ? 'Reject' : 'Delete'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
