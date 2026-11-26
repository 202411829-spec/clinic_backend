// Source contracts for the admin access-role migration:
// authoritative role via AdminAccessContext, super-admin gating in the
// Admins panel, admin/super_admin-only roles, the invite email exception,
// adminsApi.updateRole, and the fixed-role admin signup payload.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const context = readFileSync('src/context/AdminAccessContext.jsx', 'utf8')
const layout = readFileSync('src/layouts/AdminLayout.jsx', 'utf8')
const topbar = readFileSync('src/components/navigation/TopBar.jsx', 'utf8')
const panel = readFileSync('src/components/admin/AdminsPanel.jsx', 'utf8')
const signup = readFileSync('src/pages/auth/AdminSignUp.jsx', 'utf8')
const api = readFileSync('src/lib/api.js', 'utf8')
const validation = readFileSync('src/lib/signupValidation.js', 'utf8')

test('AdminAccessContext exposes role and isSuperAdmin and fails closed', () => {
  assert.match(context, /export function AdminAccessProvider/)
  assert.match(context, /export function useAdminAccess/)
  assert.match(context, /createContext\(\{ role: null, isSuperAdmin: false \}\)/)
  // Only the two migrated roles resolve; anything else (missing, legacy
  // nurse/doctor, fetch failure) collapses to a plain non-super admin.
  assert.match(context, /role === 'admin' \|\| role === 'super_admin' \? role : null/)
  assert.match(context, /isSuperAdmin: resolved === 'super_admin'/)
})

test('AdminLayout stores the role from its single adminsApi.me() fetch and wraps the return', () => {
  assert.equal((layout.match(/await adminsApi\.me\(/g) || []).length, 1, 'must keep exactly one me() fetch')
  assert.match(layout, /setAdminRole\(record\.role === 'admin' \|\| record\.role === 'super_admin' \? record\.role : null\)/)
  assert.match(layout, /<AdminAccessProvider role=\{adminRole\}>/)
  // Fail closed on every non-success path: no email, empty record, fetch error.
  assert.match(layout, /if \(!email\) \{[\s\S]*?setAdminRole\(null\)/)
  assert.match(layout, /catch \{\s*if \(!cancelled\) \{\s*setAdminRole\(null\)/)
})

test('TopBar reads the authoritative role and never falls back to Nurse', () => {
  assert.match(topbar, /useAdminAccess\(\)/)
  assert.match(topbar, /const \{ role \} = useAdminAccess\(\)/)
  assert.doesNotMatch(topbar, /Nurse/)
  assert.doesNotMatch(topbar, /user_metadata\?\.role/)
  assert.match(topbar, /role === 'super_admin' \? 'Super Admin' : 'Admin'/)
})

test('Admins panel gates invite controls, modal, and handler on isSuperAdmin', () => {
  assert.match(panel, /const \{ isSuperAdmin \} = useAdminAccess\(\)/)
  assert.match(panel, /\{isSuperAdmin && \(\s*<button/)
  assert.match(panel, /\{!debouncedSearch && isSuperAdmin && \(/)
  assert.match(panel, /\{showAdd && isSuperAdmin && \(/)

  const addStart = panel.indexOf('async function handleAddAdmin()')
  const addEnd = panel.indexOf('async function handleChangeRole')
  assert.ok(addStart >= 0 && addEnd > addStart, 'handleAddAdmin not found')
  const addBody = panel.slice(addStart, addEnd)
  assert.match(addBody, /if \(!isSuperAdmin\) return/, 'handler must refuse non-super-admins')
  assert.match(addBody, /const result = await adminsApi\.add\(\{ email, role: addRole \}\)/)
  assert.match(addBody, /result\?\.email_sent === true/, 'success message must depend on real send result')
  assert.match(addBody, /result\.created \? `Invite sent to \$\{email\}\.` : `Invite sent again to \$\{email\}\.`/)
})

test('Admins panel exposes super-admin-only resend with real result and busy state', () => {
  const start = panel.indexOf('async function handleResendInvite(admin)')
  const end = panel.indexOf('// Super-admin only: change another admin')
  assert.ok(start >= 0 && end > start, 'handleResendInvite not found')
  const body = panel.slice(start, end)
  assert.match(body, /if \(!isSuperAdmin\) return/)
  assert.match(body, /const email = \(admin\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/)
  assert.match(body, /role: ALLOWED_ROLES\.includes\(admin\.role\) \? admin\.role : 'admin'/)
  assert.match(body, /resend: true/)
  assert.match(body, /result\?\.email_sent === true\s*\? `Invite sent again to \$\{email\}\.`/)
  assert.match(body, /result\?\.error \|\| result\?\.message \|\| `No new email was sent/)
  assert.match(body, /catch \(err\)[\s\S]*err\?\.message \|\| 'Failed to resend invite'/)
  assert.match(panel, /\{isSuperAdmin && \(\s*<button\s+onClick=\{\(\) => handleResendInvite\(a\)\}/)
  assert.match(panel, /aria-busy=\{resendingId === a\.admin_id\}/)
  assert.match(panel, /resendingId === a\.admin_id \? 'Sending…' : 'Resend invite'/)
})

test('Admins panel allows only admin and super_admin invite roles, default admin', () => {
  assert.match(panel, /const ALLOWED_ROLES = \['admin', 'super_admin'\]/)
  assert.match(panel, /useState\('admin'\)/)
  assert.doesNotMatch(panel, /'nurse'|'doctor'|Nurse|Doctor/)
  assert.match(panel, /ROLE_LABELS = \{ admin: 'Admin', super_admin: 'Super Admin' \}/)
  assert.match(panel, /\{ROLE_LABELS\[r\]\}/)
})

test('Admins panel uses the invite email validator with its own exception', () => {
  assert.match(panel, /import \{ validateAdminInviteEmail \} from '\.\.\/\.\.\/lib\/signupValidation\.js'/)
  assert.match(panel, /const emailValid = !validateAdminInviteEmail\(addEmail\)/)
  assert.doesNotMatch(panel, /EMAIL_RE/)

  assert.match(validation, /export const ADMIN_INVITE_EMAIL_EXCEPTION = 'josephramos0254@gmail.com'/)
  assert.match(validation, /export function validateAdminInviteEmail/)
  // The invite exception lives only in the invite validator — the signup
  // validator keeps its own (stricter, first.last-format) exception list.
  const signupValidator = validation.slice(
    validation.indexOf('export function validateAdminSignupEmail'),
    validation.indexOf('export function validateAdminInviteEmail')
  )
  assert.match(signupValidator, /ADMIN_SIGNUP_EMAIL_EXCEPTION/)
  assert.doesNotMatch(signupValidator, /ADMIN_INVITE_EMAIL_EXCEPTION/)
})

test('api.js exposes adminsApi.updateRole against /admins/<id>/role', () => {
  assert.match(
    api,
    /updateRole: \(adminId, role\) => api\.patch\(`\/api\/admins\/\$\{adminId\}\/role`, \{ role \}\)/
  )
})

test('Admins panel role badge is a super-admin-only dropdown, never self', () => {
  const dropdownStart = panel.indexOf('function RoleDropdown(')
  const dropdownEnd = panel.indexOf('function StatusPill(')
  assert.ok(dropdownStart >= 0 && dropdownEnd > dropdownStart, 'RoleDropdown not found')
  const dropdown = panel.slice(dropdownStart, dropdownEnd)
  assert.match(dropdown, /ROLE_OPTIONS\.map/)
  assert.match(dropdown, /role="option"/)
  assert.match(dropdown, /aria-selected=\{option\.value === role\}/)
  assert.match(dropdown, /if \(!canChange\) return <RolePill role=\{role\} \/>/)
  assert.match(dropdown, /aria-busy="true"/)
  assert.match(dropdown, /Saving…/)
  assert.match(panel, /canChange=\{isSuperAdmin && !isSelf\}/)
  assert.match(panel, /busy=\{roleUpdatingId === a\.admin_id\}/)
  assert.match(panel, /onChange=\{\(nextRole\) => handleChangeRole\(a, nextRole\)\}/)
  // The redundant shield action is gone; the remaining row actions stay.
  assert.doesNotMatch(panel, /Change \$\{name\} to Super Admin/)
  assert.match(panel, />\s*Deactivate\s*</)
  assert.match(panel, /<TrashIcon/)
})

test('Admins panel role updates stay super-admin-only, exclude self, and refresh', () => {
  const changeStart = panel.indexOf('async function handleChangeRole')
  const changeEnd = panel.indexOf('const totalPages')
  assert.ok(changeStart >= 0 && changeEnd > changeStart, 'handleChangeRole not found')
  const changeBody = panel.slice(changeStart, changeEnd)
  assert.match(changeBody, /if \(!isSuperAdmin\) return/)
  assert.match(changeBody, /\(admin\.email \|\| ''\)\.toLowerCase\(\) === selfEmail/)
  assert.match(changeBody, /ALLOWED_ROLES\.includes\(nextRole\)/)
  assert.match(changeBody, /nextRole === admin\.role/)
  assert.match(changeBody, /setRoleUpdatingId\(admin\.admin_id\)/)
  assert.match(changeBody, /await adminsApi\.updateRole\(admin\.admin_id, nextRole\)/)
  assert.match(changeBody, /await refreshAll\(\)/)
  assert.match(changeBody, /No optimistic local write/)
  assert.match(changeBody, /setRoleUpdatingId\(''\)/)
})

test('Admin signup posts a fixed admin role with no role picker', () => {
  assert.match(signup, /role: 'admin'/)
  assert.doesNotMatch(signup, /setRole/)
  assert.doesNotMatch(signup, /admin-signup-role/)
  assert.doesNotMatch(signup, /Select role/)
  assert.doesNotMatch(signup, /'nurse'|'doctor'/)
})
