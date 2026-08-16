// src/components/student/NotificationsPanel.jsx
import NavIcon from "../admin/NavIcon";
import { notifications as sampleNotifications } from "../../data/studentDashboardSample";
import { useAppointment } from "../../context/AppointmentContext";

export default function NotificationsPanel() {
  const { notifications: liveNotifications } = useAppointment();
  // Live events (booked/rescheduled/cancelled just now) show first, above
  // the placeholder history. TODO: drop sampleNotifications once the
  // backend returns real notification history.
  const notifications = [...liveNotifications, ...sampleNotifications];

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name="bell" className="w-5 h-5" />
        </span>
        <div>
          <h2 className="font-bold text-gray-800 text-base md:text-lg tracking-wide">
            NOTIFICATIONS
          </h2>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            View changes in clinic schedule and your appointments.
          </p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        {notifications.map((n, i) => (
          <div
            key={n.id}
            className={`flex items-start gap-3 px-5 py-4 ${
              i !== notifications.length - 1 ? "border-b border-gray-200" : ""
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gc-accent mt-2 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm md:text-base text-gray-800">{n.message}</p>
              <p className="text-xs md:text-sm text-gray-400 mt-1">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
