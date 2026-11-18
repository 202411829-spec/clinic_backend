import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../components/auth/AuthShell.jsx'
import StudentSignUpForm from '../../components/auth/StudentSignUpForm.jsx'
import { studentSignIn } from '../../lib/supabaseClient.js'

const BRAND = {
  logo: '/gordon-college-seal.png',
  name: 'GORDON COLLEGE',
  tagline: 'Clinic Appointment System',
}

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
        err?.message ||
          'Your account was created, but we could not log you in automatically. Please log in manually.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell brand={BRAND} tone="student">
      <StudentSignUpForm
        align="left"
        onSignupSuccess={handleSignupSuccess}
        loading={loading}
        error={error}
      />
    </AuthShell>
  )
}
