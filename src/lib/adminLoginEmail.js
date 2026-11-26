// Login-only identifier rule. This is intentionally separate from signup,
// invitation, approval, and role logic: it only decides which Supabase Auth
// email is used for an admin login attempt.
export const ADMIN_LOGIN_EMAIL_EXCEPTION = 'josephramos0254@gmail.com'

const INSTITUTIONAL_DOMAIN = '@gordoncollege.edu.ph'

export function resolveAdminLoginEmail(username) {
  const value = String(username ?? '').trim()

  // Exact QA/login exception only. Everything else keeps the historical
  // username -> institutional email behavior, unchanged.
  if (value.toLowerCase() === ADMIN_LOGIN_EMAIL_EXCEPTION) {
    return ADMIN_LOGIN_EMAIL_EXCEPTION
  }

  return `${value}${INSTITUTIONAL_DOMAIN}`
}
