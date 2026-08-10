// src/pages/admin/Dashboard.jsx
import LogbookPanel from "../../components/admin/LogbookPanel";
import AppointmentsPanel from "../../components/admin/AppointmentsPanel";

export default function Dashboard() {
  return (
    <div className="pt-2 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Overview of today's clinic activity.
        </p>
      </div>

      <LogbookPanel />
      <AppointmentsPanel />
    </div>
  );
}
