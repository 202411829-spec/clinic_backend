// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

/**
 * Exposes the active Supabase session to the whole app:
 *   { session, loading, user, email, studentId, isAuthenticated, signOut }
 *
 * Both login flows (admin + student) call Supabase Auth directly and only
 * establish the school email "<username>@gordoncollege.edu.ph" — the auth
 * payload carries NO numeric masterlist student id. Until the backend
 * exposes an identity mapping endpoint (e.g. GET /auth/me returning
 * { student_id }), we derive the identifier from the email local part,
 * which is exactly what students type into the login form.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      // Supabase not configured (e.g. missing env vars) — don't block the UI.
      setLoading(false)
      return undefined
    }

    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data?.session ?? null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    // Keeps the UI in sync immediately on sign-in/sign-out/token refresh —
    // ProtectedRoute re-renders as soon as this fires.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null)
        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase?.auth.signOut()
  }

  const value = useMemo(() => {
    const user = session?.user ?? null
    const email = user?.email ?? null
    const studentId = email ? email.split('@')[0] : null
    return {
      session,
      user,
      email,
      studentId,
      loading,
      isAuthenticated: Boolean(session),
      signOut,
    }
  }, [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context
}
