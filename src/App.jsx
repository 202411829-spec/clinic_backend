import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLogin from './pages/auth/AdminLogin.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      {/* Next up: /admin/dashboard, /admin/appointments, /admin/students ... */}
    </Routes>
  )
}
