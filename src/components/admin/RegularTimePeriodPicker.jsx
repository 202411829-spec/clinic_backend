// Regular Time controls for Reports. All options expand into explicit dates
// while still using the existing single-date reports endpoint underneath.
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import SelectDateCalendar from "./SelectDateCalendar.jsx";
import NavIcon from "../ui/NavIcon.jsx";
import { MonthRangeCalendarPanel } from "../ui/DateRangePicker.jsx";
import { formatAcademicMonthRangeLabel } from "../../lib/academicPeriod.js";
import { toYMD } from "../../lib/calendar.js";
import {
  formatDaySetLabel,
  formatMonthListLabel,
  getWeekIndexForDay,
  getWeeksForMonth,
  MONTH_LABELS_LONG,
  parseNonNegativeYear,
  toggleRegularMonth,
} from "../../lib/reportPeriodSelection.js";

function YearInput({ label, value, onChange }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:border-gc-green focus:ring-2 focus:ring-gc-green/20"
      />
    </label>
  );
}

export default function RegularTimePeriodPicker({
  period,
  date,
  selectedDays,
  yearInput,
  month,
  weekIndex,
  selectedMonths,
  onToggleDay,
  onSelectDay,
  onYearInputChange,
  onMonthChange,
  onWeekChange,
  onMonthsChange,
  onDone,
  monthRange,
  monthViewYear,
  setMonthViewYear,
  monthFocusISO,
  setMonthFocusISO,
  monthHoverISO,
  setMonthHoverISO,
  onMonthRangePick,
  onClearMonthRange,
}) {
  const parsedYear = parseNonNegativeYear(yearInput);
  const monthOptions = MONTH_LABELS_LONG.map((label, value) => ({ value, label }));

  // Reports always passes selectedDays; Logbook reuses this picker for
  // Week/Month/Year/All Time only. Keep the day-label fallback defensive so a
  // shared-component caller can never crash while rendering another period.
  const safeSelectedDays = Array.isArray(selectedDays) ? selectedDays : [];
  const dayLabels = safeSelectedDays.length
    ? safeSelectedDays
    : date instanceof Date && !Number.isNaN(date.getTime())
      ? [toYMD(date)]
      : [];
  const weeks = parsedYear == null ? [] : getWeeksForMonth(parsedYear, month);
  const derivedWeekIndex =
    parsedYear != null &&
    date instanceof Date &&
    date.getFullYear() === parsedYear &&
    date.getMonth() === month
      ? getWeekIndexForDay(parsedYear, month, date.getDate())
      : 0;
  const activeWeekIndex =
    weekIndex == null || !weeks[weekIndex] ? derivedWeekIndex : Number(weekIndex);
  const activeWeek = weeks[activeWeekIndex];

  function toggleMonth(value) {
    onMonthsChange(toggleRegularMonth(selectedMonths, value));
  }

  return (
    <section className="card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-800 text-sm md:text-base">Regular Time · {period}</h2>
        <button
          type="button"
          onClick={onDone}
          className="btn-press rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Done
        </button>
      </div>

      {period === "Day" && (
        <>
          <p className="mb-3 rounded-lg bg-gc-green/10 px-3 py-2 text-xs font-semibold text-gc-green">
            Selected: {formatDaySetLabel(dayLabels)}
          </p>
          <SelectDateCalendar
            selectedDate={date}
            onSelectDate={onSelectDay}
            navigationMode="month"
            selectedDates={dayLabels}
            onToggleDate={onToggleDay}
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            Tap multiple days to include them in one report.
          </p>
        </>
      )}

      {period === "Week" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <YearInput label="Year" value={yearInput} onChange={onYearInputChange} />
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Month
              </span>
              <UniversalDropdown
                value={month}
                onChange={(value) => onMonthChange(Number(value))}
                options={monthOptions}
                className="w-full"
                buttonClassName="h-9"
              />
            </label>
          </div>
          {parsedYear == null ? (
            <p className="rounded-lg bg-signal-rose-bg px-3 py-2 text-xs font-semibold text-signal-rose">
              Enter a valid non-negative year to see available weeks.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {weeks.map((week) => {
                const active = week.index === activeWeekIndex;
                return (
                  <button
                    key={week.from}
                    type="button"
                    onClick={() => onWeekChange(week.index)}
                    aria-pressed={active}
                    className={`btn-press gc-no-btn-anim flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                      active
                        ? "border-gc-green bg-gc-green/10 text-gc-green"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <NavIcon name="calendar" className="h-3.5 w-3.5 shrink-0" />
                    <span>{week.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {activeWeek && (
            <p className="text-xs text-gray-500">Report dates: {activeWeek.from} to {activeWeek.to}</p>
          )}
        </div>
      )}

      {period === "Month" &&
        (monthRange ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-700">
              Selected: {formatAcademicMonthRangeLabel(monthRange) || "Choose a start month"}
            </p>
            <MonthRangeCalendarPanel
              value={monthRange}
              viewYear={monthViewYear ?? parsedYear ?? new Date().getFullYear()}
              setViewYear={(year) => setMonthViewYear?.(year)}
              focusISO={monthFocusISO}
              setFocusISO={setMonthFocusISO}
              hoverISO={monthHoverISO}
              setHoverISO={setMonthHoverISO}
              onPick={(iso) => onMonthRangePick?.(iso)}
              onClear={onClearMonthRange}
              hint="Tap a start month, then an end month. Use the arrows to change year."
            />
          </div>
        ) : (
          <div className="space-y-3">
            <YearInput label="Year" value={yearInput} onChange={onYearInputChange} />
            <div>
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Months included
              </span>
              <div className="grid grid-cols-3 gap-2">
                {MONTH_LABELS_LONG.map((label, value) => {
                  const active = selectedMonths.includes(value);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleMonth(value)}
                      aria-pressed={active}
                      className={`btn-press gc-no-btn-anim rounded-lg border px-2 py-2 text-xs font-semibold ${
                        active
                          ? "border-gc-green bg-gc-green text-white"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Selected: {formatMonthListLabel(selectedMonths)} {parsedYear == null ? "" : parsedYear}
                {parsedYear == null && " · enter a valid year"}
              </p>
            </div>
          </div>
        ))}

      {period === "Year" && (
        <div className="space-y-3">
          <YearInput label="Year" value={yearInput} onChange={onYearInputChange} />
          <p className="rounded-lg bg-gc-green/10 px-3 py-2 text-xs font-semibold text-gc-green">
            {parsedYear == null
              ? "Enter a valid non-negative year. Year 0 is allowed."
              : `Reporting year: ${parsedYear}`}
          </p>
        </div>
      )}

      {period === "All Time" && (
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-600">
          All Time keeps the existing clinic-wide report view. Choose Day, Week, Month, or Year for a bounded daily-average period.
        </p>
      )}
    </section>
  );
}
