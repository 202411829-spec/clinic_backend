import { useState } from 'react'
import { adminsApi } from '../../lib/api.js'

const ROLES = ['nurse', 'doctor']

export default function AddAdminModal({ open, onClose, onCreated }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('nurse')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Email is required.'); return }
    if (!ROLES.includes(role)) { setError('Role must be nurse or doctor'); return }
    setBusy(true)
    try {
      const res = await adminsApi.add({ email: email.trim(), role })
      onCreated?.(res.admin || res)
      setEmail('')
      setRole('nurse')
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to add admin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Add Admin</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-admin-email" className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
            <input id="add-admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@gordoncollege.edu.ph" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20" />
          </div>
          <div>
            <label htmlFor="add-admin-role" className="block text-sm font-semibold text-gray-900 mb-1">Role</label>
            <select id="add-admin-role" value={role} onChange={e => setRole(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm">
              <option value="nurse">nurse</option>
              <option value="doctor">doctor</option>
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-gc-accent py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
