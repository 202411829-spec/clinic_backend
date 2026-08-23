// src/components/admin/ScheduleCalendar.jsx
import { useState } from "react";
import NavIcon from "./NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  WEEKDAY_LABELS,
} from "../../lib/calendar";

// Default set of open days — Mon–Fri. The weekday header row (Sun/Mon/.../Sat)
// doubles as the on/off control for this: turning a day off disables every
// date on that weekday throughout the calendar below.
export const DEFAULT_OPEN_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * selectedDates: Date[] — always at least the "primary" date at index 0
 * onChange: (dates: Date[]) => void
 * selectedWeekdays: number[] — 0=Sun..6=Sat, which weekdays are open for
 *   booking by default. Click a weekday header to turn it on/off.
 * onWeekdaysChange: (weekdays: number[]) => void
 */
export default function ScheduleCalendar({
  selectedDates,
  onChange,
  selectedWeekdays = DEFAULT_OPEN_WEEKDAYS,
  onWeekdaysChange,
}) {
  const primary = selectedDates[0] ?? new Date();
  const [viewYear, setViewYear] = useState(primary.getFullYear());
  const [viewMonth, setViewMonth] = useState(primary.getMonth());
  const [multiMode, setMultiMode] = useState(false); // on/off toggle for picking multiple dates

  const weeks = getMonthMatrix(viewYear, viewMonth);

  function toggleWeekday(dayIndex) {
    if (!onWeekdaysChange) return;
    if (selectedWeekdays.includes(dayIndex)) {
      const next = selectedWeekdays.filter((d) => d !== dayIndex);
      // always keep at least one day open
      onWeekdaysChange(next.length ? next : selectedWeekdays);
    } else {
      onWeekdaysChange([...selectedWeekdays, dayIndex].sort());
    }
  }

  function shiftDay(delta) {
    const next = new Date(primary);
    next.setDate(next.getDate() + delta);
    if (selectedWeekdays.includes(next.getDay())) {
      onChange([next]);
    }
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function isSelected(date) {
    return selectedDates.some((d) => isSameDate(d, date));
  }

  function isWeekdayOpen(date) {
    return selectedWeekdays.includes(date.getDay());
  }

  function pickDay(day, event) {
    if (!day) return;
    const date = new Date(viewYear, viewMonth, day);
    if (!isWeekdayOpen(date)) return; // that weekday is turned off — not pickable

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

      {/* on/off toggle for picking multiple dates — sits right below the date nav,
          shown on every screen size (shift+click on desktop is still a shortcut) */}
      <div className="flex items-center justify-between gap-2.5 mb-3 px-0.5">
        <span className="text-xs text-gray-500">
          Select multiple dates
          <span className="hidden md:inline text-gray-400"> (or shift + click)</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={multiMode}
          aria-label="Toggle selecting multiple dates"
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
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Choose which days of the week the clinic is open for booking by
        default. Click a day to turn it on or off.
      </p>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((label, i) => {
          const on = selectedWeekdays.includes(i);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleWeekday(i)}
              aria-pressed={on}
              title={`Turn ${label} ${on ? "off" : "on"} for default booking`}
              className={`text-[11px] font-bold tracking-wide rounded-lg py-1.5 transition-colors ${
                on
                  ? "bg-gc-accent text-white shadow-sm"
                  : "bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          );
        })}

        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && isSelected(date);
          const open = date && isWeekdayOpen(date);
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={(e) => pickDay(day, e)}
                  disabled={!open}
                  aria-disabled={!open}
                  className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                    !open
                      ? "text-gray-300 cursor-not-allowed"
                      : selected
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

      <p className="mt-3 text-xs font-semibold text-gc-green">
        {selectedWeekdays.length} day{selectedWeekdays.length === 1 ? "" : "s"} open by default
      </p>

      {selectedDates.length > 1 && (
        <p className="mt-1 text-xs font-semibold text-gc-green">
          {selectedDates.length} days selected
        </p>
      )}
    </section>
  );
}
