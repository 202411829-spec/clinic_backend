// src/components/admin/StatusMenu.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { statusOptions } from "../../data/dashboardSample";

const MENU_WIDTH = 160; // matches w-40

export default function StatusMenu({ current, onChange, onViewRecord }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 4,
      left: Math.min(
        Math.max(8, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - 8
      ),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    function handleClickOutside(e) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }

    // Keep the menu glued to the button, even while the table underneath scrolls.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, updatePosition]);

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Row actions"
      >
        &#8942;
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_WIDTH }}
            className="z-50 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}
