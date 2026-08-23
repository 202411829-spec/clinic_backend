import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './pages/auth/AdminLogin.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'
import Masterlist from './pages/admin/Masterlist.jsx'
import ComingSoon from './pages/admin/ComingSoon.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import Appointments from './pages/admin/Appointments.jsx'
import Logbook from './pages/admin/Logbook.jsx'
import ClinicSchedule from './pages/admin/ClinicSchedule.jsx'
import Reports from './pages/admin/Reports.jsx'
import AdminStudentRecord from './pages/admin/StudentRecord.jsx'
import MedicalCertificate from './pages/admin/MedicalCertificate.jsx'
import MedicalSummary from './pages/admin/MedicalSummary.jsx'

import StudentLogin from './pages/auth/StudentLogin.jsx'
import StudentLayout from './components/student/StudentLayout.jsx'
import StudentDashboard from './pages/student/Dashboard.jsx'
import StudentBook from './pages/student/Book.jsx'
import StudentRecord from './pages/student/StudentRecord.jsx'
import { AppointmentProvider } from './context/AppointmentContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import StudentFeedback from './pages/student/Feedback.jsx'

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
      <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

      {/* ADMIN */}
      <Route path="/admin/login" element={<AdminLogin />} />

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
      </Route>

      {/* STUDENT */}
      <Route path="/student/login" element={<StudentLogin />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute loginPath="/student/login">
            <AppointmentProvider>
              <StudentLayout />
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
      <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Routes>
    </AuthProvider>
  )
}
