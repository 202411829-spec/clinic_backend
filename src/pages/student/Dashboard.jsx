// src/pages/student/Dashboard.jsx
import UpcomingAppointmentPanel from "../../components/student/UpcomingAppointmentPanel";
import NotificationsPanel from "../../components/student/NotificationsPanel";

export default function Dashboard() {
  return (
    <div className="pt-2 md:pt-4 pb-6 md:pb-10 space-y-4 md:space-y-6 max-w-4xl mx-auto">
      <UpcomingAppointmentPanel />
      <NotificationsPanel />
    </div>
  );
}
