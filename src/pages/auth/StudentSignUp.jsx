import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StudentSignUpForm from '../../components/student/StudentSignUpForm.jsx'
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
      await studentSignIn(email, password)
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
    <div className="min-h-screen w-full bg-gc-student">
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
            <StudentSignUpForm
              align="center"
              onSignupSuccess={handleSignupSuccess}
              loading={loading}
              error={error}
            />
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
              className="h-[150px] w-[150px] object-contain"
            />
            <h1 className="mt-5 text-xl font-extrabold tracking-wide text-white">
              {BRAND.name}
            </h1>
            <p className="mt-1 text-sm text-white/90">{BRAND.tagline}</p>
          </div>

          <div className="flex flex-1 items-center justify-center rounded-tl-[5rem] rounded-bl-[5rem] bg-white px-10">
            <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-10 shadow-xl shadow-black/5">
              <StudentSignUpForm
                align="left"
                onSignupSuccess={handleSignupSuccess}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
