import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../components/auth/AuthShell.jsx'
import StudentLoginForm from '../../components/auth/StudentLoginForm.jsx'
import { studentSignIn } from '../../lib/supabaseClient.js'

const BRAND = {
  logo: '/gordon-college-seal.png',
  name: 'GORDON COLLEGE',
  tagline: 'Clinic Appointment System'
}

export default function StudentLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit({ username, password }) {
    setError('')
    setLoading(true)
    try {
      await studentSignIn(username, password)
      navigate('/student/dashboard')
    } catch (err) {
      setError(err?.message || 'Unable to log in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell brand={BRAND} tone="student">
      <StudentLoginForm align="left" onSubmit={handleSubmit} loading={loading} error={error} />
    </AuthShell>
  )
}
