import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../components/auth/AuthShell.jsx'
import LoginForm from '../../components/auth/LoginForm.jsx'
import { adminSignIn } from '../../lib/supabaseClient.js'

const BRAND = {
  logo: '/gordon-college-logo.png',
  name: 'GORDON COLLEGE',
  tagline: 'Clinic Appointment System'
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit({ username, password }) {
    setError('')
    setLoading(true)
    try {
      await adminSignIn(username, password)
      navigate('/admin/dashboard')
    } catch (err) {
      setError(err?.message || 'Unable to log in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell brand={BRAND} tone="admin">
      <LoginForm align="left" onSubmit={handleSubmit} loading={loading} error={error} />
    </AuthShell>
  )
}
