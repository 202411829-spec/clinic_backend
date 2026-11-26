import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import StudentLoginForm from '../../components/auth/StudentLoginForm.jsx'
import { supabase, studentSignIn } from '../../lib/supabaseClient.js'
import { friendlySignInError } from '../../lib/authSignInErrors.js'

export default function StudentLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit({ username, password }) {
    setError('')
    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase is not configured yet.')

      // Never let a previous session survive a fresh login attempt: a failed
      // sign-in must leave the student on the login page with no stale token
      // that could still authorize dashboard/profile requests.
      await supabase.auth.signOut().catch(() => {})

      await studentSignIn(username, password)

      // Supabase resolves the session asynchronously. Confirm the access
      // token is live before entering the protected area.
      const { data, error: sessionError } = await supabase.auth.getSession()
      const session = data?.session
      if (sessionError || !session?.access_token) {
        throw new Error('Sign-in did not establish an active session. Please try again.')
      }

      // Guard against stale/previous-account reuse: the verified session email
      // must match the student ID or school email the student typed.
      const signedInEmail = (session.user?.email ?? '').trim().toLowerCase()
      const input = (username ?? '').trim().toLowerCase()
      const expectedEmail = input.includes('@') ? input : `${input}@gordoncollege.edu.ph`
      if (!signedInEmail || signedInEmail !== expectedEmail) {
        await supabase.auth.signOut().catch(() => {})
        throw new Error('You were signed in with a different account. Please try again.')
      }

      navigate('/student/dashboard', { replace: true })
    } catch (err) {
      setError(friendlySignInError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SignUpLayout
      portalLabel="Student Portal"
      title="Welcome"
      subtitle="Book, reschedule, or check the status of your clinic appointments."
      footer={
        <p className="mt-6 text-center text-sm text-gray-600">
          No account yet?{' '}
          <Link to="/student/signup" className="font-semibold text-gc-green-700 hover:text-gc-green-800">
            Sign up
          </Link>
        </p>
      }
    >
      <StudentLoginForm onSubmit={handleSubmit} loading={loading} error={error} />
    </SignUpLayout>
  )
}
