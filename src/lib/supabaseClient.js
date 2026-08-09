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
