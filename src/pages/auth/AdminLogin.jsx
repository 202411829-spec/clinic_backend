import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SignUpLayout from '../../components/auth/SignUpLayout.jsx'
import LoginForm from '../../components/auth/LoginForm.jsx'
import { adminSignIn } from '../../lib/supabaseClient.js'

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
    <SignUpLayout
      portalLabel="Admin Portal"
      title="Welcome"
      subtitle="Book, reschedule, or check the status of your clinic appointments."
      footer={
        <p className="mt-6 text-center text-sm text-gray-600">
          Request admin access?{' '}
          <Link to="/admin/signup" className="font-semibold text-gc-green-700 hover:text-gc-green-800">
            Sign up
          </Link>
        </p>
      }
    >
      <LoginForm onSubmit={handleSubmit} loading={loading} error={error} />
    </SignUpLayout>
  )
}
