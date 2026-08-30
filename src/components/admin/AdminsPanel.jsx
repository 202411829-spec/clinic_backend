import { useEffect, useState } from 'react'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'
import AddAdminModal from './AddAdminModal.jsx'

function StatusBadge({ status }) {
  const map = { pending: 'bg-amber-100 text-amber-700', active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-600' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status] || 'bg-gray-100'}`}>{status}</span>
}

export default function AdminsPanel() {
  const [admins, setAdmins] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [error, setError] = useState('')

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

  useEffect(() => { fetchAdmins() }, [page, pageSize, debouncedSearch])

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
    } catch (err) {
      setError(err?.message || 'Delete failed')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
        <button onClick={() => setShowAdd(true)} className="rounded-xl bg-gc-accent px-5 py-2.5 text-sm font-semibold text-white">Add Admin</button>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search email, name, role…" className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">License No.</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {admins.map(a => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                const isSelf = (a.email || '').toLowerCase() === selfEmail
                return (
                  <tr key={a.admin_id} className="border-t">
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3">{a.email}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{a.role}</span></td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
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

      <AddAdminModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={fetchAdmins} />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-bold">Delete admin?</h3>
            <p className="mt-1 text-sm text-gray-600">Type <span className="font-semibold">{confirmDelete.email}</span> to confirm.</p>
            <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder={confirmDelete.email} className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setConfirmDelete(null); setConfirmEmail('') }} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
