import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm.jsx'
import { FORGOT_PASSWORD_VARIANTS } from '../../lib/forgotPasswordVariants.js'

const cfg = FORGOT_PASSWORD_VARIANTS.admin

export default function AdminForgotPassword() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  // Called by the form only after the backend confirms the reset succeeded.
  // Route the admin back to the login screen so they can sign in with the
  // new password.
  function handleResetSuccess() {
    setError('')
    navigate('/admin/login', { state: { resetSuccess: true } })
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
      <ForgotPasswordForm
        variant="admin"
        showHeader={false}
        onSuccess={handleResetSuccess}
        error={error}
      />
    </SignUpLayout>
  )
}
