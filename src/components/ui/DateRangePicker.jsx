// src/components/ui/DateRangePicker.jsx
// Shared GC-RFB date-range picker. Reuses the clinic calendar CSS layer and
// gcMotion trigger-origin/modal-presence helpers; range/date state stays with
// the caller so existing filters and API payloads are unchanged.
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NavIcon from "./NavIcon.jsx";
import { GC_MODAL_CLOSE_MS, GC_OVERLAY_Z, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion.js";
import { getOverlayPosition } from "../../lib/gcOverlayPosition.js";
import {
  addMonths,
  formatDateLabel,
  formatRangeLabel,
  getCalendarDays,
  getMonthLabel,
  getRangePreview,
  isDateDisabled,
  moveFocusISO,
  parseISODate,
  pickRangeDate,
  sameDay,
  startOfDay,
  toISODate,
} from "../../lib/dateRangeCalendar.js";
import {
  makeYMD,
  MONTH_LABELS_LONG,
  MONTH_LABELS_SHORT,
  parseNonNegativeYear,
} from "../../lib/reportPeriodSelection.js";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CLOSE_DURATION = GC_MODAL_CLOSE_MS;
const PANEL_PREFERRED_WIDTH = 336;

// Single source of truth for range-calendar triggers. This markup and class
// contract is the Logbook trigger design; other calendar popovers reuse it
// instead of defining their own button styling.
export const CalendarTriggerButton = forwardRef(function CalendarTriggerButton(
  { children, className = "", textClassName = "", placeholder = false, ...buttonProps },
  ref
) {
  const textClasses = [
    "gc-cal-trigger-text",
    placeholder ? "is-placeholder" : "",
    textClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={`gc-cal-trigger gc-no-btn-anim ${className}`}
    >
      <NavIcon name="calendar" className="gc-cal-trigger-icon h-4 w-4 shrink-0" />
      <span className={textClasses}>{children}</span>
    </button>
  );
});

function CalendarGrid({
  value,
  today,
  view,
  setView,
  focusISO,
  setFocusISO,
  hoverISO,
  setHoverISO,
  minDate,
  maxDate,
  disabled,
  onPick,
}) {
  const gridRef = useRef(null);
  const days = useMemo(() => getCalendarDays(view), [view]);
  const monthLabel = getMonthLabel(view);
  const preview = getRangePreview(value, hoverISO);
  const start = parseISODate(preview.start);
  const end = parseISODate(preview.end);
  const hasRange = Boolean(start && end);
  const startTime = start ? startOfDay(start).getTime() : 0;
  const endTime = end ? startOfDay(end).getTime() : 0;

  const min = parseISODate(minDate);
  const canPrev =
    !min ||
    new Date(view.getFullYear(), view.getMonth(), 1).getTime() >
      new Date(min.getFullYear(), min.getMonth(), 1).getTime();

  function moveFocus(iso, deltaDays) {
    const nextISO = moveFocusISO(iso, deltaDays, { minDate, maxDate, disabled });
    if (!nextISO) return;
    const next = parseISODate(nextISO);
    setFocusISO(nextISO);
    setView(new Date(next.getFullYear(), next.getMonth(), 1));
    window.setTimeout(() => {
      gridRef.current?.querySelector(`[data-iso="${nextISO}"]`)?.focus();
    }, 0);
  }

  function shiftMonth(delta) {
    if (delta < 0 && !canPrev) return;
    setView((current) => addMonths(current, delta));
  }

  return (
    <div className="gc-cal" onMouseLeave={() => setHoverISO("")}>
      <div className="gc-cal-head">
        <p className="gc-cal-month">{monthLabel}</p>
        <div className="gc-cal-nav">
          <button
            type="button"
            className="gc-cal-navbtn gc-no-btn-anim"
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => shiftMonth(-1)}
          >
            <NavIcon name="chevron-left" className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="gc-cal-navbtn gc-no-btn-anim"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <NavIcon name="chevron-right" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="gc-cal-dow">
        {DAY_LABELS.map((label) => (
          <div key={label} className="gc-cal-dow-cell">
            {label}
          </div>
        ))}
      </div>

      <div ref={gridRef} className="gc-cal-grid" role="grid" aria-label={monthLabel}>
        {days.map((day) => {
          const iso = toISODate(day);
          const outside = day.getMonth() !== view.getMonth();
          const blocked = isDateDisabled(day, { minDate, maxDate, disabled });
          const isToday = sameDay(day, today);
          const isStart = Boolean(start && sameDay(day, start));
          const isEnd = Boolean(end && sameDay(day, end));
          const time = startOfDay(day).getTime();
          const inRange = hasRange && time >= startTime && time <= endTime;
          const isMiddle = inRange && !isStart && !isEnd;
          const selected = isStart || isEnd || isMiddle;
          const cellClasses = [
            "gc-cal-cell",
            inRange ? "is-in-range" : "",
            isStart ? "is-range-start" : "",
            isEnd ? "is-range-end" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const dayClasses = [
            "gc-cal-day",
            "gc-no-btn-anim",
            outside ? "is-outside" : "",
            blocked ? "is-disabled" : "",
            isToday ? "is-today" : "",
            isStart ? "is-range-start" : "",
            isEnd ? "is-range-end" : "",
            isMiddle ? "is-in-range" : "",
            isStart && isEnd ? "is-range-solo" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={iso} className={cellClasses}>
              <button
                type="button"
                data-iso={iso}
                role="gridcell"
                aria-selected={selected}
                aria-label={day.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                disabled={blocked}
                tabIndex={focusISO === iso ? 0 : -1}
                className={dayClasses}
                onMouseEnter={() => {
                  if (!blocked) setHoverISO(iso);
                }}
                onFocus={() => {
                  setFocusISO(iso);
                  if (!blocked) setHoverISO(iso);
                }}
                onClick={() => {
                  if (!blocked) onPick(iso);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveFocus(iso, 1);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveFocus(iso, -1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveFocus(iso, 7);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(iso, -7);
                  }
                }}
              >
                <span className="gc-cal-daynum">{day.getDate()}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shared calendar body: one grid + footer implementation for the standalone
// DateRangePicker and the Logbook Day range. Both surfaces get the same hover
// preview, keyboard navigation, start/end/middle states, and footer motion.
export function RangeCalendarPanel({
  value,
  today,
  view,
  setView,
  focusISO,
  setFocusISO,
  hoverISO,
  setHoverISO,
  minDate,
  maxDate,
  disabled,
  onPick,
  onClear,
  hint,
}) {
  return (
    <>
      <CalendarGrid
        value={value}
        today={today}
        view={view}
        setView={setView}
        focusISO={focusISO}
        setFocusISO={setFocusISO}
        hoverISO={hoverISO}
        setHoverISO={setHoverISO}
        minDate={minDate}
        maxDate={maxDate}
        disabled={disabled}
        onPick={onPick}
      />
      <div className="gc-cal-footer">
        <button type="button" className="gc-cal-clear gc-no-btn-anim" onClick={onClear}>
          Clear
        </button>
        <span className="gc-cal-hint">
          {hint ?? (value?.from && !value?.to ? "Select end date" : "Select start and end date")}
        </span>
      </div>
    </>
  );
}

// Academic Timeline uses the same two-click continuous-range rules as the day
// grid above, with each cell representing the first of a calendar month.
export function MonthRangeCalendarPanel({
  value,
  viewYear,
  setViewYear,
  focusISO,
  setFocusISO,
  hoverISO,
  setHoverISO,
  onPick,
  onClear,
  hint,
}) {
  const year = parseNonNegativeYear(viewYear) ?? new Date().getFullYear();
  const preview = getRangePreview(value, hoverISO);
  const startISO = preview.start || "";
  const endISO = preview.end || "";
  const months = MONTH_LABELS_SHORT.map((label, month) => ({
    month,
    iso: makeYMD(year, month, 1),
    shortLabel: label,
    ariaLabel: `${MONTH_LABELS_LONG[month]} ${year}`,
  }));

  function shiftYear(delta) {
    const next = year + delta;
    if (next < 0) return;
    setViewYear(next);
  }

  function moveFocus(iso, deltaMonths) {
    const current = parseISODate(iso);
    if (!current) return;
    const nextDate = addMonths(current, deltaMonths);
    const nextISO = makeYMD(nextDate.getFullYear(), nextDate.getMonth(), 1);
    setFocusISO(nextISO);
    setViewYear(nextDate.getFullYear());
    window.setTimeout(() => {
      document.querySelector(`[data-iso="${nextISO}"]`)?.focus();
    }, 0);
  }

  return (
    <>
      <div className="gc-cal" onMouseLeave={() => setHoverISO("")}>
        <div className="gc-cal-head">
          <button
            type="button"
            className="gc-cal-navbtn gc-no-btn-anim"
            aria-label="Previous year"
            disabled={year === 0}
            onClick={() => shiftYear(-1)}
          >
            <NavIcon name="chevron-left" className="h-4 w-4" />
          </button>
          <p className="gc-cal-month" aria-live="polite">
            {year}
          </p>
          <button
            type="button"
            className="gc-cal-navbtn gc-no-btn-anim"
            aria-label="Next year"
            onClick={() => shiftYear(1)}
          >
            <NavIcon name="chevron-right" className="h-4 w-4" />
          </button>
        </div>

        <div className="gc-cal-grid gc-month-grid" role="grid" aria-label={`Months in ${year}`}>
          {months.map(({ iso, shortLabel, ariaLabel }) => {
            const isStart = Boolean(startISO && iso === startISO);
            const isEnd = Boolean(endISO && iso === endISO);
            const inRange = Boolean(startISO && endISO && iso >= startISO && iso <= endISO);
            const isMiddle = inRange && !isStart && !isEnd;
            const selected = isStart || isEnd || isMiddle;
            const cellClasses = [
              "gc-cal-cell gc-month-cell",
              inRange ? "is-in-range" : "",
              isStart ? "is-range-start" : "",
              isEnd ? "is-range-end" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const monthClasses = [
              "gc-cal-day gc-month-day gc-no-btn-anim",
              isStart ? "is-range-start" : "",
              isEnd ? "is-range-end" : "",
              isMiddle ? "is-in-range" : "",
              isStart && isEnd ? "is-range-solo" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={iso} className={cellClasses}>
                <button
                  type="button"
                  data-iso={iso}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={ariaLabel}
                  tabIndex={focusISO === iso ? 0 : -1}
                  className={monthClasses}
                  onMouseEnter={() => setHoverISO(iso)}
                  onFocus={() => {
                    setFocusISO(iso);
                    setHoverISO(iso);
                  }}
                  onClick={() => onPick(iso)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      moveFocus(iso, 1);
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveFocus(iso, -1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveFocus(iso, 3);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveFocus(iso, -3);
                    }
                  }}
                >
                  <span className="gc-cal-daynum">{`${shortLabel} ${year}`}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="gc-cal-footer">
        <button type="button" className="gc-cal-clear gc-no-btn-anim" onClick={onClear}>
          Clear
        </button>
        <span className="gc-cal-hint">
          {hint ?? (value?.from && !value?.to ? "Select end month" : "Select start and end month")}
        </span>
      </div>
    </>
  );
}

export default function DateRangePicker({
  value = { from: "", to: "" },
  onChange,
  minDate,
  maxDate,
  disabled,
  placeholder = "All dates",
  ariaLabel = "Select date range",
  className = "",
  buttonClassName = "",
  panelClassName = "",
  align = "left",
  triggerTestId,
}) {
  const [open, setOpen] = useState(false);
  const [focusISO, setFocusISO] = useState(() => value?.from || value?.to || toISODate(new Date()));
  const [hoverISO, setHoverISO] = useState("");
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: PANEL_PREFERRED_WIDTH,
    maxHeight: 360,
    placeAbove: false,
    hidden: true,
  });

  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const { mounted, visible: presenceVisible } = useModalPresence(open, CLOSE_DURATION);
  const visible = open || presenceVisible;
  const origin = useTriggerOrigin({ enabled: open && mounted, panelRef: popRef, triggerRef });

  const range = {
    from: value?.from || "",
    to: value?.to || "",
  };
  const displayText = formatRangeLabel(range, placeholder);
  const anchorISO = range.to || range.from || toISODate(today);
  const [view, setView] = useState(() => {
    const anchor = parseISODate(anchorISO) || today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  const requestClose = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger && typeof window !== "undefined") {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  useLayoutEffect(() => {
    if (!mounted || typeof window === "undefined" || !triggerRef.current) return undefined;

    function updatePosition() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const panelHeight = popRef.current?.getBoundingClientRect().height || 360;
      setPosition(
        getOverlayPosition({
          triggerRect,
          panelWidth: PANEL_PREFERRED_WIDTH,
          panelHeight,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          gap: 8,
          margin: 8,
          align,
        })
      );
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mounted, visible, align]);

  useEffect(() => {
    const anchor = parseISODate(anchorISO);
    if (!anchor) return;
    setView((current) => {
      const next = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      return current.getTime() === next.getTime() ? current : next;
    });
  }, [anchorISO]);

  useEffect(() => {
    if (!open) return undefined;

    function handleOutside(event) {
      if (wrapRef.current?.contains(event.target) || popRef.current?.contains(event.target)) return;
      requestClose(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose(true);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, requestClose]);

  function openPicker() {
    setFocusISO(anchorISO);
    setHoverISO("");
    setOpen(true);
  }

  function handlePick(iso) {
    onChange?.(pickRangeDate(range, iso));
  }

  function clearRange() {
    onChange?.({ from: "", to: "" });
    requestClose(true);
  }

  const panelClasses = [
    "gc-cal-pop",
    "gc-cal-pop-portal",
    visible ? "is-open" : "is-close",
    position.placeAbove ? "is-above" : "",
    align === "right" ? "right-0" : "",
    origin.className,
    panelClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const panelStyle = {
    top: position.top,
    left: position.left,
    width: position.width,
    maxHeight: position.maxHeight,
    zIndex: GC_OVERLAY_Z.popover,
    visibility: position.hidden ? "hidden" : "visible",
    pointerEvents: position.hidden ? "none" : "auto",
    ...(origin.style || {}),
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <CalendarTriggerButton
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={triggerTestId}
        onClick={() => (open ? requestClose(false) : openPicker())}
        className={buttonClassName}
        placeholder={!range.from && !range.to}
      >
        {displayText}
      </CalendarTriggerButton>

      {mounted && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel}
            className={panelClasses}
            style={panelStyle}
          >
            <RangeCalendarPanel
              value={range}
              today={today}
              view={view}
              setView={setView}
              focusISO={focusISO}
              setFocusISO={setFocusISO}
              hoverISO={hoverISO}
              setHoverISO={setHoverISO}
              minDate={minDate}
              maxDate={maxDate}
              disabled={disabled}
              onPick={handlePick}
              onClear={clearRange}
              hint={range.from && !range.to ? "Select end date" : "Select start and end date"}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

export { formatDateLabel };
