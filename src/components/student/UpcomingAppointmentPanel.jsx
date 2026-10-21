// src/components/student/UpcomingAppointmentPanel.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon";
import { useAppointment } from "../../context/AppointmentContext";
import { appointmentsApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";
import { toYMD } from "../../lib/calendar";
import StatusPill from "./StatusPill.jsx";

// Map the card badge text back onto a pill tone (context bookings say
// "Today"/"Upcoming", backend rows say Pending/Completed/…).
const BADGE_TONE = { Completed: "completed", Cancelled: "cancelled", "No Show": "no_show" };

function formatTime(value) {
  if (!value) return "-";
  const [h, m] = String(value).slice(0, 5).split(":");
  const hour = Number(h);
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${period}`;
}

const STATUS_LABELS = { pending: "Pending", completed: "Completed", no_show: "No Show", cancelled: "Cancelled" };

// Map a raw /appointments row onto the card's display shape.
function mapAppointment(a) {
  const d = new Date(`${String(a.appointment_date).slice(0, 10)}T00:00:00`);
  return {
    id: a.appointment_id,
    month: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase(),
    time: formatTime(a.appointment_time),
    reason: a.appointment_purpose ?? "-",
    badge: STATUS_LABELS[a.current_status] ?? "Pending",
  };
}

export default function UpcomingAppointmentPanel() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { appointment: contextAppt, cancelAppointment } = useAppointment();
  const { studentId } = useAuth();

  // Real next appointment from the backend (context appt from a fresh
  // booking takes priority until the list is refreshed).
  const [upcoming, setUpcoming] = useState(null);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    const today = toYMD(new Date());
    appointmentsApi
      .list({ student_id: studentId, date_from: today })
      .then((res) => {
        if (cancelled) return;
        const mine = (res?.appointments || [])
          .filter((a) => {
            if (String(a.student_id).toUpperCase().trim() !== String(studentId).toUpperCase().trim())
              return false;
            if (String(a.appointment_date).slice(0, 10) < today) return false;
            const raw = a.current_status ?? a.status ?? a.new_status;
            if (raw == null || raw === "") return true;
            return String(raw).toLowerCase() === "pending";
          })
          .sort((a, b) =>
            `${a.appointment_date} ${a.appointment_time}`.localeCompare(
              `${b.appointment_date} ${b.appointment_time}`
            )
          );
        setUpcoming(mine.length ? mapAppointment(mine[0]) : null);
      })
      .catch((err) => console.error("Failed to load appointments:", err));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // A just-booked context appointment wins; otherwise show the backend's.
  const appt = contextAppt
    ? {
        ...contextAppt,
        month: contextAppt.date?.toLocaleString("en-US", { month: "short" }).toUpperCase(),
        day: String(contextAppt.date?.getDate()),
        weekday: contextAppt.date?.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase(),
      }
    : upcoming;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

function handleReschedule() {
    setMenuOpen(false);
    // Book page reads this to pre-fill the date/time/reason and switch
    // its copy/behavior into "reschedule" mode.
    // Pass the appointmentId so Book.jsx can cancel the old appointment.
    navigate("/student/book", { state: { reschedule: true, appointmentId: appt?.id } });
  }

  async function handleCancel() {
    setMenuOpen(false);
    if (appt?.id) {
      try {
        await appointmentsApi.delete(appt.id);
        // Only clear after successful API response
        cancelAppointment();
        setUpcoming(null);
        setError(null);
      } catch (err) {
        console.error("Failed to cancel appointment:", err);
        setError("Failed to cancel appointment. Please try again.");
      }
    }
  }

  return (
    <section className="card-hover h-full rounded-panel bg-white p-5 shadow-e2 md:p-7">
      {error && (
        <div role="alert" className="mb-4 flex animate-fade-in items-center justify-between gap-2 rounded-card border border-signal-rose-ring bg-signal-rose-bg px-4 py-3 text-sm text-signal-rose">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-800">
            <NavIcon name="calendar" className="h-5 w-5" />
          </span>
          <h2 className="panel-title font-serif">Upcoming appointment</h2>
        </div>

        {appt && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Appointment actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="icon-btn flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
            >
              <NavIcon name="dots" className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-40 origin-top-right animate-pop-in overflow-hidden rounded-card bg-white shadow-e3"
              >
                <button
                  role="menuitem"
                  onClick={handleReschedule}
                  className="w-full px-4 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"
                >
                  Reschedule
                </button>
                <button
                  role="menuitem"
                  onClick={handleCancel}
                  className="w-full px-4 py-2.5 text-left text-sm text-signal-rose hover:bg-signal-rose-bg"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {appt ? (
        <div className="flex flex-wrap items-center gap-5 rounded-card bg-ink-50/70 p-4 ring-1 ring-inset ring-ink-100 md:flex-nowrap md:gap-6 md:p-5">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-card bg-gradient-to-br from-brand-900 to-brand-600 text-white shadow-e2">
            <span className="text-[11px] font-semibold tracking-widest text-brand-100">
              {appt.month}
            </span>
            <span className="my-0.5 text-4xl font-semibold leading-none">
              {appt.day}
            </span>
            <span className="text-[10px] font-medium tracking-wider text-brand-100">
              {appt.weekday?.slice(0, 3)}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 text-ink-900">
              <NavIcon name="clock" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <span className="cell-wrap text-base font-semibold md:text-lg">
                {appt.time}
              </span>
            </div>
            <p className="cell-wrap mt-1 text-sm text-ink-500 md:text-base">{appt.reason}</p>

            {/* mobile badge sits in normal flow right under the reason, so it
                never overlaps text above it no matter how many lines the
                time/reason wrap onto (was `absolute bottom-3 right-3` before,
                which pinned it to the card's bottom edge regardless of
                content height). */}
            <span className="mt-3 inline-flex md:hidden">
              <StatusPill status={BADGE_TONE[appt.badge] || "pending"} label={appt.badge} />
            </span>
          </div>

          <span className="hidden shrink-0 md:inline-flex">
            <StatusPill status={BADGE_TONE[appt.badge] || "pending"} label={appt.badge} />
          </span>
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/50 p-6 text-center md:p-8">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <NavIcon name="calendar" className="h-5 w-5" />
          </span>
          <p className="text-sm text-ink-500 md:text-base">
            You don't have an upcoming appointment yet.
          </p>
          <button
            onClick={() => navigate("/student/book")}
            className="btn-primary btn-press btn-shine mt-4"
          >
            Book an Appointment
          </button>
        </div>
      )}
    </section>
  );
}
