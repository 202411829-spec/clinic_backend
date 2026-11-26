// src/components/admin/PeriodDropdown.jsx
// Regular Time range picker for the Reports page. Semester and Academic Year
// are Academic Timeline concepts and live in SchoolBasedPeriodPicker.jsx.
// GC-RFB AppSelect visual/animation treatment is applied without changing the
// period options or report state contract.
import { useEffect, useId, useRef, useState } from "react";
import NavIcon from "../ui/NavIcon";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import { REGULAR_TIME_PERIODS } from "../../lib/reportPeriods.js";
import { useTriggerOrigin } from "../../lib/gcMotion";

export default function PeriodDropdown({ value, onChange }) {
  const controlId = useId();
  const listId = `${controlId}-listbox`;
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(-1);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const closeTimer = useRef(null);

  const origin = useTriggerOrigin({
    enabled: open && rendered,
    panelRef: menuRef,
    triggerRef: buttonRef,
  });

  function finishClose(focusButton = false) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(false);
    setRendered(false);
    setClosing(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function requestClose(focusButton = false) {
    if (!rendered) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      finishClose(focusButton);
      return;
    }
    setClosing(true);
    setOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => finishClose(focusButton), 170);
  }

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const selectedIndex = REGULAR_TIME_PERIODS.indexOf(value);

  useEffect(() => {
    if (!rendered || active < 0) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [rendered, active]);

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setRendered(true);
    setClosing(false);
    setOpen(true);
  }

  function commit(period) {
    onChange(period);
    requestClose(true);
  }

  function move(direction) {
    const total = REGULAR_TIME_PERIODS.length;
    let index = active;
    for (let step = 0; step < total; step += 1) {
      index = (index + direction + total) % total;
      if (index >= 0) {
        setActive(index);
        return;
      }
    }
  }

  function onKeyDown(e) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Spacebar"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(REGULAR_TIME_PERIODS.length - 1);
    } else if (["Enter", " ", "Spacebar"].includes(e.key)) {
      e.preventDefault();
      if (active >= 0) commit(REGULAR_TIME_PERIODS[active]);
    } else if (e.key === "Tab") {
      requestClose(false);
    }
  }

  const triggerState = open
    ? "border-brand-600 bg-white text-brand-900 ring-4 ring-brand-500/15 shadow-sm"
    : "border-slate-200 bg-white text-slate-800 hover:border-brand-500/50 hover:bg-brand-50/40";

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        id={controlId}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-label="Report period"
        onClick={() => (open ? requestClose(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full md:w-44 flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-all duration-200 outline-none ${triggerState}`}
      >
        {value}
        <NavIcon
          name="chevron-right"
          className={`h-4 w-4 shrink-0 rotate-90 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            open ? "rotate-[270deg] text-brand-700" : "text-slate-400"
          }`}
        />
      </button>

      {rendered && (
        <PortalOverlay
          triggerRef={buttonRef}
          panelRef={menuRef}
          enabled={rendered}
          align="left"
          preferredWidth={192}
          estimatedHeight={240}
          id={listId}
          role="listbox"
          ariaLabel="Report period"
          flipClassName="is-flip"
          className={`gc-uiverse-select-menu ${closing ? "is-closing" : ""} ${origin.className}`}
          style={origin.style}
          onMouseLeave={() => setActive(selectedIndex)}
          onOutside={() => requestClose(false)}
          onEscape={() => requestClose(true)}
        >
          {REGULAR_TIME_PERIODS.map((period, index) => (
            <button
              key={period}
              type="button"
              role="option"
              aria-selected={period === value}
              data-index={index}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => commit(period)}
              className={`gc-no-btn-anim gc-uiverse-select-item ${
                period === value ? "is-selected" : ""
              } ${index === active ? "is-active" : ""}`}
            >
              {period}
            </button>
          ))}
        </PortalOverlay>
      )}
    </div>
  );
}
