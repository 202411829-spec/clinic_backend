import { lazy } from 'react'

// Every page is its own chunk — a visitor only downloads the screens they open.
export const AdminLogin = lazy(() => import('../pages/auth/AdminLogin.jsx'))
export const AdminSignUp = lazy(() => import('../pages/auth/AdminSignUp.jsx'))
export const AdminForgotPassword = lazy(() => import('../pages/auth/AdminForgotPassword.jsx'))
export const StudentLogin = lazy(() => import('../pages/auth/StudentLogin.jsx'))
export const StudentSignUp = lazy(() => import('../pages/auth/StudentSignUp.jsx'))
export const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword.jsx'))

export const AdminDashboard = lazy(() => import('../pages/admin/Dashboard.jsx'))
export const Appointments = lazy(() => import('../pages/admin/Appointments.jsx'))
export const Logbook = lazy(() => import('../pages/admin/Logbook.jsx'))
export const Masterlist = lazy(() => import('../pages/admin/Masterlist.jsx'))
export const AdminStudentRecord = lazy(() => import('../pages/admin/StudentRecord.jsx'))
export const MedicalCertificate = lazy(() => import('../pages/admin/MedicalCertificate.jsx'))
export const MedicalSummary = lazy(() => import('../pages/admin/MedicalSummary.jsx'))
export const ClinicSchedule = lazy(() => import('../pages/admin/ClinicSchedule.jsx'))
export const Reports = lazy(() => import('../pages/admin/Reports.jsx'))
export const Admins = lazy(() => import('../pages/admin/Admins.jsx'))
export const AdminProfile = lazy(() => import('../pages/admin/Profile.jsx'))
export const Pending = lazy(() => import('../pages/admin/Pending.jsx'))

export const StudentDashboard = lazy(() => import('../pages/student/Dashboard.jsx'))
export const StudentBook = lazy(() => import('../pages/student/Book.jsx'))
export const StudentRecord = lazy(() => import('../pages/student/StudentRecord.jsx'))
export const StudentFeedback = lazy(() => import('../pages/student/Feedback.jsx'))

export const NotFound = lazy(() => import('../pages/NotFound.jsx'))
// Layouts are lazy too so the login screens never pay for the app shell.
export const AdminLayout = lazy(() => import('../layouts/AdminLayout.jsx'))
export const StudentLayout = lazy(() => import('../layouts/StudentLayout.jsx'))
