import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute.jsx'
import RouteShell from './RouteShell.jsx'
import { AppointmentProvider } from '../context/AppointmentContext.jsx'
import { ProfileCompletenessProvider } from '../context/ProfileCompletenessContext.jsx'
import * as P from './lazyPages.js'

/**
 * Single source of truth for every URL in the app.
 * Admin and student areas are separate branches, each behind its own
 * ProtectedRoute + layout, mirroring the folder layout in src/pages/*.
 */
export const router = createBrowserRouter([
  {
    element: <RouteShell />, // Suspense + ErrorBoundary + scroll restore
    children: [
      { path: '/', element: <Navigate to="/admin/login" replace /> },

      // ── Admin: public ────────────────────────────────────────────
      { path: '/admin/login', element: <P.AdminLogin /> },
      { path: '/admin/signup', element: <P.AdminSignUp /> },
      { path: '/admin/forgot-password', element: <P.AdminForgotPassword /> },

      // ── Admin: protected ─────────────────────────────────────────
      {
        path: '/admin',
        element: (
          <ProtectedRoute loginPath="/admin/login">
            <P.AdminLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', element: <P.AdminDashboard /> },
          { path: 'appointments', element: <P.Appointments /> },
          { path: 'logbook', element: <P.Logbook /> },
          { path: 'masterlist', element: <P.Masterlist /> },
          { path: 'masterlist/:studentId', element: <P.AdminStudentRecord /> },
          { path: 'masterlist/:studentId/medical-certificate', element: <P.MedicalCertificate /> },
          { path: 'masterlist/:studentId/medical-summary', element: <P.MedicalSummary /> },
          { path: 'clinic-schedule', element: <P.ClinicSchedule /> },
          { path: 'reports', element: <P.Reports /> },
          { path: 'admins', element: <P.Admins /> },
          { path: 'profile', element: <P.AdminProfile /> },
          { path: 'pending', element: <P.Pending /> },
        ],
      },

      // ── Student: public ──────────────────────────────────────────
      { path: '/student/login', element: <P.StudentLogin /> },
      { path: '/student/signup', element: <P.StudentSignUp /> },
      { path: '/student/forgot-password', element: <P.ForgotPassword /> },

      // ── Student: protected ───────────────────────────────────────
      {
        path: '/student',
        element: (
          <ProtectedRoute loginPath="/student/login">
            <AppointmentProvider>
              <ProfileCompletenessProvider>
                <P.StudentLayout />
              </ProfileCompletenessProvider>
            </AppointmentProvider>
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', element: <P.StudentDashboard /> },
          { path: 'book', element: <P.StudentBook /> },
          { path: 'profile', element: <P.StudentRecord /> },
          { path: 'record', element: <Navigate to="/student/profile" replace /> },
          { path: 'feedback', element: <P.StudentFeedback /> },
        ],
      },

      { path: '*', element: <P.NotFound /> },
    ],
  },
])
