import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/auth/AdminLogin.jsx";
import AdminLayout from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Appointments from "./pages/admin/Appointments";
import Logbook from "./pages/admin/Logbook";
import Masterlist from "./pages/admin/Masterlist";
import ClinicSchedule from "./pages/admin/ClinicSchedule";
import Reports from "./pages/admin/Reports";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="logbook" element={<Logbook />} />
        <Route path="masterlist" element={<Masterlist />} />
        <Route path="clinic-schedule" element={<ClinicSchedule />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
   );
 }
