// src/components/admin/SelectDateCalendar.jsx
import { useState } from "react";
import NavIcon from "./NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  WEEKDAY_LABELS,
} from "../../lib/calendar";

/**
 * selectedDate: Date
 * onSelectDate: (date: Date) => void
 */
export default function SelectDateCalendar({ selectedDate, onSelectDate }) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const weeks = getMonthMatrix(viewYear, viewMonth);

  function shiftDay(delta) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    onSelectDate(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pickDay(day) {
    if (!day) return;
    onSelectDate(new Date(viewYear, viewMonth, day));
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
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
          {formatMDY(selectedDate)}
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
          <div
            key={label}
            className="text-[11px] font-bold text-gray-500 tracking-wide"
          >
            {label}
          </div>
        ))}

        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && isSameDate(date, selectedDate);
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={() => pickDay(day)}
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
    </section>
  );
}
