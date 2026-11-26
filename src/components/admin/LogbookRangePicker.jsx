// src/components/admin/LogbookRangePicker.jsx
// Logbook's Regular Time range control. It reuses the Reports period dropdown,
// the shared GC-RFB range calendar, and the date-expansion helpers so Full
// Logbook and the Dashboard widget expose exactly the same Day/Week/Month/
// Year/All Time behavior. The Reports-only timeline is intentionally not exposed here.
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarTriggerButton, RangeCalendarPanel } from "../ui/DateRangePicker.jsx";
import NavIcon from "../ui/NavIcon.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import PeriodDropdown from "./PeriodDropdown.jsx";
import RegularTimePeriodPicker from "./RegularTimePeriodPicker.jsx";
import { GC_MODAL_CLOSE_MS, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion.js";
import { toYMD } from "../../lib/calendar.js";
import { EMPTY_RANGE, parseISODate, pickRangeDate, startOfDay } from "../../lib/dateRangeCalendar.js";
import { parseAcademicMonthISO, toAcademicMonthISO } from "../../lib/academicPeriod.js";
import { normalizeRegularTimePeriod } from "../../lib/reportPeriods.js";
import { parseNonNegativeYear, shiftRegularSelection } from "../../lib/reportPeriodSelection.js";
import {
  dayRangeDates,
  dayRangeLabel,
  initialRegularTimeSelection,
  resolveRegularTimeRange,
  shiftDayRange,
  shiftMonthRange,
} from "../../lib/regularTimeRange.js";
import {
  clearLogbookMonthDraft,
  createLogbookMonthDraft,
  createMonthApplyGate,
  pickLogbookMonthDraft,
  resolveLogbookDraftRange,
} from "../../lib/logbookRangeDraft.js";

export default function LogbookRangePicker({
  value,
  onChange,
  ariaLabel = "Filter by date range",
  className = "",
  buttonClassName = "sm:min-w-[15rem]",
  triggerTestId = "logbook-date-range",
  compact = false,
}) {
  const initial = useState(() => initialRegularTimeSelection(value))[0];
  const [date, setDate] = useState(initial.date);
  const [period, setPeriod] = useState(initial.period);
  const [dayRange, setDayRange] = useState(initial.dayRange);
  const [yearInput, setYearInput] = useState(initial.yearInput);
  const [month, setMonth] = useState(initial.month);
  const [weekIndex, setWeekIndex] = useState(initial.weekIndex);
  const [selectedMonths, setSelectedMonths] = useState(initial.selectedMonths);
  const initialMonthISO = toAcademicMonthISO(
    parseNonNegativeYear(initial.yearInput) ?? new Date().getFullYear(),
    initial.month
  );
  const initialMonthAnchorISO = initial.monthRange?.to || initial.monthRange?.from || initialMonthISO;
  const initialMonthAnchor = parseAcademicMonthISO(initialMonthAnchorISO);
  const [monthRange, setMonthRange] = useState(initial.monthRange);
  const [monthViewYear, setMonthViewYear] = useState(
    initialMonthAnchor?.getFullYear() ?? parseNonNegativeYear(initial.yearInput) ?? new Date().getFullYear()
  );
  const [monthFocusISO, setMonthFocusISO] = useState(initialMonthAnchorISO);
  const [monthHoverISO, setMonthHoverISO] = useState("");

  const [open, setOpen] = useState(false);
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const applyGateRef = useRef(null);
  if (!applyGateRef.current) {
    applyGateRef.current = createMonthApplyGate(
      value,
      (nextRange) => onChangeRef.current?.(nextRange)
    );
  }
  const origin = useTriggerOrigin({
    enabled: open && mounted,
    panelRef,
    triggerRef,
  });

  const today = useMemo(() => startOfDay(new Date()), []);
  const dayAnchorISO = dayRange.to || dayRange.from || toYMD(date);
  const [view, setView] = useState(() => {
    const anchor = parseISODate(dayAnchorISO) || today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const [focusISO, setFocusISO] = useState(dayAnchorISO || toYMD(today));
  const [hoverISO, setHoverISO] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // When the parent mirrors an applied range back into `value`, keep the gate's
  // signature in sync so Done never causes a second fetch for the same range.
  useEffect(() => {
    if (!applyGateRef.current?.monthDraftDirty) {
      applyGateRef.current?.resetToApplied(value);
    }
  }, [value?.from, value?.to, value?.period]);

  useEffect(() => {
    if (!open || period !== "Day") return;
    const anchor = parseISODate(dayAnchorISO) || today;
    const nextView = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    setView((current) => (current.getTime() === nextView.getTime() ? current : nextView));
    setFocusISO(dayAnchorISO || toYMD(today));
    setHoverISO("");
  }, [open, period, dayAnchorISO, today]);

  useEffect(() => {
    if (!open || period !== "Month") return;
    const year = parseNonNegativeYear(yearInput) ?? new Date().getFullYear();
    const anchorISO = monthRange.to || monthRange.from || toAcademicMonthISO(year, month);
    const anchor = parseAcademicMonthISO(anchorISO);
    if (!anchor) return;
    setMonthViewYear(anchor.getFullYear());
    setMonthFocusISO(anchorISO);
    setMonthHoverISO("");
  }, [open, period, monthRange, month, yearInput]);

  // Day uses a continuous start/end range; the expanded list is only the
  // adapter that keeps the existing date_from/date_to query contract intact.
  const selectedDays = useMemo(() => dayRangeDates(dayRange), [dayRange]);
  const selection = useMemo(
    () => ({ period, date, dayRange, monthRange, selectedDays, yearInput, month, weekIndex, selectedMonths }),
    [period, date, dayRange, monthRange, selectedDays, yearInput, month, weekIndex, selectedMonths]
  );
  const range = useMemo(
    () => ({ ...resolveRegularTimeRange(selection), period: selection.period }),
    [selection]
  );

  // Keep the Logbook's existing dateFrom/dateTo contract intact. Month picks
  // stay in the draft until Done; other periods keep their immediate behavior.
  useEffect(() => {
    applyGateRef.current?.maybeApply(range);
  }, [range.from, range.to, range.label, range.dates, range.period]);

  function syncAnchorDate(nextDate) {
    if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) return;
    setDate(nextDate);
    setYearInput(String(nextDate.getFullYear()));
    setMonth(nextDate.getMonth());
    setSelectedMonths([nextDate.getMonth()]);
    setWeekIndex(null);
  }

  // Opening starts a fresh draft from the range the parent has actually
  // applied. Closing without Done simply abandons this draft on next open.
  function resetDraftFromValue() {
    const next = createLogbookMonthDraft(value);
    setDate(next.date);
    setPeriod(next.period);
    setDayRange(next.dayRange);
    setYearInput(next.yearInput);
    setMonth(next.month);
    setWeekIndex(next.weekIndex);
    setSelectedMonths(next.selectedMonths);
    setMonthRange(next.monthRange);

    const year = parseNonNegativeYear(next.yearInput) ?? new Date().getFullYear();
    const anchorISO = next.monthRange?.to || next.monthRange?.from || toAcademicMonthISO(year, next.month);
    const anchor = parseAcademicMonthISO(anchorISO);
    setMonthViewYear(anchor?.getFullYear() ?? year);
    setMonthFocusISO(anchorISO);
    setMonthHoverISO("");

    const dayAnchorISO = next.dayRange?.to || next.dayRange?.from || toYMD(next.date);
    const dayAnchor = parseISODate(dayAnchorISO) || today;
    setView(new Date(dayAnchor.getFullYear(), dayAnchor.getMonth(), 1));
    setFocusISO(dayAnchorISO || toYMD(today));
    setHoverISO("");
    applyGateRef.current?.resetToApplied(value);
  }

  function togglePicker() {
    if (!open) resetDraftFromValue();
    setOpen((current) => !current);
  }

  function closePicker() {
    if (period === "Month" && applyGateRef.current?.monthDraftDirty) {
      applyGateRef.current.resetToApplied(value);
    }
    setOpen(false);
  }

  function finishPicker() {
    if (period === "Month") {
      applyGateRef.current?.applyMonthDraft(resolveLogbookDraftRange(selection));
    }
    setOpen(false);
  }

  function handlePickDay(iso) {
    const next = pickRangeDate(dayRange, iso);
    setDayRange(next);
    const picked = parseISODate(iso);
    if (picked) syncAnchorDate(picked);
    setFocusISO(iso);
  }

  function handleClearDayRange() {
    setDayRange(EMPTY_RANGE);
    syncAnchorDate(today);
    setFocusISO(toYMD(today));
    setHoverISO("");
  }

  function handlePickMonth(iso) {
    const next = pickLogbookMonthDraft(selection, iso);
    setMonthRange(next.monthRange);
    setMonthViewYear(next.monthViewYear);
    setYearInput(next.yearInput);
    setMonth(next.month);
    setSelectedMonths(next.selectedMonths);
    setWeekIndex(next.weekIndex);
    setMonthFocusISO(next.monthFocusISO);
    setMonthHoverISO(next.monthHoverISO);
    applyGateRef.current?.markMonthDraftDirty();
  }

  function handleClearMonthRange() {
    const next = clearLogbookMonthDraft(selection, today);
    setMonthRange(next.monthRange);
    setMonthViewYear(next.monthViewYear);
    setMonthFocusISO(next.monthFocusISO);
    setMonthHoverISO(next.monthHoverISO);
    applyGateRef.current?.markMonthDraftDirty();
  }

  function applyRegularPatch(patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "date")) setDate(patch.date);
    if (Object.prototype.hasOwnProperty.call(patch, "yearInput")) setYearInput(patch.yearInput);
    if (Object.prototype.hasOwnProperty.call(patch, "month")) {
      setMonth(patch.month);
      setWeekIndex(null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "weekIndex")) setWeekIndex(patch.weekIndex);
    if (Object.prototype.hasOwnProperty.call(patch, "selectedRegularMonths")) {
      setSelectedMonths(patch.selectedRegularMonths);
    }
  }

  function shiftPeriod(delta) {
    if (period === "Day") {
      const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
      const nextDate = new Date(source);
      nextDate.setDate(nextDate.getDate() + (Number(delta) < 0 ? -1 : 1));
      syncAnchorDate(nextDate);
      setDayRange(shiftDayRange(dayRange, delta));
      return;
    }

    if (period === "Month") {
      // Arrow buttons are outside the calendar draft. Discard any unfinished
      // grid draft so the shifted range applies once through the normal gate.
      if (applyGateRef.current?.monthDraftDirty) {
        applyGateRef.current.resetToApplied(value);
      }
      const year = parseNonNegativeYear(yearInput) ?? new Date().getFullYear();
      const anchorISO = monthRange.from || toAcademicMonthISO(year, month);
      const source = monthRange.to ? monthRange : { from: anchorISO, to: anchorISO };
      const next = shiftMonthRange(source, delta);
      setMonthRange(next);
      const first = parseAcademicMonthISO(next.from);
      if (first) {
        setYearInput(String(first.getFullYear()));
        setMonth(first.getMonth());
        setSelectedMonths([first.getMonth()]);
        setWeekIndex(null);
        setMonthViewYear(first.getFullYear());
        setMonthFocusISO(next.from);
      }
      return;
    }

    const year = parseNonNegativeYear(yearInput);
    applyRegularPatch(shiftRegularSelection({
      ...selection,
      weekYear: yearInput,
      weekMonth: month,
      weekIndex,
      monthsYear: yearInput,
      selectedMonths,
      year,
    }, delta));
  }

  const shiftDisabled = period === "All Time";
  const shiftClass = compact
    ? "icon-btn h-8 w-8 shrink-0 rounded-control border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
    : "icon-btn h-9 w-9 shrink-0 rounded-control border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40";

  return (
    <div className={`relative ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PeriodDropdown
          value={period}
          onChange={(next) => {
            const normalized = normalizeRegularTimePeriod(next);
            if (normalized === "Day" && period !== "Day") {
              // Never carry a Year/Month range into the Day calendar.
              setDayRange(EMPTY_RANGE);
              syncAnchorDate(date);
            }
            if (period === "Month" && normalized !== "Month") {
              applyGateRef.current?.resetToApplied(value);
            }
            setPeriod(normalized);
            setOpen(false);
          }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {!shiftDisabled && (
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              aria-label={`Previous ${period.toLowerCase()}`}
              className={shiftClass}
            >
              <NavIcon name="chevron-left" className="h-4 w-4" />
            </button>
          )}
          <CalendarTriggerButton
            ref={triggerRef}
            onClick={togglePicker}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={ariaLabel}
            data-testid={triggerTestId}
            className={`min-w-0 flex-1 ${buttonClassName}`}
          >
            {range.label || "All dates"}
          </CalendarTriggerButton>
          {!shiftDisabled && (
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              aria-label={`Next ${period.toLowerCase()}`}
              className={shiftClass}
            >
              <NavIcon name="chevron-right" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {mounted && (
        <PortalOverlay
          triggerRef={triggerRef}
          panelRef={panelRef}
          enabled={mounted}
          align="left"
          preferredWidth={336}
          estimatedHeight={420}
          role="dialog"
          ariaLabel={ariaLabel}
          className={`gc-cal-pop gc-cal-pop-portal ${visible ? "is-open" : "is-close"} ${origin.className}`}
          style={origin.style}
          onOutside={closePicker}
          onEscape={closePicker}
          onMouseLeave={() => setHoverISO("")}
        >
          {period === "Day" ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-bold text-gray-800 text-sm md:text-base">Day range</h2>
                <button
                  type="button"
                  onClick={finishPicker}
                  className="btn-press rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Done
                </button>
              </div>
              <p className="mb-3 rounded-lg bg-gc-green/10 px-3 py-2 text-xs font-semibold text-gc-green">
                Selected: {dayRangeLabel(dayRange) || "All dates"}
              </p>
              <RangeCalendarPanel
                value={dayRange}
                today={today}
                view={view}
                setView={setView}
                focusISO={focusISO}
                setFocusISO={setFocusISO}
                hoverISO={hoverISO}
                setHoverISO={setHoverISO}
                onPick={handlePickDay}
                onClear={handleClearDayRange}
                hint={
                  dayRange.from && dayRange.to
                    ? "Pick a date to start a new range"
                    : dayRange.from
                      ? "Select end date"
                      : "Select start and end date"
                }
              />
            </>
          ) : (
            <RegularTimePeriodPicker
              period={period}
              date={date}
              selectedDays={selectedDays}
              yearInput={yearInput}
              month={month}
              weekIndex={weekIndex}
              selectedMonths={selectedMonths}
              onYearInputChange={setYearInput}
              onMonthChange={(nextMonth) => {
                setMonth(nextMonth);
                setWeekIndex(null);
              }}
              onWeekChange={setWeekIndex}
              onMonthsChange={setSelectedMonths}
              onDone={finishPicker}
              monthRange={monthRange}
              monthViewYear={monthViewYear}
              setMonthViewYear={setMonthViewYear}
              monthFocusISO={monthFocusISO}
              setMonthFocusISO={setMonthFocusISO}
              monthHoverISO={monthHoverISO}
              setMonthHoverISO={setMonthHoverISO}
              onMonthRangePick={handlePickMonth}
              onClearMonthRange={handleClearMonthRange}
            />
          )}
        </PortalOverlay>
      )}
    </div>
  );
}
