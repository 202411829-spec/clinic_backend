import { createClient } from '@supabase/supabase-js'
import { resolveAdminLoginEmail } from './adminLoginEmail.js'

const env = import.meta.env ?? {}
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

/**
 * Signs an admin in using their Gordon College username (mapped to
 * <username>@gordoncollege.edu.ph) and password.
 *
 * One exact login-only exception preserves its configured address as the
 * complete Supabase Auth email. All other input keeps the domain behavior.
 *
 * This currently calls Supabase Auth directly from the client. Once the
 * Python backend exposes an /auth/admin/login endpoint (for extra checks
 * like role verification, audit logging, etc.), swap this to call that
 * endpoint instead.
 */
export async function adminSignIn(username, password, authClient = supabase) {
  if (!authClient) {
    throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const email = resolveAdminLoginEmail(username)

  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/**
 * Signs a student in using either their Gordon College student ID OR their
 * full @gordoncollege.edu.ph email, plus password.
 *
 *   "202311330"                       -> "202311330@gordoncollege.edu.ph"
 *   "202311330@gordoncollege.edu.ph"  -> used as-is (trimmed + lowercased)
 *
 * Same pattern as adminSignIn — swap to a backend /auth/student/login
 * endpoint later if extra checks (role verification, audit logging, etc.)
 * are needed.
 */
export async function studentSignIn(username, password) {
  if (!supabase) {
    throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const value = (username ?? '').trim()
  const email = value.includes('@') ? value.toLowerCase() : `${value}@gordoncollege.edu.ph`

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
