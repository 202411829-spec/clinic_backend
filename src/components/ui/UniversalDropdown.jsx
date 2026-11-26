// src/components/ui/UniversalDropdown.jsx
// Universal dropdown extracted from PeriodDropdown — used everywhere so all
// dropdowns share the same trigger + panel chrome.
// Visual/animation behavior follows the GC-RFB AppSelect design; option data,
// value handling and caller state remain exactly as before.
import { useEffect, useId, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import PortalOverlay from "./PortalOverlay.jsx";
import { useTriggerOrigin } from "../../lib/gcMotion";

function normalizeOptions(options) {
  if (!options) return [];
  return options.map((o) => {
    if (typeof o === "string") return { value: o, label: o };
    return { ...o, label: o.label ?? o.value };
  });
}

export default function UniversalDropdown({
  value,
  onChange,
  options = [],
  placeholder = "Choose an option",
  disabled = false,
  className = "",
  buttonClassName = "",
  panelClassName = "",
  triggerTestId,
  ariaLabel,
}) {
  const controlId = useId();
  const listId = `${controlId}-listbox`;
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(-1);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const closeTimer = useRef(null);

  const opts = normalizeOptions(options);
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

  const selected = opts.find((o) => String(o.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const isPlaceholder = !selected;

  // Placeholder text is display-only for the empty/unselected state. It must
  // never become a selectable option row.
  const items = opts;
  const selectedIndex = items.findIndex((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!rendered || active < 0) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [rendered, active]);

  function openMenu() {
    if (disabled) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const nextActive =
      selectedIndex >= 0
        ? selectedIndex
        : items.findIndex((o) => !o.disabled);
    setActive(nextActive);
    setRendered(true);
    setClosing(false);
    setOpen(true);
  }

  function commit(opt) {
    if (!opt || opt.disabled) return;
    onChange?.(opt.value);
    requestClose(true);
  }

  function move(direction) {
    if (!items.length) return;
    let index = active;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index].disabled) {
        setActive(index);
        return;
      }
    }
  }

  function onKeyDown(e) {
    if (disabled) return;
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
      setActive(items.findIndex((o) => !o.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (!items[i].disabled) {
          setActive(i);
          break;
        }
      }
    } else if (["Enter", " ", "Spacebar"].includes(e.key)) {
      e.preventDefault();
      if (active >= 0) commit(items[active]);
    } else if (e.key === "Tab") {
      requestClose(false);
    }
  }

  const triggerState = open
    ? "border-brand-600 bg-white text-brand-900 ring-4 ring-brand-500/15 shadow-sm"
    : "border-slate-200 bg-white text-slate-800 hover:border-brand-500/50 hover:bg-brand-50/40";

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        id={controlId}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? requestClose(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={triggerTestId}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-all duration-200 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${triggerState} ${isPlaceholder ? "text-slate-400" : ""} ${buttonClassName}`}
      >
        <span className="min-w-0 truncate" title={displayLabel}>{displayLabel}</span>
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
          preferredWidth={240}
          estimatedHeight={260}
          id={listId}
          role="listbox"
          ariaLabel={ariaLabel}
          flipClassName="is-flip"
          className={`gc-uiverse-select-menu ${closing ? "is-closing" : ""} ${origin.className} ${panelClassName}`}
          style={origin.style}
          onMouseLeave={() => setActive(selectedIndex)}
          onOutside={() => requestClose(false)}
          onEscape={() => requestClose(true)}
        >
          {items.length === 0 && <div className="gc-uiverse-select-empty">No options</div>}
          {items.map((opt, index) => {
            const isSelected = String(opt.value) === String(value);
            const Icon = opt.icon;
            return (
              <button
                key={`${String(opt.value)}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-index={index}
                disabled={opt.disabled}
                onMouseEnter={() => !opt.disabled && setActive(index)}
                onFocus={() => !opt.disabled && setActive(index)}
                onClick={() => commit(opt)}
                className={`gc-no-btn-anim gc-uiverse-select-item ${
                  isSelected ? "is-selected" : ""
                } ${index === active ? "is-active" : ""}`}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                <span className="min-w-0 break-words whitespace-normal" title={opt.label}>{opt.label}</span>
              </button>
            );
          })}
        </PortalOverlay>
      )}
    </div>
  );
}
