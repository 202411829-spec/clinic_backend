import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout.jsx'
import { AppointmentProvider } from './context/AppointmentContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { ProfileCompletenessProvider } from './context/ProfileCompletenessContext.jsx'

const AdminLogin = lazy(() => import('./pages/auth/AdminLogin.jsx'))
const AdminSignUp = lazy(() => import('./pages/auth/AdminSignUp.jsx'))
const Masterlist = lazy(() => import('./pages/admin/Masterlist.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'))
const Appointments = lazy(() => import('./pages/admin/Appointments.jsx'))
const Logbook = lazy(() => import('./pages/admin/Logbook.jsx'))
const ClinicSchedule = lazy(() => import('./pages/admin/ClinicSchedule.jsx'))
const Reports = lazy(() => import('./pages/admin/Reports.jsx'))
const Admins = lazy(() => import('./pages/admin/Admins.jsx'))
const AdminProfile = lazy(() => import('./pages/admin/Profile.jsx'))
const AdminStudentRecord = lazy(() => import('./pages/admin/StudentRecord.jsx'))
const MedicalCertificate = lazy(() => import('./pages/admin/MedicalCertificate.jsx'))
const MedicalSummary = lazy(() => import('./pages/admin/MedicalSummary.jsx'))
const Pending = lazy(() => import('./pages/admin/Pending.jsx'))

const StudentLogin = lazy(() => import('./pages/auth/StudentLogin.jsx'))
const StudentSignUp = lazy(() => import('./pages/auth/StudentSignUp.jsx'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'))
const AdminForgotPassword = lazy(() => import('./pages/auth/AdminForgotPassword.jsx'))
const StudentLayout = lazy(() => import('./components/student/StudentLayout.jsx'))
const StudentDashboard = lazy(() => import('./pages/student/Dashboard.jsx'))
const StudentBook = lazy(() => import('./pages/student/Book.jsx'))
const StudentRecord = lazy(() => import('./pages/student/StudentRecord.jsx'))
const StudentFeedback = lazy(() => import('./pages/student/Feedback.jsx'))

// Shown only while a lazy-loaded route chunk is still downloading (rare,
// usually sub-second on repeat visits since Vite caches the chunks) — not
// used for auth/session checks anymore, so the sidebar is never hidden
// behind this. Fades in instead of popping in instantly, and uses a spinner
// instead of a static "Loading…" line so it reads as intentional, not stuck.
function SessionLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gc-green-100 border-t-gc-green-700" />
        <p className="text-sm font-semibold text-gc-green-700">Loading…</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ loginPath, children }) {
  const { isAuthenticated, loading } = useAuth()

  // Previously this returned <SessionLoader /> while `loading` was true,
  // which blocked the whole layout — including the sidebar — from mounting
  // until the Supabase session finished restoring. That produced a jarring
  // blank-screen-then-everything-pops-in flash. Now we render the layout
  // right away; AdminLayout/StudentLayout already show their own
  // sidebar-visible loading state internally while auth resolves, and we
  // only redirect once we're certain the visitor isn't signed in.
  if (!loading && !isAuthenticated) return <Navigate to={loginPath} replace />

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<SessionLoader />}>
        <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

      {/* ADMIN */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/signup" element={<AdminSignUp />} />
      <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute loginPath="/admin/login">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="logbook" element={<Logbook />} />
        <Route path="masterlist" element={<Masterlist />} />
        <Route path="masterlist/:studentId" element={<AdminStudentRecord />} />
        <Route path="masterlist/:studentId/medical-certificate" element={<MedicalCertificate />} />
        <Route path="masterlist/:studentId/medical-summary" element={<MedicalSummary />} />
        <Route path="clinic-schedule" element={<ClinicSchedule />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admins" element={<Admins />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="pending" element={<Pending />} />
      </Route>

      {/* STUDENT */}
      <Route path="/student/login" element={<StudentLogin />} />
      <Route path="/student/signup" element={<StudentSignUp />} />
      <Route path="/student/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute loginPath="/student/login">
            <AppointmentProvider>
              <ProfileCompletenessProvider>
                <StudentLayout />
              </ProfileCompletenessProvider>
            </AppointmentProvider>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="book" element={<StudentBook />} />
        <Route path="profile" element={<StudentRecord />} />
        <Route path="record" element={<Navigate to="/student/profile" replace />} />
        <Route path="feedback" element={<StudentFeedback />} />
      </Route>

      {/* Fallback so unmatched routes don't render a blank page */}
      <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  )
}
