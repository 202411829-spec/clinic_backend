// src/components/student/UpcomingAppointmentPanel.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../admin/NavIcon";
import { useAppointment } from "../../context/AppointmentContext";

export default function UpcomingAppointmentPanel() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { appointment: appt, cancelAppointment } = useAppointment();

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
    // its copy + confirmation flow into "reschedule" mode.
    navigate("/student/book", { state: { reschedule: true } });
  }

  function handleCancel() {
    setMenuOpen(false);
    cancelAppointment();
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 md:p-7">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="calendar" className="w-5 h-5" />
          </span>
          <h2 className="font-bold text-gray-800 text-base md:text-lg tracking-wide">
            UPCOMING APPOINTMENT
          </h2>
        </div>

        {appt && (
          <div className="relative" ref={menuRef}>
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
        <div className="relative border border-gray-200 rounded-2xl p-5 md:p-6 flex items-center gap-5 md:gap-6">
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

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-gray-800">
              <NavIcon name="clock" className="w-5 h-5 shrink-0 text-gray-500" />
              <span className="text-base md:text-lg font-semibold whitespace-nowrap">
                {appt.time}
              </span>
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1">{appt.reason}</p>
          </div>

          <span className="hidden md:inline-flex ml-auto shrink-0 items-center rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600">
            {appt.badge}
          </span>
          <span className="md:hidden absolute bottom-3 right-3 inline-flex shrink-0 items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 bg-white">
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
