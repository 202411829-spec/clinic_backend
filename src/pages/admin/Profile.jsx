import { useEffect, useState } from 'react'
import NavIcon from '../../components/ui/NavIcon.jsx'
import { PageHeader } from '../../components/ui/primitives.jsx'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'
import { formatAdminFormalName } from '../../lib/format.js'
import {
  ADMIN_PROFILE_SUFFIX_MAX,
  buildAdminProfilePatch,
  validateAdminProfile,
} from '../../lib/adminProfile.js'

const ROLE_LABELS = { admin: 'Admin', super_admin: 'Super Admin' }

function RoleBadge({ role }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
      {ROLE_LABELS[role] || role || '—'}
    </span>
  )
}

function formFromAdmin(admin) {
  return {
    last_name: admin?.last_name || '',
    first_name: admin?.first_name || '',
    middle_initial: admin?.middle_initial || '',
    suffix: admin?.suffix || '',
    license_no: admin?.license_no || '',
  }
}

export default function AdminProfile() {
  const [admin, setAdmin] = useState(null)
  const [form, setForm] = useState(formFromAdmin(null))
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
          setForm(formFromAdmin(match))
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
    const validationError = validateAdminProfile(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    try {
      const patch = buildAdminProfilePatch(form, admin)
      const res = await adminsApi.updateProfile(admin.admin_id, patch)
      setAdmin(res.admin)
      setForm(formFromAdmin(res.admin))
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
    <div className="pt-2">
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Profile"
          subtitle="Your account details and clinic license information."
          icon={<NavIcon name="user" className="h-5 w-5" />}
        />

        <div className="space-y-4">
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fade-in-up">
          {error}
        </p>
      )}

      {admin && !loading && (
        <>
          {isIncomplete && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 animate-fade-in-up">
              Complete your profile — add your name and license number.
            </div>
          )}

          {saved && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 animate-fade-in-up">
              Profile saved.
            </div>
          )}

          <div className="card-hover space-y-4 rounded-2xl border border-gray-200 p-6">
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
                <span className="text-sm font-medium text-gray-700">
                  Last Name <span className="text-red-500">*</span>
                </span>
                <input
                  id="admin-profile-last-name"
                  name="last_name"
                  autoComplete="family-name"
                  required
                  aria-required="true"
                  value={form.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Last Name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  First Name <span className="text-red-500">*</span>
                </span>
                <input
                  id="admin-profile-first-name"
                  name="first_name"
                  autoComplete="given-name"
                  required
                  aria-required="true"
                  value={form.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="First Name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Middle Initial <span className="text-xs font-normal text-gray-400">(optional)</span>
                </span>
                <input
                  id="admin-profile-middle-initial"
                  name="middle_initial"
                  autoComplete="additional-name"
                  maxLength={2}
                  value={form.middle_initial}
                  onChange={(e) => updateField('middle_initial', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Middle Initial"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Suffix <span className="text-xs font-normal text-gray-400">(optional)</span>
                </span>
                <input
                  id="admin-profile-suffix"
                  name="suffix"
                  maxLength={ADMIN_PROFILE_SUFFIX_MAX}
                  value={form.suffix}
                  onChange={(e) => updateField('suffix', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Suffix"
                />
              </label>
            </div>

            <p className="text-xs text-ink-500">
              Display name:{' '}
              <span className="font-medium text-ink-700">
                {formatAdminFormalName(form) || '—'}
              </span>
            </p>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">License No.</span>
              <input
                id="admin-profile-license"
                name="license_no"
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
                className="btn-press rounded-xl bg-gc-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving…
                  </span>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </div>
        </>
       )}
        </div>
      </div>
    </div>
  )
}

