export const EMAIL_DOMAIN = 'gordoncollege.edu.ph'

export const STUDENT_EMAIL_MESSAGE =
  'Please use your official 9-digit Gordon College student email (e.g., 202311330@gordoncollege.edu.ph).'

export const ADMIN_EMAIL_MESSAGE =
  'Please use your official Gordon College admin email (lastname.firstname@gordoncollege.edu.ph).'

const STUDENT_EMAIL_RE = /^\d{9}@gordoncollege\.edu\.ph$/
const ADMIN_EMAIL_RE = /^[a-z]+\.[a-z]+@gordoncollege\.edu\.ph$/

// Explicit live-QA exception. This only relaxes the admin signup email-format
// check; it does not create or approve an admin account.
export const ADMIN_SIGNUP_EMAIL_EXCEPTION = 'josephramos0254@gmail.com'

// Invite-time exception (admins panel): same single address, but invites
// otherwise accept any well-formed @gordoncollege.edu.ph mailbox rather
// than the first.last signup format. Never used by validateAdminSignupEmail.
export const ADMIN_INVITE_EMAIL_EXCEPTION = 'josephramos0254@gmail.com'

const INVITE_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase()
}

export function validateStudentEmail(value) {
  const email = normalizeEmail(value)
  return STUDENT_EMAIL_RE.test(email) ? null : STUDENT_EMAIL_MESSAGE
}

export function validateAdminEmail(value) {
  const email = normalizeEmail(value)
  return ADMIN_EMAIL_RE.test(email) ? null : ADMIN_EMAIL_MESSAGE
}

export function validateAdminSignupEmail(value) {
  const email = normalizeEmail(value)
  if (email === ADMIN_SIGNUP_EMAIL_EXCEPTION) return null
  return validateAdminEmail(email)
}

// Returns null when the invite address is allowed, otherwise a message.
export function validateAdminInviteEmail(value) {
  const email = normalizeEmail(value)
  if (email === ADMIN_INVITE_EMAIL_EXCEPTION) return null
  if (!INVITE_EMAIL_RE.test(email) || !email.endsWith(`@${EMAIL_DOMAIN}`)) {
    return `Please use a @${EMAIL_DOMAIN} email address.`
  }
  return null
}
