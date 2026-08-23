import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoginForm from '../../components/LoginForm.jsx'
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
      // Sends to Masterlist for now since Dashboard isn't built yet —
      // swap to '/admin/dashboard' once that page exists.
      navigate('/admin/masterlist')
    } catch (err) {
      setError(err?.message || 'Unable to log in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gc-green-700">
      {/* ---------- Mobile / tablet-portrait layout (bottom sheet) ---------- */}
      <div className="flex min-h-screen flex-col lg:hidden">
        <div className="flex flex-col items-center px-6 pt-14 pb-16">
          <img
            src={BRAND.logo}
            alt="Gordon College seal"
            className="h-[140px] w-[140px] object-contain"
          />
          <h1 className="mt-6 text-2xl font-extrabold tracking-wide text-white">
            {BRAND.name}
          </h1>
          <p className="mt-1 text-[15px] text-white/90">{BRAND.tagline}</p>
        </div>

        <div className="-mt-8 flex-1 rounded-t-panel bg-white px-6 pb-10 pt-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm">
            <LoginForm align="center" onSubmit={handleSubmit} loading={loading} error={error} />
          </div>
        </div>
      </div>

      {/* ---------- Desktop / tablet-landscape layout (split screen) ---------- */}
      <div className="hidden h-screen w-full overflow-hidden lg:flex">
        <div className="flex h-[calc(100%-4px)] w-full">
          <div className="flex w-[31%] shrink-0 flex-col items-center justify-center">
            <img
              src={BRAND.logo}
              alt="Gordon College seal"
              className="h-[155px] w-[155px] object-contain"
            />
            <h1 className="mt-5 text-xl font-extrabold tracking-wide text-white">
              {BRAND.name}
            </h1>
            <p className="mt-1 text-sm text-white/90">{BRAND.tagline}</p>
          </div>

          <div className="flex flex-1 items-center justify-center rounded-tl-[5rem] rounded-bl-[5rem] bg-white px-10">
            <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-10 shadow-xl shadow-black/5">
              <LoginForm align="left" onSubmit={handleSubmit} loading={loading} error={error} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
