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

// Minimal loading state shown while the Supabase session is being restored,
// so protected content never flashes for unauthenticated visitors.
function SessionLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm font-semibold text-gc-green-700">Loading…</p>
    </div>
  )
}

function ProtectedRoute({ loginPath, children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <SessionLoader />
  if (!isAuthenticated) return <Navigate to={loginPath} replace />
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
        <Route path="record" element={<StudentRecord />} />
        <Route path="feedback" element={<StudentFeedback />} />
      </Route>

      {/* Fallback so unmatched routes don't render a blank page */}
      <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  )
}
