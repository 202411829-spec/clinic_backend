// src/components/student/UpcomingAppointmentPanel.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../admin/NavIcon";
import { useAppointment } from "../../context/AppointmentContext";
import { appointmentsApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
    appointmentsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const today = toYMD(new Date());
        const mine = (res?.appointments || [])
          .filter(
            (a) =>
              String(a.student_id).toUpperCase().trim() === String(studentId).toUpperCase().trim() &&
              String(a.appointment_date).slice(0, 10) >= today
          )
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
      } catch (err) {
        console.error("Failed to cancel appointment:", err);
        alert("Failed to cancel appointment. Please try again.");
      }
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="calendar" className="w-5 h-5" />
          </span>
          <h2 className="font-bold text-gray-800 text-sm md:text-lg tracking-wide whitespace-nowrap">
            UPCOMING APPOINTMENT
          </h2>
        </div>

        {appt && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Appointment actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gc-accent hover:bg-gc-accent/10"
            >
              <NavIcon name="dots" className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 w-40 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
              >
                <button
                  role="menuitem"
                  onClick={handleReschedule}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Reschedule
                </button>
                <button
                  role="menuitem"
                  onClick={handleCancel}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {appt ? (
        <div className="border border-gray-200 rounded-2xl p-5 md:p-6 flex flex-wrap md:flex-nowrap items-center gap-5 md:gap-6">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-xl bg-gc-green-50 flex flex-col items-center justify-center shrink-0">
            <span className="text-xs md:text-sm font-bold text-gc-green tracking-wide">
              {appt.month}
            </span>
            <span className="text-4xl md:text-5xl font-extrabold text-gc-green leading-none my-1">
              {appt.day}
            </span>
            <span className="text-xs md:text-sm font-bold text-gc-green tracking-wide">
              {appt.weekday}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 text-gray-800">
              <NavIcon name="clock" className="w-5 h-5 shrink-0 text-gray-500 mt-0.5" />
              <span className="text-base md:text-lg font-semibold break-words">
                {appt.time}
              </span>
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1 break-words">{appt.reason}</p>

            {/* mobile badge sits in normal flow right under the reason, so it
                never overlaps text above it no matter how many lines the
                time/reason wrap onto (was `absolute bottom-3 right-3` before,
                which pinned it to the card's bottom edge regardless of
                content height). */}
            <span className="md:hidden mt-3 inline-flex shrink-0 items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 bg-white">
              {appt.badge}
            </span>
          </div>

          <span className="hidden md:inline-flex shrink-0 items-center rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600">
            {appt.badge}
          </span>
        </div>
      ) : (
        <div className="border border-dashed border-gray-200 rounded-2xl p-6 md:p-8 text-center">
          <p className="text-sm md:text-base text-gray-500">
            You don't have an upcoming appointment yet.
          </p>
          <button
            onClick={() => navigate("/student/book")}
            className="mt-4 inline-flex items-center rounded-lg bg-gc-green px-5 py-2.5 text-sm font-bold text-white hover:bg-gc-green-600"
          >
            Book an Appointment
          </button>
        </div>
      )}
    </section>
  );
}
