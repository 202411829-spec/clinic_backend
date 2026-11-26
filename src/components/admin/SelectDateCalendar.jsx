// src/components/admin/SelectDateCalendar.jsx
import { useState, useEffect } from "react";
import NavIcon from "../ui/NavIcon";
import {
  getMonthMatrix,
  isSameDate,
  formatMDY,
  toYMD,
  WEEKDAY_LABELS,
  asCalendarDate,
  calendarAnchor,
  startOfDay,
} from "../../lib/calendar";

/**
 * selectedDate: Date | null — null opens the view on today (empty record dates)
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
 * availableDates: string[] | Date[] | null (optional) — allow-list of
 *   bookable days (YMD strings or Date objects). When provided, every date
 *   outside the set is disabled (an empty array disables them all); when
 *   omitted, availability is unrestricted apart from min/maxDate, which
 *   keeps existing callers unchanged.
 *
 * Visual treatment follows the GC-RFB DateCalendar design. Month navigation
 * deliberately stays instant, matching the source spec.
 */
export default function SelectDateCalendar({
  selectedDate,
  onSelectDate,
  onNavigate,
  navigationMode = "day",
  minDate,
  maxDate,
  selectedDates = null,
  onToggleDate = null,
  availableDates = null,
}) {
  const selectedDay = asCalendarDate(selectedDate);
  const [viewYear, setViewYear] = useState(() => calendarAnchor(selectedDate).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => calendarAnchor(selectedDate).getMonth());

  // Allowed-day set for reason-scoped availability (YMD lookup keys).
  const availableSet = Array.isArray(availableDates)
    ? new Set(
        availableDates.map((d) => (d instanceof Date ? toYMD(d) : String(d).slice(0, 10)))
      )
    : null;

  // Keep view in sync if selectedDate prop changes externally (e.g. Book.jsx defaulting to tomorrow).
  // Empty selections (Medical Records) open on today instead of reading a null Date.
  useEffect(() => {
    const anchor = calendarAnchor(selectedDate);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
  }, [selectedDate]);

  const weeks = getMonthMatrix(viewYear, viewMonth);
  const today = startOfDay(new Date());
  const isMonthMode = navigationMode === "month";
  const multiSelect = Array.isArray(selectedDates) && typeof onToggleDate === "function";

  const minDay = minDate ? startOfDay(minDate) : null;
  const maxDay = maxDate ? startOfDay(maxDate) : null;

  function isDisabled(date) {
    if (!date) return false;
    const d = startOfDay(date);
    if (minDay && d < minDay) return true;
    if (maxDay && d > maxDay) return true;
    if (availableSet && !availableSet.has(toYMD(d))) return true;
    return false;
  }

  const viewMonthStart = new Date(viewYear, viewMonth, 1);
  const minMonthKey = minDay ? minDay.getFullYear() * 12 + minDay.getMonth() : null;
  const maxMonthKey = maxDay ? maxDay.getFullYear() * 12 + maxDay.getMonth() : null;
  const viewMonthKey = viewYear * 12 + viewMonth;
  const canGoPrev = minMonthKey == null || viewMonthKey > minMonthKey;
  const canGoNext = maxMonthKey == null || viewMonthKey < maxMonthKey;

  // Day-mode arrow targets (shift selected date by 1 day; empty opens on today)
  const dayBase = selectedDay ?? calendarAnchor(selectedDate);
  const prevDayTarget = new Date(dayBase);
  prevDayTarget.setDate(prevDayTarget.getDate() - 1);
  const nextDayTarget = new Date(dayBase);
  nextDayTarget.setDate(nextDayTarget.getDate() + 1);
  const canShiftPrevDay = !isDisabled(prevDayTarget);
  const canShiftNextDay = !isDisabled(nextDayTarget);

  function shiftDay(delta) {
    const next = new Date(selectedDay ?? calendarAnchor(selectedDate));
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

  // One-tap way back to today after browsing other dates/months.
  function goToday() {
    if (isDisabled(today)) return;
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    if (onSelectDate) onSelectDate(startOfDay(today));
    else onToggleDate?.(startOfDay(today));
  }

  function pickDay(day) {
    if (!day) return;
    const d = new Date(viewYear, viewMonth, day);
    if (isDisabled(d)) return;
    if (multiSelect) onToggleDate(d);
    else onSelectDate(d);
  }

  // In month mode, the date box should reflect whatever month is currently
  // on screen (even before a day is picked), not just the selected date.
  const isViewingSelectedMonth =
    selectedDay != null &&
    selectedDay.getFullYear() === viewYear &&
    selectedDay.getMonth() === viewMonth;
  const displayDate =
    isMonthMode && !isViewingSelectedMonth
      ? new Date(viewYear, viewMonth, 1)
      : selectedDay ?? calendarAnchor(selectedDate);

  return (
    <section className="gc-cal card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        {multiSelect ? "Select Days" : "Select Date"}
      </h2>

      <div className="gc-cal-head">
        <button
          onClick={goPrev}
          disabled={isMonthMode ? !canGoPrev : !canShiftPrevDay}
          aria-label={isMonthMode ? "Previous month" : "Previous day"}
          className="gc-cal-navbtn gc-no-btn-anim"
        >
          <NavIcon name="chevron-left" className="h-4 w-4" />
        </button>

        <div className="gc-cal-trigger" aria-label={formatMDY(displayDate)}>
          <NavIcon name="calendar" className="gc-cal-trigger-icon h-4 w-4 shrink-0" />
          <span className="gc-cal-trigger-text font-semibold">{formatMDY(displayDate)}</span>
        </div>

        <button
          onClick={goNext}
          disabled={isMonthMode ? !canGoNext : !canShiftNextDay}
          aria-label={isMonthMode ? "Next month" : "Next day"}
          className="gc-cal-navbtn gc-no-btn-anim"
        >
          <NavIcon name="chevron-right" className="h-4 w-4" />
        </button>
      </div>

      <div className="gc-cal-dow">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="gc-cal-dow-cell">
            {label}
          </div>
        ))}
      </div>

      <div className="gc-cal-grid" role="grid" aria-label={multiSelect ? "Select Days" : "Select Date"}>
        {weeks.flat().map((day, i) => {
          const date = day ? new Date(viewYear, viewMonth, day) : null;
          const selected = date && (
            multiSelect
              ? selectedDates.includes(toYMD(date))
              : isSameDate(date, selectedDay)
          );
          const disabled = date ? isDisabled(date) : false;
          const outside = date ? date.getMonth() !== viewMonth : false;
          const isToday = date && isSameDate(date, today);
          return (
            <div
              key={i}
              className={`gc-cal-cell ${outside ? "is-outside" : ""}`}
            >
              {day ? (
                <button
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  aria-selected={Boolean(selected)}
                  className={`gc-cal-day gc-no-btn-anim ${
                    disabled ? "is-disabled" : ""
                  } ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}
                >
                  <span className="gc-cal-daynum">{day}</span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {!isDisabled(today) && (
        <button
          type="button"
          onClick={goToday}
          disabled={isSameDate(selectedDay, today)}
          className="gc-cal-today gc-no-btn-anim mt-4 flex w-full items-center justify-center gap-2 disabled:cursor-default"
        >
          <NavIcon name="calendar" className="h-3.5 w-3.5" />
          {isSameDate(selectedDay, today) ? "Showing today" : `Back to today · ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </button>
      )}
    </section>
  );
}
