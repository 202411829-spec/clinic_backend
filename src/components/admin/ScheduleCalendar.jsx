// src/components/admin/ScheduleCalendar.jsx
import { useState } from "react";
import NavIcon from "../ui/NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  toYMD,
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
  bookingLabel,
  allOpen,
  allClosed,
  mixed,
  onSetBooking,
  bookingSaving,
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

  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const weeks = getMonthMatrix(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  // "Select multiple" is a plain toggle so admins don't need to know about Shift+click.
  const [multi, setMulti] = useState(false);

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
    const ymd = toYMD(date);
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

    const wantsMulti = multi || event?.shiftKey;

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

  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    if (isWeekdayOpen(now) && !isDateOff(now)) onChange([now]);
  }

  function toggleMulti() {
    if (multi) onChange([selectedDates[0] ?? today]); // back to a single date
    setMulti((v) => !v);
  }

  const tabClass = (active) =>
    `flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
      active ? "bg-gc-green text-white shadow-sm" : "text-gray-500 hover:bg-white"
    }`;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      {/* 1. What do you want to set? */}
      <div className="flex rounded-full bg-gray-100 p-1 gap-1" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "specific"} onClick={() => setMode("specific")} className={tabClass(mode === "specific")}>
          Specific Dates
        </button>
        <button type="button" role="tab" aria-selected={mode === "default"} onClick={() => setMode("default")} className={tabClass(mode === "default")}>
          Weekly Open Days
        </button>
      </div>
      <p className="mt-3 mb-4 text-xs leading-relaxed text-gray-500">
        {mode === "default"
          ? "Choose which days of the week the clinic is open every week."
          : "Pick a date to set its schedule, or open/close that day for booking."}
      </p>

      {mode === "default" ? (
        /* ---------- Weekly default: just the 7 day buttons ---------- */
        <div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => {
              const on = selectedWeekdays.includes(i);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  aria-pressed={on}
                  title={`${on ? "Open" : "Closed"} every ${label}`}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border px-0 py-2.5 text-[11px] font-bold tracking-wide transition-colors ${
                    on
                      ? "border-gc-accent bg-gc-accent text-white shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                  }`}
                >
                  {label}
                  <span className="text-[9px] font-semibold opacity-80">{on ? "Open" : "Closed"}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-gc-green">
            Open {selectedWeekdays.length} day{selectedWeekdays.length === 1 ? "" : "s"} a week
          </p>
          <button
            type="button"
            onClick={resetToDefault}
            className="mx-auto mt-2 block text-[11px] font-semibold text-gc-accent transition-colors hover:text-gc-green"
          >
            Reset to all 7 days
          </button>
        </div>
      ) : (
        /* ---------- Specific dates: month calendar ---------- */
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <NavIcon name="chevron-left" className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <span className="truncate text-sm font-bold text-gray-800">{monthLabel}</span>
              <button
                type="button"
                onClick={goToday}
                className="rounded-full border border-gc-accent/40 px-2.5 py-0.5 text-[11px] font-semibold text-gc-accent transition-colors hover:bg-gc-accent hover:text-white"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <NavIcon name="chevron-right" className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="pb-1 text-[10px] font-bold tracking-wide text-gray-400">
                {label}
              </div>
            ))}
            {weeks.flat().map((day, i) => {
              const date = day ? new Date(viewYear, viewMonth, day) : null;
              const selected = date && isSelected(date);
              const weekdayOpen = date && isWeekdayOpen(date);
              const closed = date && isDateOff(date);
              const isTodayDate = date && isToday(date);
              const isDisabled = !weekdayOpen || closed;

              let stateClasses = "text-gray-700 hover:bg-gray-100";
              let title;
              if (!weekdayOpen) {
                stateClasses = "text-gray-300 cursor-not-allowed";
                title = "Clinic is closed on this weekday (change it in Weekly Open Days)";
              } else if (closed) {
                stateClasses = "text-red-400 bg-red-50 line-through cursor-not-allowed";
                title = "Closed for booking";
              } else if (selected) {
                stateClasses = "bg-gc-accent text-white shadow-sm";
              } else if (isTodayDate) {
                stateClasses = "text-gc-accent font-bold ring-1 ring-gc-accent/50 hover:bg-gray-100";
              }

              return (
                <div key={i} className="flex items-center justify-center py-0.5">
                  {day ? (
                    <button
                      type="button"
                      onClick={(e) => pickDay(day, e)}
                      disabled={isDisabled}
                      aria-disabled={isDisabled}
                      aria-pressed={!!selected}
                      title={title}
                      className={`h-8 w-8 rounded-full text-sm font-semibold transition-colors ${stateClasses}`}
                    >
                      {day}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* legend */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gc-accent" />Selected</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full ring-1 ring-gc-accent/60" />Today</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-100" />Closed</span>
          </div>

          {/* select-multiple toggle (replaces the Shift+click tip) */}
          <button
            type="button"
            onClick={toggleMulti}
            aria-pressed={multi}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              multi
                ? "border-gc-accent bg-gc-green/10 text-gc-green"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${multi ? "border-gc-accent bg-gc-accent text-white" : "border-gray-300"}`}>
              {multi ? "✓" : ""}
            </span>
            Select multiple dates
            {selectedDates.length > 1 && <span className="text-gc-green">· {selectedDates.length} selected</span>}
          </button>

          {/* open / closed for the selected date(s) */}
          {selectedDates.length >= 1 && bookingLabel ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-700">{bookingLabel}</p>
              <div className="flex rounded-full bg-gray-200/70 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => onSetBooking?.(true)}
                  disabled={bookingSaving}
                  aria-pressed={allOpen}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    allOpen ? "bg-gc-green text-white shadow-sm" : "text-gray-500 hover:bg-white"
                  }`}
                >
                  {allOpen ? "● Open" : "Open"}
                </button>
                <button
                  type="button"
                  onClick={() => onSetBooking?.(false)}
                  disabled={bookingSaving}
                  aria-pressed={allClosed}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    allClosed ? "bg-red-500 text-white shadow-sm" : "text-gray-500 hover:bg-white"
                  }`}
                >
                  {allClosed ? "● Closed" : "Closed"}
                </button>
              </div>
              {mixed && <p className="mt-2 text-[11px] text-gray-400">Mixed — tap Open or Closed to set all.</p>}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
