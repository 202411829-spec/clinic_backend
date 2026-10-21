// src/components/student/NotificationsPanel.jsx
import { useEffect, useState } from "react";
import NavIcon from "../ui/NavIcon.jsx";
import { useAppointment } from "../../context/AppointmentContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { notificationsApi } from "../../lib/api.js";

export default function NotificationsPanel() {
  const { notifications: liveNotifications } = useAppointment();
  const { studentId } = useAuth();
  // Real status-change history from GET /notifications/<student_id>;
  // live in-session events (booked/rescheduled/cancelled just now) on top.
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    // Uses the shared api.js wrapper so the Supabase Bearer token is
    // attached — the backend rejects unauthenticated calls with 401.
    notificationsApi
      .list(studentId)
      .then((json) => {
        if (!cancelled && json?.success) setHistory(json.notifications || []);
      })
      .catch((err) => console.error("Failed to load notifications:", err));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const notifications = [...liveNotifications, ...history];

  return (
    <section className="card-hover h-full rounded-panel bg-white p-5 shadow-e2 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-800">
          <NavIcon name="bell" className="h-5 w-5" />
          {notifications.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white ring-2 ring-white">
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <h2 className="panel-title font-serif">Notifications</h2>
          <p className="panel-sub mt-0.5">Changes to the clinic schedule and your appointments.</p>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-card ring-1 ring-inset ring-ink-100">
        {/* Small, bounded list (session notifications), so a one-time
            staggered entrance per item stays cheap — transform/opacity only. */}
        {notifications.map((n, i) => (
          <div
            key={n.id ?? `n-${i}`}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            className={`row-hover flex animate-fade-in-up items-start gap-3 px-4 py-3.5 motion-reduce:animate-none ${
              i !== notifications.length - 1 ? "border-b border-ink-100" : ""
            }`}
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
            <div className="min-w-0">
              <p className="cell-wrap text-sm text-ink-800">{n.message}</p>
              <p className="mt-1 text-xs text-ink-400">{n.time}</p>
            </div>
          </div>
        ))}
        {notifications.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-ink-400">
            No notifications yet.
          </div>
        )}
      </div>
    </section>
  );
}