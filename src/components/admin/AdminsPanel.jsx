import { useEffect, useState } from 'react'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'

export default function AdminsPanel() {
  const [admins, setAdmins] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [error, setError] = useState('')
  const [showRequests, setShowRequests] = useState(false)
  const [pendingAdmins, setPendingAdmins] = useState([])
  const [pendingTotal, setPendingTotal] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  async function fetchAdmins() {
    setLoading(true)
    try {
      const res = await adminsApi.list({ page, page_size: pageSize, search: debouncedSearch || undefined })
      setAdmins(res.admins || [])
      setTotal(res.total || 0)
    } catch (err) {
      setError(err?.message || 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPending() {
    try {
      const res = await adminsApi.list({ page: 1, page_size: 100, search: undefined })
      const pending = (res.admins || []).filter(a => a.status === 'pending')
      setPendingAdmins(pending)
      // if backend returns total, we count filtered; if many pending beyond 100, still approximate
      setPendingTotal(pending.length)
    } catch {
      // ignore pending count errors
    }
  }

  useEffect(() => { fetchAdmins() }, [page, pageSize, debouncedSearch])
  useEffect(() => { fetchPending() }, [])

  // Refresh pending whenever admins change or after mutations
  useEffect(() => {
    // also derive from current page as fallback, but separate fetch is more accurate
    // we keep separate fetch on debouncedSearch as well to keep badge accurate
    fetchPending()
  }, [debouncedSearch])

  // Derive self admin_id via supabase session for delete guard
  const [selfEmail, setSelfEmail] = useState('')
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setSelfEmail((data?.user?.email || '').toLowerCase()))
  }, [])

  async function handleToggle(admin) {
    try {
      if (admin.status === 'active') await adminsApi.deactivate(admin.admin_id)
      else await adminsApi.activate(admin.admin_id)
      fetchAdmins()
      fetchPending()
    } catch (err) {
      setError(err?.message || 'Action failed')
    }
  }

  async function handleDelete(admin) {
    try {
      await adminsApi.remove(admin.admin_id, confirmEmail.trim())
      setConfirmDelete(null)
      setConfirmEmail('')
      fetchAdmins()
      fetchPending()
    } catch (err) {
      setError(err?.message || 'Delete failed')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const displayedAdmins = admins.filter(a => a.status !== 'pending')
  const pendingCount = pendingTotal

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
        <button
          onClick={() => setShowRequests(true)}
          className="relative inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Requests
          {pendingCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold leading-none text-white animate-pulse">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search email, name, role…" className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">License No.</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {displayedAdmins.length === 0 ? (
                <tr className="border-t"><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No admins found.</td></tr>
              ) : displayedAdmins.map(a => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                const isSelf = (a.email || '').toLowerCase() === selfEmail
                return (
                  <tr key={a.admin_id} className="border-t">
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3">{a.email}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{a.role}</span></td>
                    <td className="px-4 py-3">{a.license_no || '—'}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      {a.status === 'active' ? (
                        <button onClick={() => handleToggle(a)} className="rounded-lg border px-3 py-1 text-xs font-semibold">Deactivate</button>
                      ) : (
                        <button onClick={() => handleToggle(a)} className="rounded-lg bg-gc-accent px-3 py-1 text-xs font-semibold text-white">Activate</button>
                      )}
                      <button disabled={isSelf} title={isSelf ? 'Cannot delete yourself' : ''} onClick={() => setConfirmDelete(a)} className="text-xs font-semibold text-red-600 disabled:opacity-40">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Prev</button>
        <span className="text-sm">Page {page} of {totalPages} ({total} total)</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Next</button>
      </div>

      {showRequests && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-base font-bold text-gray-900">Pending Requests <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{pendingCount}</span></h3>
              <button onClick={() => setShowRequests(false)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">✕</button>
            </div>
            <div className="overflow-auto p-4">
              {pendingAdmins.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">No pending requests</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">License No.</th><th className="px-4 py-3">Actions</th></tr>
                    </thead>
                    <tbody>
                      {pendingAdmins.map(a => {
                        const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                        return (
                          <tr key={a.admin_id} className="border-t">
                            <td className="px-4 py-3">{name}</td>
                            <td className="px-4 py-3">{a.email}</td>
                            <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{a.role}</span></td>
                            <td className="px-4 py-3">{a.license_no || '—'}</td>
                            <td className="px-4 py-3 flex items-center gap-2">
                              <button onClick={() => handleToggle(a)} className="rounded-lg bg-gc-accent px-3 py-1 text-xs font-semibold text-white">Accept</button>
                              <button onClick={() => setConfirmDelete(a)} className="text-xs font-semibold text-red-600">Reject</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t px-6 py-3">
              <button onClick={() => setShowRequests(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-bold">{confirmDelete.status === 'pending' ? 'Reject request?' : 'Delete admin?'}</h3>
            <p className="mt-1 text-sm text-gray-600">Type <span className="font-semibold">{confirmDelete.email}</span> to confirm.</p>
            <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder={confirmDelete.email} className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
            {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setConfirmDelete(null); setConfirmEmail(''); setError('') }} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white">{confirmDelete.status === 'pending' ? 'Reject' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
