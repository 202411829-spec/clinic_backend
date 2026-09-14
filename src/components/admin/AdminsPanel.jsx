// src/components/admin/AdminsPanel.jsx
// Admin & Staff management page: roster table, pending-requests queue, and
// the "add admin" invite flow. Redesigned for a Gordon-College-branded,
// high-end look while keeping the existing gc-green/gc-accent tokens.
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
    ? 'bg-gc-green-700 text-white'
    : 'bg-gc-accent text-white'
}

function RolePill({ role }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gc-green-50 px-2.5 py-1 text-xs font-semibold capitalize text-gc-green-800">
      {role || '—'}
    </span>
  )
}

function StatusPill({ status }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <div className="card-hover flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <ShieldIcon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-extrabold leading-none text-gray-900">{value}</p>
        <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
      </div>
    </div>
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gc-green-900/50 p-4 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`flex max-h-[85vh] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-in motion-reduce:animate-none`}
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
          <p className="text-xs font-bold uppercase tracking-wider text-gc-accent">Admin Management</p>
          <h1 className="mt-1 text-2xl font-extrabold text-gray-900 md:text-3xl">Admins &amp; Staff</h1>
          <p className="mt-1 text-sm text-gray-500">Manage nurse and doctor accounts for the Health Services portal.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowRequests(true)}
            className="btn-press relative inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <BellIcon className="h-4 w-4 text-gray-500" />
            Requests
            {pendingTotal > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold leading-none text-white">
                {pendingTotal > 99 ? '99+' : pendingTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowAdd(true); setAddError(''); setAddSuccess('') }}
            className="btn-press inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-gc-green-600 to-gc-green-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-gc-green-900/20 hover:opacity-95"
          >
            <PlusIcon className="h-4 w-4" />
            New Admin
          </button>
        </div>
      </div>

      {/* ---------- Stat strip ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Active staff" value={counts.active} tone="bg-gc-green-700 text-white" />
        <StatCard label="Pending requests" value={counts.pending} tone="bg-amber-500 text-white" />
        <StatCard label="Total on record" value={counts.active + counts.pending} tone="bg-gc-accent text-white" />
      </div>

      {/* ---------- Search ---------- */}
      <div className="relative w-full max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name, email, or role"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20"
        />
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}

      {/* ---------- Roster table ---------- */}
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gc-green-50 text-left text-xs font-bold uppercase tracking-wide text-gc-green-800">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">License No.</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                skeletonRows.map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={6}>
                      <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <ShieldIcon className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-3 text-sm font-semibold text-gray-600">No admins found</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {debouncedSearch ? 'Try a different search term.' : 'Invite a nurse or doctor to get started.'}
                    </p>
                  </td>
                </tr>
              ) : admins.map((a) => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                const isSelf = (a.email || '').toLowerCase() === selfEmail
                return (
                  <tr key={a.admin_id} className="row-hover hover:bg-gc-green-50/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${roleTone(a.role)}`}>
                          {initials(a)}
                        </span>
                        <span className="font-medium text-gray-900">{name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{a.email}</td>
                    <td className="px-5 py-3.5"><RolePill role={a.role} /></td>
                    <td className="px-5 py-3.5 text-gray-600">{a.license_no || '—'}</td>
                    <td className="px-5 py-3.5"><StatusPill status={a.status} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDeactivate(a)}
                          disabled={isSelf}
                          title={isSelf ? "You can't deactivate your own account" : 'Deactivate'}
                          className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <PowerIcon className="h-3.5 w-3.5" />
                          Deactivate
                        </button>
                        <button
                          onClick={() => { setConfirmTarget(a); setConfirmEmail(''); setConfirmError('') }}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot delete yourself' : 'Delete'}
                          className="btn-press inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
        <p className="text-xs text-gray-500">Page {page} of {totalPages} &middot; {total} total</p>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ---------- Requests modal ---------- */}
      {showRequests && (
        <ModalShell onClose={() => setShowRequests(false)} maxWidth="max-w-3xl" labelledBy="requests-title">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 id="requests-title" className="flex items-center gap-2 text-base font-bold text-gray-900">
              Pending Requests
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{pendingTotal}</span>
            </h3>
            <button onClick={() => setShowRequests(false)} className="btn-press rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close">✕</button>
          </div>
          <div className="overflow-auto p-5">
            {pendingLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : pendingAdmins.length === 0 ? (
              <div className="py-14 text-center">
                <BellIcon className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-600">No pending requests</p>
                <p className="mt-1 text-xs text-gray-400">New sign-ups and re-activation requests will show up here.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">License No.</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingAdmins.map((a) => {
                      const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                      return (
                        <tr key={a.admin_id} className="row-hover hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${roleTone(a.role)}`}>
                                {initials(a)}
                              </span>
                              {name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{a.email}</td>
                          <td className="px-4 py-3"><RolePill role={a.role} /></td>
                          <td className="px-4 py-3 text-gray-600">{a.license_no || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleAccept(a)} className="btn-press rounded-lg bg-gc-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Accept</button>
                              <button onClick={() => { setConfirmTarget(a); setConfirmEmail(''); setConfirmError('') }} className="btn-press rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Reject</button>
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
          <div className="flex justify-end border-t border-gray-100 px-6 py-3.5">
            <button onClick={() => setShowRequests(false)} className="btn-press rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Close</button>
          </div>
        </ModalShell>
      )}

      {/* ---------- Add admin modal ---------- */}
      {showAdd && (
        <ModalShell onClose={() => setShowAdd(false)} labelledBy="add-admin-title">
          <div className="px-6 pb-2 pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gc-green-50 text-gc-green-700">
              <ShieldIcon className="h-5 w-5" />
            </div>
            <h3 id="add-admin-title" className="mt-3 text-lg font-bold text-gray-900">Invite a new admin</h3>
            <p className="mt-1 text-sm text-gray-500">
              They'll need to sign up with this email before they can be activated.
            </p>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Email address</label>
              <input
                type="email"
                autoFocus
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder={`name${EMAIL_DOMAIN}`}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20"
              />
              {addEmail.trim() && !emailValid && (
                <p className="mt-1 text-xs text-red-600">Must be a valid {EMAIL_DOMAIN} address.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ALLOWED_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAddRole(r)}
                    className={`btn-press rounded-xl border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                      addRole === r
                        ? 'border-gc-green-700 bg-gc-green-700 text-white shadow-sm'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {addError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 animate-fade-in-up">{addError}</div>
            )}
            {addSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 animate-fade-in-up">{addSuccess}</div>
            )}
          </div>
          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button onClick={() => setShowAdd(false)} className="btn-press flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              {addSuccess ? 'Done' : 'Cancel'}
            </button>
            {!addSuccess && (
              <button
                onClick={handleAddAdmin}
                disabled={!emailValid || addSubmitting}
                className="btn-press flex-1 rounded-xl bg-gc-green-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <TrashIcon className="h-5 w-5" />
            </div>
            <h3 id="confirm-title" className="mt-3 text-lg font-bold text-gray-900">
              {confirmTarget.status === 'pending' ? 'Reject request?' : 'Delete admin?'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              This can't be undone. Type <span className="font-semibold text-gray-700">{confirmTarget.email}</span> to confirm.
            </p>
          </div>
          <div className="px-6 py-4">
            <input
              autoFocus
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={confirmTarget.email}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
            {confirmError && <p role="alert" className="mt-3 text-sm font-medium text-red-600 animate-fade-in-up">{confirmError}</p>}
          </div>
          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button
              onClick={() => { setConfirmTarget(null); setConfirmEmail(''); setConfirmError('') }}
              className="btn-press flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmedRemoval}
              disabled={!confirmMatches || confirmSubmitting}
              className="btn-press flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmSubmitting ? 'Please wait…' : confirmTarget.status === 'pending' ? 'Reject' : 'Delete'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
