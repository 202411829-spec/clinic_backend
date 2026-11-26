import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import StudentSignUpForm from '../../components/auth/StudentSignUpForm.jsx'
import { friendlyPasswordError } from '../../lib/authPasswordErrors.js'
import { studentSignIn } from '../../lib/supabaseClient.js'

export default function StudentSignUp() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Called by the form only after the backend confirms the account exists.
  // We then sign the new student in with Supabase and drop them into the
  // first-login "complete your record" gate at /student.
  async function handleSignupSuccess({ email, password }) {
    setError('')
    setLoading(true)
    try {
      const studentId = email.split('@')[0]
      await studentSignIn(studentId, password)
      navigate('/student')
    } catch (err) {
      setError(
        friendlyPasswordError(
          err,
          'Your account was created, but we could not log you in automatically. Please log in manually.'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <SignUpLayout
      portalLabel="Student Portal"
      title="Create your account"
      subtitle="Sign up with your Gordon College email to book clinic appointments."
      loginTo="/student/login"
    >
      <StudentSignUpForm
        onSignupSuccess={handleSignupSuccess}
        loading={loading}
        error={error}
      />
    </SignUpLayout>
  )
}
