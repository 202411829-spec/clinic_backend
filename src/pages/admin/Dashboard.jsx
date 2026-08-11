// src/pages/admin/Dashboard.jsx
import LogbookPanel from "../../components/admin/LogbookPanel";
import AppointmentsPanel from "../../components/admin/AppointmentsPanel";

export default function Dashboard() {
  return (
    <div className="pt-2 md:pt-1 space-y-3 md:space-y-3">
      <div>
        <h1 className="text-xl md:text-lg font-bold text-gray-800">Dashboard</h1>
        <p className="text-xs md:text-xs text-gray-500">
          Overview of today's clinic activity.
        </p>
      </div>

      <LogbookPanel />
      <AppointmentsPanel />
    </div>
  );
}
