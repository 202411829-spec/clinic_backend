// src/components/admin/StatusMenu.jsx
import { useEffect, useRef, useState } from "react";
import { statusOptions } from "../../data/dashboardSample";

export default function StatusMenu({ current, onChange, onViewRecord }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Row actions"
      >
        &#8942;
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {statusOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${
                opt === current
                  ? "bg-gc-green text-white hover:bg-gc-green"
                  : "text-gray-700"
              }`}
            >
              {opt}
            </button>
          ))}
          <div className="border-t border-gray-100" />
          <button
            onClick={() => {
              onViewRecord?.();
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            View Record
          </button>
        </div>
      )}
    </div>
  );
}
