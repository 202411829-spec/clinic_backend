// src/components/admin/PeriodDropdown.jsx
// Small "Day / Week / Month / Semester / Academic Year / Year / All Time"
// picker used on the Reports page to control the reporting range.
import { useEffect, useRef, useState } from "react";
import NavIcon from "./NavIcon";

export const REPORT_PERIODS = [
  "Day",
  "Week",
  "Month",
  "Semester",
  "Academic Year",
  "Year",
  "All Time",
];

export default function PeriodDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full md:w-44 flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {value}
        <NavIcon
          name="chevron-right"
          className={`w-4 h-4 rotate-90 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-[270deg]" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 md:left-0 z-20 mt-2 w-48 rounded-3xl border-2 border-gc-green bg-white p-2 shadow-lg"
        >
          {REPORT_PERIODS.map((period) => (
            <button
              key={period}
              role="option"
              aria-selected={period === value}
              onClick={() => {
                onChange(period);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 rounded-2xl text-sm font-bold transition-colors ${
                period === value
                  ? "bg-gc-green text-white"
                  : "text-gray-600 hover:bg-gc-green-50"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
