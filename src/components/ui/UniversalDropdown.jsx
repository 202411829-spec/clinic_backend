// src/components/ui/UniversalDropdown.jsx
// Universal dropdown extracted from PeriodDropdown — used everywhere so all
// dropdowns share the same trigger + panel chrome.
import { useEffect, useRef, useState } from "react";
import NavIcon from "../admin/NavIcon";

function normalizeOptions(options) {
  if (!options) return [];
  return options.map((o) => {
    if (typeof o === "string") return { value: o, label: o };
    return o;
  });
}

export default function UniversalDropdown({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  disabled = false,
  className = "",
  buttonClassName = "",
  panelClassName = "",
  triggerTestId,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const opts = normalizeOptions(options);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = opts.find((o) => String(o.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const isPlaceholder = !selected;

  // include placeholder as first option if value === "" and placeholder provided
  const showPlaceholderOption = placeholder && !opts.some((o) => String(o.value) === "");

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={triggerTestId}
        className={`w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white text-left ${isPlaceholder && !selected ? "text-gray-400" : ""} ${buttonClassName}`}
      >
        <span className="truncate">{displayLabel}</span>
        <NavIcon
          name="chevron-right"
          className={`w-4 h-4 rotate-90 shrink-0 text-gray-400 transition-transform ${open ? "rotate-[270deg]" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className={`absolute left-0 right-0 md:left-0 md:right-auto z-50 mt-2 w-full min-w-[12rem] max-h-60 overflow-y-auto rounded-3xl border-2 border-gc-green bg-white p-2 shadow-lg ${panelClassName}`}
        >
          {showPlaceholderOption && (
            <button
              key="__placeholder"
              role="option"
              aria-selected={value === "" || value == null}
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold transition-colors ${
                value === "" || value == null
                  ? "bg-gc-green text-white"
                  : "text-gray-600 hover:bg-gc-green-50"
              }`}
            >
              {placeholder}
            </button>
          )}
          {opts.map((opt) => (
            <button
              key={String(opt.value)}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              onClick={() => {
                onChange?.(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold transition-colors ${
                String(opt.value) === String(value)
                  ? "bg-gc-green text-white"
                  : "text-gray-600 hover:bg-gc-green-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
