// src/components/admin/ScheduleCalendar.jsx
import { useState } from "react";
import NavIcon from "./NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  WEEKDAY_LABELS,
} from "../../lib/calendar";

// Default set of open days — all 7, open by default. The weekday header row
// (Sun/Mon/.../Sat) doubles as the on/off control for this: turning a day
// off disables every date on that weekday throughout the calendar below.
// The admin decides which days (including Sun/Sat) to close, nothing is
// closed automatically.
export const DEFAULT_OPEN_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * selectedDates: Date[] — always at least the "primary" date at index 0
 * onChange: (dates: Date[]) => void
 * selectedWeekdays: number[] — 0=Sun..6=Sat, which weekdays are open for
 *   booking by default. Click a weekday header to turn it on/off. Optional —
 *   if not passed, the calendar manages this itself.
 * onWeekdaysChange: (weekdays: number[]) => void — optional, pairs with
 *   selectedWeekdays for a controlled parent.
 */
export default function ScheduleCalendar({
  selectedDates,
  onChange,
  selectedWeekdays: selectedWeekdaysProp,
  onWeekdaysChange,
  mode: modeProp,
  onModeChange,
  bookingEnabledMap,
}) {
  const today = new Date();
  const primary = selectedDates[0] ?? today;
  const [viewYear, setViewYear] = useState(primary.getFullYear());
  const [viewMonth, setViewMonth] = useState(primary.getMonth());
  const [internalMode, setInternalMode] = useState("specific"); // "specific" | "default"
  const isModeControlled = modeProp !== undefined;
  const mode = isModeControlled ? modeProp : internalMode;

  function setMode(next) {
    if (isModeControlled) {
      onModeChange?.(next);
    } else {
      setInternalMode(next);
    }
  }

  // Self-managed by default so the toggle works even when the parent
  // doesn't pass selectedWeekdays/onWeekdaysChange. If the parent does pass
  // them, they take over (controlled mode).
  const [internalWeekdays, setInternalWeekdays] = useState(DEFAULT_OPEN_WEEKDAYS);
  const isWeekdaysControlled = selectedWeekdaysProp !== undefined;
  const selectedWeekdays = isWeekdaysControlled ? selectedWeekdaysProp : internalWeekdays;

  function setWeekdays(next) {
    if (isWeekdaysControlled) {
      onWeekdaysChange?.(next);
    } else {
      setInternalWeekdays(next);
    }
  }

  function toYMDLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const weeks = getMonthMatrix(viewYear, viewMonth);

  // The date box shows the selected date while you're viewing its month,
  // but once you navigate to a different month via the arrows, it switches
  // to show that month so the box actually reflects what's on screen.
  const isViewingPrimaryMonth =
    primary.getFullYear() === viewYear && primary.getMonth() === viewMonth;
  const displayDate = isViewingPrimaryMonth
    ? primary
    : new Date(viewYear, viewMonth, 1);

  function toggleWeekday(dayIndex) {
    if (selectedWeekdays.includes(dayIndex)) {
      const next = selectedWeekdays.filter((d) => d !== dayIndex);
      // always keep at least one day open
      setWeekdays(next.length ? next : selectedWeekdays);
    } else {
      setWeekdays([...selectedWeekdays, dayIndex].sort());
    }
  }

  // Arrows navigate the calendar by month, not by individual date.
  function shiftMonth(delta) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  function isSelected(date) {
    return selectedDates.some((d) => isSameDate(d, date));
  }

  function isWeekdayOpen(date) {
    return selectedWeekdays.includes(date.getDay());
  }

  function isDateOff(date) {
    if (!date) return false;
    const ymd = toYMDLocal(date);
    if (bookingEnabledMap && ymd in bookingEnabledMap) {
      return bookingEnabledMap[ymd] === false;
    }
    return false;
  }

  function isToday(date) {
    return isSameDate(date, today);
  }

  function pickDay(day, event) {
    if (!day) return;
    if (mode === "default") return;
    const date = new Date(viewYear, viewMonth, day);
    if (!isWeekdayOpen(date)) return; // that weekday is turned off — not pickable

    if (isDateOff(date)) return; // closed date — not pickable

    const wantsMulti = event?.shiftKey;

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

  function resetToDefault() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setWeekdays(DEFAULT_OPEN_WEEKDAYS);
    onChange([now]);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-full bg-gray-100 p-1 gap-1">
          <button
            type="button"
            onClick={() => setMode("specific")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              mode === "specific"
                ? "bg-gc-green text-white shadow-sm"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
            aria-pressed={mode === "specific"}
          >
            Specific Dates
          </button>
          <button
            type="button"
            onClick={() => setMode("default")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              mode === "default"
                ? "bg-gc-green text-white shadow-sm"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
            aria-pressed={mode === "default"}
          >
            Default Schedule
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700">
          <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
          {formatMDY(displayDate)}
        </div>

        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <NavIcon name="chevron-right" className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {mode === "default"
          ? "Choose which days of the week the clinic is open for booking by default. Click a day to turn it on or off."
          : "Select specific dates for scheduling. Click a date to pick it (Shift+click for multiple)."}
      </p>

      <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => {
          const on = selectedWeekdays.includes(i);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleWeekday(i)}
              aria-pressed={on}
              title={`Turn ${label} ${on ? "off" : "on"} for default booking`}
              className={`mx-auto w-8 h-8 flex items-center justify-center rounded-full text-[10px] font-bold tracking-wide transition-colors ${
                on
                  ? "bg-gc-accent text-white shadow-sm"
                  : "bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {label.slice(0, 3)}
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-gc-green text-center mt-2 mb-1">
        {selectedWeekdays.length} day{selectedWeekdays.length === 1 ? "" : "s"} open by default
      </p>

      {selectedDates.length > 1 && (
        <p className="text-xs font-semibold text-gc-green text-center mb-1">
          {selectedDates.length} days selected
        </p>
      )}

      {mode === "default" && (
        <button
          type="button"
          onClick={resetToDefault}
          className="block mx-auto mt-1 mb-1 text-[11px] font-semibold text-gc-accent hover:text-gc-green transition-colors"
        >
          Reset to default
        </button>
      )}

      <div className={`grid grid-cols-7 gap-y-2 gap-x-1 text-center ${mode === "default" ? "opacity-40" : ""}`}>
        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && isSelected(date);
          const weekdayOpen = date && isWeekdayOpen(date);
          const closed = date && isDateOff(date);
          const isTodayDate = date && isToday(date);

          const isDisabled = mode === "default" || !weekdayOpen || closed;

          let stateClasses = "text-gray-700 hover:bg-gray-100";
          if (mode === "default") {
            stateClasses = "text-gray-300 cursor-not-allowed";
          } else if (!weekdayOpen) {
            stateClasses = "text-gray-300 cursor-not-allowed";
          } else if (closed) {
            stateClasses = "text-red-300 bg-red-50 line-through cursor-not-allowed";
          } else if (selected) {
            stateClasses = "bg-gc-accent text-white shadow-sm";
          } else if (isTodayDate) {
            stateClasses = "text-gc-green font-bold border border-gc-accent/40 hover:bg-gray-100";
          }

          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={(e) => pickDay(day, e)}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  title={closed ? "Marked unavailable" : undefined}
                  className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${stateClasses}`}
                >
                  {day}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {mode === "specific" && (
        <p className="mt-3 text-[11px] text-gray-400">
          Tip: hold <span className="font-semibold text-gray-500">Shift</span> and click dates to select multiple.
        </p>
      )}
    </section>
  );
}
