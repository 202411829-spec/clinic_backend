import { useEffect, useState } from 'react'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'

function RoleBadge({ role }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
      {role || '—'}
    </span>
  )
}

export default function AdminProfile() {
  const [admin, setAdmin] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', license_no: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      setLoading(true)
      setError('')
      try {
        const { data } = (await supabase?.auth.getUser()) ?? {}
        const selfEmail = (data?.user?.email || '').toLowerCase()
        if (!selfEmail) {
          setError('Could not determine your account. Please sign in again.')
          return
        }
        const res = await adminsApi.list({ search: selfEmail })
        const match = (res.admins || []).find(
          (a) => (a.email || '').toLowerCase() === selfEmail
        )
        if (!match) {
          setError('Your admin profile was not found.')
          return
        }
        if (!cancelled) {
          setAdmin(match)
          setForm({
            first_name: match.first_name || '',
            last_name: match.last_name || '',
            license_no: match.license_no || '',
          })
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    if (!admin) return
    setSaving(true)
    setError('')
    try {
      const res = await adminsApi.updateProfile(admin.admin_id, {
        first_name: form.first_name,
        last_name: form.last_name,
        license_no: form.license_no,
      })
      setAdmin(res.admin)
      setForm({
        first_name: res.admin.first_name || '',
        last_name: res.admin.last_name || '',
        license_no: res.admin.license_no || '',
      })
      setSaved(true)
    } catch (err) {
      setError(err?.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const isIncomplete =
    !admin ||
    !admin.first_name?.trim() ||
    !admin.last_name?.trim() ||
    !admin.license_no?.trim()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {admin && !loading && (
        <>
          {isIncomplete && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Complete your profile — add your name and license number.
            </div>
          )}

          {saved && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Profile saved.
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-gray-200 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="mt-1 font-medium text-gray-900">{admin.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Role</p>
                <div className="mt-1">
                  <RoleBadge role={admin.role} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">First name</span>
                <input
                  value={form.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="First name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Last name</span>
                <input
                  value={form.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Last name"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">License No.</span>
              <input
                value={form.license_no}
                onChange={(e) => updateField('license_no', e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                placeholder="License number"
              />
            </label>

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-gc-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
