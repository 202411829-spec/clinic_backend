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
}) {
  const today = new Date();
  const primary = selectedDates[0] ?? today;
  const [viewYear, setViewYear] = useState(primary.getFullYear());
  const [viewMonth, setViewMonth] = useState(primary.getMonth());

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

  // Specific individual dates the admin has closed (e.g. holidays), on top
  // of the weekday defaults above. Turned on/off via the "Mark dates as
  // unavailable" switch below the calendar — while that's on, clicking a
  // date toggles it closed/open instead of selecting it for scheduling.
  const [offDates, setOffDates] = useState([]);
  const [offMode, setOffMode] = useState(false);

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
    return offDates.some((d) => isSameDate(d, date));
  }

  function isToday(date) {
    return isSameDate(date, today);
  }

  function pickDay(day, event) {
    if (!day) return;
    const date = new Date(viewYear, viewMonth, day);
    if (!isWeekdayOpen(date)) return; // that weekday is turned off — not pickable

    // "Mark dates as unavailable" mode — clicking closes/reopens this exact
    // date instead of selecting it.
    if (offMode) {
      setOffDates((prev) =>
        prev.some((d) => isSameDate(d, date))
          ? prev.filter((d) => !isSameDate(d, date))
          : [...prev, date]
      );
      return;
    }

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
    setOffDates([]);
    setOffMode(false);
    setWeekdays(DEFAULT_OPEN_WEEKDAYS);
    onChange([now]);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="font-bold text-gray-800 text-sm md:text-base">
          Select Date
        </h2>
        <button
          type="button"
          onClick={resetToDefault}
          className="text-[11px] font-semibold text-gc-accent hover:text-gc-green transition-colors"
        >
          Set a default
        </button>
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
        Choose which days of the week the clinic is open for booking by
        default. Click a day to turn it on or off.
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

        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && isSelected(date);
          const weekdayOpen = date && isWeekdayOpen(date);
          const closed = date && isDateOff(date);
          const isTodayDate = date && isToday(date);

          let stateClasses = "text-gray-700 hover:bg-gray-100";
          if (!weekdayOpen) {
            stateClasses = "text-gray-300 cursor-not-allowed";
          } else if (closed) {
            stateClasses = "text-red-300 bg-red-50 line-through cursor-not-allowed";
          } else if (selected) {
            stateClasses = "bg-gc-accent text-white shadow-sm";
          } else if (isTodayDate) {
            stateClasses = "text-gc-green font-bold border border-gc-accent/40 hover:bg-gray-100";
          } else if (offMode) {
            stateClasses = "text-gray-700 ring-1 ring-red-200 hover:bg-red-50";
          }

          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={(e) => pickDay(day, e)}
                  disabled={!weekdayOpen}
                  aria-disabled={!weekdayOpen}
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

      <p className="mt-3 text-xs font-semibold text-gc-green">
        {selectedWeekdays.length} day{selectedWeekdays.length === 1 ? "" : "s"} open by default
      </p>

      {selectedDates.length > 1 && (
        <p className="mt-1 text-xs font-semibold text-gc-green">
          {selectedDates.length} days selected
        </p>
      )}

      {/* on/off switch for marking specific individual dates unavailable —
          sits right below the "days open by default" summary. While on,
          tapping a date closes it (greyed + unclickable) instead of
          selecting it. */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2.5">
        <div>
          <span className="block text-xs font-semibold text-gray-700">
            Mark dates as unavailable
          </span>
          <span className="block text-[11px] text-gray-400">
            {offMode ? "Tap a date to close it" : "Turn on to close specific dates"}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={offMode}
          aria-label="Toggle marking dates as unavailable"
          onClick={() => setOffMode((v) => !v)}
          className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
            offMode ? "bg-red-500" : "bg-gray-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              offMode ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {offDates.length > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-red-400">
          {offDates.length} date{offDates.length === 1 ? "" : "s"} marked unavailable
        </p>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        Tip: hold <span className="font-semibold text-gray-500">Shift</span> and click dates to select multiple.
      </p>
    </section>
  );
}
