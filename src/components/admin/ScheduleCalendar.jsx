// src/components/admin/ScheduleCalendar.jsx
import { useState } from "react";
import NavIcon from "./NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  WEEKDAY_LABELS,
} from "../../lib/calendar";

/**
 * selectedDates: Date[] — always at least the "primary" date at index 0
 * onChange: (dates: Date[]) => void
 */
export default function ScheduleCalendar({ selectedDates, onChange }) {
  const primary = selectedDates[0] ?? new Date();
  const [viewYear, setViewYear] = useState(primary.getFullYear());
  const [viewMonth, setViewMonth] = useState(primary.getMonth());
  const [multiMode, setMultiMode] = useState(false); // mobile toggle

  const weeks = getMonthMatrix(viewYear, viewMonth);

  function shiftDay(delta) {
    const next = new Date(primary);
    next.setDate(next.getDate() + delta);
    onChange([next]);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function isSelected(date) {
    return selectedDates.some((d) => isSameDate(d, date));
  }

  function pickDay(day, event) {
    if (!day) return;
    const date = new Date(viewYear, viewMonth, day);
    const wantsMulti = multiMode || event?.shiftKey;

    if (!wantsMulti) {
      onChange([date]);
      return;
    }

    // toggle this date in/out of the current selection
    if (isSelected(date)) {
      const next = selectedDates.filter((d) => !isSameDate(d, date));
      onChange(next.length ? next : [date]);
    } else {
      onChange([...selectedDates, date]);
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        Select Date
      </h2>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700">
          <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
          {formatMDY(primary)}
        </div>

        <button
          onClick={() => shiftDay(1)}
          aria-label="Next day"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <NavIcon name="chevron-right" className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-[11px] font-bold text-gray-500 tracking-wide">
            {label}
          </div>
        ))}

        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && isSelected(date);
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={(e) => pickDay(day, e)}
                  className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                    selected
                      ? "bg-gc-accent text-white shadow-sm"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* desktop: shift+click hint */}
      <p className="hidden md:block mt-4 text-xs text-gray-400 italic">
        Shift + click to select multiple days.
      </p>

      {/* mobile: explicit toggle, since there's no shift key on a touchscreen */}
      <label className="md:hidden mt-4 flex items-center gap-2.5 text-xs text-gray-500">
        <button
          type="button"
          role="switch"
          aria-checked={multiMode}
          onClick={() => setMultiMode((v) => !v)}
          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
            multiMode ? "bg-gc-accent" : "bg-gray-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              multiMode ? "translate-x-4" : ""
            }`}
          />
        </button>
        Click to select multiple days.
      </label>

      {selectedDates.length > 1 && (
        <p className="mt-2 text-xs font-semibold text-gc-green">
          {selectedDates.length} days selected
        </p>
      )}
    </section>
  );
}
