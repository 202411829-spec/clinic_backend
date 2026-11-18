import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from '../../components/auth/AuthShell.jsx'
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm.jsx'

const BRAND = {
  logo: '/gordon-college-seal.png',
  name: 'GORDON COLLEGE',
  tagline: 'Clinic Appointment System',
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  // Called by the form only after the backend confirms the reset succeeded.
  // Route the student back to the login screen so they can sign in with the
  // new password.
  function handleResetSuccess() {
    setError('')
    navigate('/student/login', { state: { resetSuccess: true } })
  }

  return (
    <AuthShell brand={BRAND} tone="student">
      <ForgotPasswordForm align="left" onSuccess={handleResetSuccess} error={error} />
    </AuthShell>
  )
}
