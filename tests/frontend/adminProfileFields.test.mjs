// Admin Profile fields mirror Admin Signup's separate name fields and reuse
// the same validation/normalization rules instead of a combined full_name.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ADMIN_PROFILE_SUFFIX_MAX,
  buildAdminProfilePatch,
  validateAdminProfile,
} from '../../src/lib/adminProfile.js'

const profile = readFileSync('src/pages/admin/Profile.jsx', 'utf8')
const signup = readFileSync('src/pages/auth/AdminSignUp.jsx', 'utf8')
const helpers = readFileSync('src/lib/adminProfile.js', 'utf8')

test('validateAdminProfile matches Admin Signup messages for name fields', () => {
  assert.equal(validateAdminProfile({ last_name: 'Doe', first_name: 'Jane', middle_initial: 'M.', suffix: 'Jr' }), '')
  assert.equal(validateAdminProfile({ last_name: ' ', first_name: 'Jane' }), 'Last name is required.')
  assert.equal(validateAdminProfile({ last_name: 'Doe', first_name: ' ' }), 'First name is required.')
  assert.equal(
    validateAdminProfile({ last_name: 'Doe', first_name: 'Jane', middle_initial: 'Mary' }),
    'Middle initial must be a single letter, optionally followed by a period.'
  )
  assert.equal(
    validateAdminProfile({ last_name: 'Doe', first_name: 'Jane', suffix: 'X'.repeat(ADMIN_PROFILE_SUFFIX_MAX + 1) }),
    `Suffix must be ${ADMIN_PROFILE_SUFFIX_MAX} characters or fewer.`
  )
})

test('buildAdminProfilePatch only writes changed optional fields to their own columns', () => {
  const original = {
    first_name: 'Jane',
    last_name: 'Doe',
    middle_initial: null,
    suffix: null,
    license_no: 'LIC-1',
  }
  const unchanged = buildAdminProfilePatch(
    { first_name: 'Jane', last_name: 'Doe', middle_initial: '', suffix: '', license_no: 'LIC-1' },
    original
  )
  assert.equal(Object.hasOwn(unchanged, 'middle_initial'), false)
  assert.equal(Object.hasOwn(unchanged, 'suffix'), false)

  const changed = buildAdminProfilePatch(
    { first_name: 'Jane', last_name: 'Doe', middle_initial: 'm.', suffix: ' Jr ', license_no: 'LIC-1' },
    original
  )
  assert.equal(changed.middle_initial, 'M.')
  assert.equal(changed.suffix, 'Jr')
  assert.equal(Object.hasOwn(changed, 'full_name'), false)
})

test('Profile keeps Email and Role read-only and never submits a combined name', () => {
  assert.doesNotMatch(profile, /name="email"/)
  assert.doesNotMatch(profile, /name="role"/)
  assert.doesNotMatch(profile, /full_name/)
  assert.match(profile, /ROLE_LABELS = \{ admin: 'Admin', super_admin: 'Super Admin' \}/)
  assert.match(profile, /<p className="text-sm text-gray-500">Email<\/p>/)
  assert.match(profile, /<p className="text-sm text-gray-500">Role<\/p>/)
})

test('Profile name fields match Admin Signup labels and order', () => {
  const profileOrder = [
    'Last Name',
    'First Name',
    'Middle Initial',
    'Suffix',
  ].map((label) => profile.search(new RegExp(`>\\s*${label}\\s*`)))
  assert.ok(profileOrder.every((i) => i >= 0), 'all name labels must be present')
  assert.deepEqual(profileOrder, [...profileOrder].sort((a, b) => a - b))

  assert.match(profile, /id="admin-profile-middle-initial"/)
  assert.match(profile, /maxLength=\{2\}/)
  assert.match(profile, /id="admin-profile-suffix"/)
  assert.match(profile, /maxLength=\{ADMIN_PROFILE_SUFFIX_MAX\}/)
  assert.match(signup, />\s*Last Name\s*</)
  assert.match(signup, />\s*First Name\s*</)
  assert.match(signup, />\s*Middle Initial\s*</)
  assert.match(signup, />\s*Suffix\s*</)
})

test('Profile loads separate fields, validates, patches, and resets from the saved record', () => {
  assert.match(profile, /middle_initial: admin\?\.middle_initial \|\| ''/)
  assert.match(profile, /suffix: admin\?\.suffix \|\| ''/)
  assert.match(profile, /validateAdminProfile\(form\)/)
  assert.match(profile, /buildAdminProfilePatch\(form, admin\)/)
  assert.match(profile, /adminsApi\.updateProfile\(admin\.admin_id, patch\)/)
  assert.match(profile, /setForm\(formFromAdmin\(res\.admin\)\)/)
  assert.match(profile, /formatAdminFormalName\(form\)/)
  assert.match(helpers, /formatAdminMiddleInitial/)
  assert.match(helpers, /isValidAdminMiddleInitial/)
})
