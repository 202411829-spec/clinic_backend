// src/App.example.jsx
// Reference only — merge the /admin/* routes below into your REAL src/App.jsx.
// Don't just copy-paste this whole file over your existing App.jsx, since it
// almost certainly already has your AdminLogin route and other setup.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/auth/AdminLogin";
import AdminLayout from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* everything under AdminLayout gets the sidebar + topbar */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
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

// ---------------------------------------------------------------------------
// STUDENT PORTAL — reference only. Merge into your real App.jsx once the
// student side is ready to wire up. Needs these imports added up top:
//
//   import StudentLogin from './pages/auth/StudentLogin.jsx'
//   import StudentLayout from './components/student/StudentLayout.jsx'
//   import StudentDashboard from './pages/student/Dashboard.jsx'
//   import StudentBook from './pages/student/Book.jsx'
//   import StudentRecord from './pages/student/StudentRecord.jsx'
//   import { AppointmentProvider } from './context/AppointmentContext.jsx'
//
// StudentLayout needs AppointmentProvider above it (Book.jsx, Dashboard.jsx,
// and the notifications panel all read/write the shared appointment state
// through that context) — so wrap StudentLayout with it, not just the app.
//
// <Route path="/student/login" element={<StudentLogin />} />
//
// <Route
//   path="/student"
//   element={
//     <AppointmentProvider>
//       <StudentLayout />
//     </AppointmentProvider>
//   }
// >
//   <Route path="dashboard" element={<StudentDashboard />} />
//   <Route path="book" element={<StudentBook />} />
//   <Route path="record" element={<StudentRecord />} />
// </Route>
// ---------------------------------------------------------------------------
