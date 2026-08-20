import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './pages/auth/AdminLogin.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'
import Masterlist from './pages/admin/Masterlist.jsx'
import ComingSoon from './pages/admin/ComingSoon.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<ComingSoon title="Dashboard" />} />
        <Route path="appointments" element={<ComingSoon title="Appointments" />} />
        <Route path="logbook" element={<ComingSoon title="Logbook" />} />
        <Route path="masterlist" element={<Masterlist />} />
        <Route path="masterlist/:studentId" element={<ComingSoon title="Student Record" />} />
        <Route path="clinic-schedule" element={<ComingSoon title="Clinic Schedule" />} />
        <Route path="reports" element={<ComingSoon title="Reports" />} />
      </Route>
    </Routes>
  )
}
