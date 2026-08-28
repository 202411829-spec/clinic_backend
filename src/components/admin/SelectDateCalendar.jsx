// src/components/admin/SelectDateCalendar.jsx
import { useState, useEffect } from "react";
import NavIcon from "./NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  WEEKDAY_LABELS,
  startOfDay,
} from "../../lib/calendar";

/**
 * selectedDate: Date
 * onSelectDate: (date: Date) => void — fired when the user taps a day cell
 *   (a final pick). Callers that close a popup on selection (e.g. Reports)
 *   should do that here.
 * onNavigate: (date: Date) => void — optional. Fired instead of
 *   onSelectDate when the prev/next arrows step the date in "day" mode.
 *   Lets a popup stay open while browsing with the arrows; falls back to
 *   onSelectDate when not provided, so existing always-visible usages
 *   (Appointments, student Book) keep working unchanged.
 * navigationMode: "day" (default) — arrows step the selected date by a
 *   single day, matching it forward/back (used by the admin Appointments /
 *   Reports daily views). "month" — arrows page the calendar view a whole
 *   month at a time instead, like a normal calendar (used by the student
 *   booking calendar), without changing the selected date until a day is
 *   tapped.
 */
export default function SelectDateCalendar({
  selectedDate,
  onSelectDate,
  onNavigate,
  navigationMode = "day",
  minDate,
  maxDate,
}) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  // Keep view in sync if selectedDate prop changes externally (e.g. Book.jsx defaulting to tomorrow)
  useEffect(() => {
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);

  const weeks = getMonthMatrix(viewYear, viewMonth);
  const isMonthMode = navigationMode === "month";

  const minDay = minDate ? startOfDay(minDate) : null;
  const maxDay = maxDate ? startOfDay(maxDate) : null;

  function isDisabled(date) {
    if (!date) return false;
    const d = startOfDay(date);
    if (minDay && d < minDay) return true;
    if (maxDay && d > maxDay) return true;
    return false;
  }

  const viewMonthStart = new Date(viewYear, viewMonth, 1);
  const minMonthKey = minDay ? minDay.getFullYear() * 12 + minDay.getMonth() : null;
  const maxMonthKey = maxDay ? maxDay.getFullYear() * 12 + maxDay.getMonth() : null;
  const viewMonthKey = viewYear * 12 + viewMonth;
  const canGoPrev = minMonthKey == null || viewMonthKey > minMonthKey;
  const canGoNext = maxMonthKey == null || viewMonthKey < maxMonthKey;

  // Day-mode arrow targets (shift selected date by 1 day)
  const prevDayTarget = (() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    return d;
  })();
  const nextDayTarget = (() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    return d;
  })();
  const canShiftPrevDay = !isDisabled(prevDayTarget);
  const canShiftNextDay = !isDisabled(nextDayTarget);

  function shiftDay(delta) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    (onNavigate || onSelectDate)(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

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

  function goPrev() {
    if (isMonthMode) {
      if (!canGoPrev) return;
      shiftMonth(-1);
    } else {
      if (!canShiftPrevDay) return;
      shiftDay(-1);
    }
  }

  function goNext() {
    if (isMonthMode) {
      if (!canGoNext) return;
      shiftMonth(1);
    } else {
      if (!canShiftNextDay) return;
      shiftDay(1);
    }
  }

  function pickDay(day) {
    if (!day) return;
    const d = new Date(viewYear, viewMonth, day);
    if (isDisabled(d)) return;
    onSelectDate(d);
  }

  // In month mode, the date box should reflect whatever month is currently
  // on screen (even before a day is picked), not just the selected date.
  const isViewingSelectedMonth =
    selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === viewMonth;
  const displayDate =
    isMonthMode && !isViewingSelectedMonth
      ? new Date(viewYear, viewMonth, 1)
      : selectedDate;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        Select Date
      </h2>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={goPrev}
          disabled={isMonthMode ? !canGoPrev : !canShiftPrevDay}
          aria-label={isMonthMode ? "Previous month" : "Previous day"}
          className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full border transition-colors ${
            (isMonthMode ? !canGoPrev : !canShiftPrevDay)
              ? "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
              : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
          }`}
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700">
          <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
          {formatMDY(displayDate)}
        </div>

        <button
          onClick={goNext}
          disabled={isMonthMode ? !canGoNext : !canShiftNextDay}
          aria-label={isMonthMode ? "Next month" : "Next day"}
          className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full border transition-colors ${
            (isMonthMode ? !canGoNext : !canShiftNextDay)
              ? "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
              : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
          }`}
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
          const disabled = date ? isDisabled(date) : false;
          return (
            <div key={i} className="flex items-center justify-center py-0.5">
              {day ? (
                <button
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                    disabled
                      ? "text-gray-300 bg-gray-50 cursor-not-allowed opacity-60"
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
    </section>
  );
}
