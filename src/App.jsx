import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/auth/AdminLogin.jsx";
import StudentLogin from "./pages/auth/StudentLogin.jsx";
import AdminLayout from "./components/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Appointments from "./pages/admin/Appointments.jsx";
import Logbook from "./pages/admin/Logbook.jsx";
import Masterlist from "./pages/admin/Masterlist.jsx";
import StudentRecord from "./pages/admin/StudentRecord.jsx";
import MedicalSummary from "./pages/admin/MedicalSummary.jsx";
import MedicalCertificate from "./pages/admin/MedicalCertificate.jsx";
import ClinicSchedule from "./pages/admin/ClinicSchedule.jsx";
import Reports from "./pages/admin/Reports.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/student/login" element={<StudentLogin />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="logbook" element={<Logbook />} />
        <Route path="masterlist" element={<Masterlist />} />
        <Route path="masterlist/:studentId" element={<StudentRecord />} />
        <Route path="masterlist/:studentId/medical-summary" element={<MedicalSummary />} />
        <Route path="masterlist/:studentId/medical-certificate" element={<MedicalCertificate />} />
        <Route path="clinic-schedule" element={<ClinicSchedule />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
   );
 }
