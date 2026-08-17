import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

/**
 * Signs an admin in using their Gordon College username (mapped to
 * <username>@gordoncollege.edu.ph) and password.
 *
 * This currently calls Supabase Auth directly from the client. Once the
 * Python backend exposes an /auth/admin/login endpoint (for extra checks
 * like role verification, audit logging, etc.), swap this to call that
 * endpoint instead.
 */
export async function adminSignIn(username, password) {
  if (!supabase) {
    throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const email = `${username}@gordoncollege.edu.ph`

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/**
 * Signs a student in using their email, student ID, or registration number,
 * plus their password. Kept separate from adminSignIn so the two flows
 * (and any role checks around them) can change independently.
 *
 * If the entered value already looks like an email, it's used as-is.
 * Otherwise it's treated as a Gordon College ID / registration number and
 * mapped to <id>@gordoncollege.edu.ph.
 *
 * TODO: once the Python backend exposes a /auth/student/login endpoint that
 * can resolve ID/registration numbers to the correct account (for students
 * whose ID doesn't map 1:1 to their email), swap this to call that endpoint
 * instead of hitting Supabase Auth directly.
 */
export async function studentSignIn(usernameOrId, password) {
  if (!supabase) {
    throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const email = usernameOrId.includes('@') ? usernameOrId : `${usernameOrId}@gordoncollege.edu.ph`

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
