// src/App.example.jsx
// Reference only — merge the /admin/* routes below into your REAL src/App.jsx.
// Don't just copy-paste this whole file over your existing App.jsx, since it
// almost certainly already has your AdminLogin route and other setup.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/auth/AdminLogin";
import AdminLayout from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Appointments from "./pages/admin/Appointments";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* everything under AdminLayout gets the sidebar + topbar */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="appointments" element={<Appointments />} />
          {/* add these pages next, reusing the same Dashboard.jsx pattern: */}
          {/* <Route path="logbook" element={<Logbook />} /> */}
          {/* <Route path="masterlist" element={<Masterlist />} /> */}
          {/* <Route path="clinic-schedule" element={<ClinicSchedule />} /> */}
          {/* <Route path="reports" element={<Reports />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
