// src/components/ui/FilterMultiSelect.jsx
// GC-RFB styled categorical filter. Same trigger/menu chrome as
// UniversalDropdown, but keeps the menu open while options are toggled and
// returns an array to the caller. An empty array means "All".
import { useEffect, useId, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import { CheckIcon } from "./icons.jsx";
import PortalOverlay from "./PortalOverlay.jsx";
import { useTriggerOrigin } from "../../lib/gcMotion";
import {
  formatFilterSelectionLabel,
  normalizeFilterOptions,
  normalizeFilterValues,
  toggleFilterValue,
} from "../../lib/filterMultiSelect.js";

export default function FilterMultiSelect({
  value = [],
  onChange,
  options = [],
  allLabel = "All",
  pluralLabel = "options",
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
  const [active, setActive] = useState(0);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const closeTimer = useRef(null);

  const selectedValues = normalizeFilterValues(value);
  const optionItems = normalizeFilterOptions(options);
  const hasSelection = selectedValues.length > 0;
  const entries = hasSelection
    ? [{ isClear: true, label: "Clear selection" }, ...optionItems]
    : optionItems;

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

  const displayLabel = formatFilterSelectionLabel({
    selected: selectedValues,
    options: optionItems,
    allLabel,
    pluralLabel,
  });
  const selectedIndex = entries.findIndex(
    (entry) => !entry.isClear && selectedValues.includes(String(entry.value))
  );

  useEffect(() => {
    if (!rendered || active < 0) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [rendered, active, entries.length]);

  function openMenu() {
    if (disabled) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setRendered(true);
    setClosing(false);
    setOpen(true);
  }

  // Selection is intentionally non-closing: this is a search filter, not a
  // single-value form field. Callers receive the complete OR set every time.
  function commit(entry, index) {
    if (!entry || entry.disabled) return;
    if (entry.isClear) {
      onChange?.([]);
      setActive(Math.min(index, Math.max(0, optionItems.length)));
      return;
    }
    onChange?.(toggleFilterValue(selectedValues, entry.value));
    setActive(index);
  }

  function move(direction) {
    if (!entries.length) return;
    let index = active;
    for (let step = 0; step < entries.length; step += 1) {
      index = (index + direction + entries.length) % entries.length;
      if (!entries[index].disabled) {
        setActive(index);
        return;
      }
    }
  }

  function onKeyDown(event) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Spacebar"].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(entries.findIndex((entry) => !entry.disabled));
    } else if (event.key === "End") {
      event.preventDefault();
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (!entries[i].disabled) {
          setActive(i);
          break;
        }
      }
    } else if (["Enter", " ", "Spacebar"].includes(event.key)) {
      event.preventDefault();
      if (active >= 0) commit(entries[active], active);
    } else if (event.key === "Tab") {
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
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? requestClose(false) : openMenu())}
        onKeyDown={onKeyDown}
        data-testid={triggerTestId}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition-all duration-200 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${triggerState} ${hasSelection ? "" : "text-slate-400"} ${buttonClassName}`}
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
          estimatedHeight={280}
          id={listId}
          role="listbox"
          ariaLabel={ariaLabel}
          flipClassName="is-flip"
          className={`gc-uiverse-select-menu ${closing ? "is-closing" : ""} ${origin.className} ${panelClassName}`}
          style={origin.style}
          onMouseLeave={() => setActive(selectedIndex >= 0 ? selectedIndex : 0)}
          onOutside={() => requestClose(false)}
          onEscape={() => requestClose(true)}
        >
          {entries.length === 0 && <div className="gc-uiverse-select-empty">No options</div>}
          {entries.map((entry, index) => {
            const isSelected =
              !entry.isClear && selectedValues.includes(String(entry.value));
            return (
              <button
                key={entry.isClear ? "clear-selection" : `${String(entry.value)}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={entry.isClear ? "Clear selection" : undefined}
                data-index={index}
                data-multiselect-clear={entry.isClear ? "true" : undefined}
                disabled={entry.disabled}
                onMouseEnter={() => !entry.disabled && setActive(index)}
                onFocus={() => !entry.disabled && setActive(index)}
                onClick={() => commit(entry, index)}
                className={`gc-no-btn-anim gc-uiverse-select-item ${
                  isSelected ? "is-selected" : ""
                } ${index === active ? "is-active" : ""}`}
              >
                {entry.isClear ? (
                  <NavIcon name="close" className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : isSelected ? (
                  <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words whitespace-normal" title={entry.label}>
                  {entry.label}
                </span>
              </button>
            );
          })}
        </PortalOverlay>
      )}
    </div>
  );
}
