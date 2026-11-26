import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm.jsx'
import { FORGOT_PASSWORD_VARIANTS } from '../../lib/forgotPasswordVariants.js'

const cfg = FORGOT_PASSWORD_VARIANTS.student

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

  // SignUpLayout always offers a footer link by default; the form already
  // prints its own "Log in" link, so the layout footer is left empty.
  return (
    <SignUpLayout
      portalLabel={cfg.portalLabel}
      title="Reset your password"
      subtitle={cfg.subtitle}
      footer={<></>}
    >
      <ForgotPasswordForm showHeader={false} onSuccess={handleResetSuccess} error={error} />
    </SignUpLayout>
  )
}
