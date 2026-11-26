// src/components/admin/StatusMenu.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NavIcon from "../ui/NavIcon";
import { useOverlayPosition } from "../ui/PortalOverlay.jsx";
import { GC_OVERLAY_Z } from "../../lib/gcMotion.js";
import { statusOptions } from "../../data/dashboardSample";

const MENU_WIDTH = 160; // matches w-40

export default function StatusMenu({ current, onChange, onViewRecord }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const position = useOverlayPosition({
    triggerRef: buttonRef,
    panelRef: menuRef,
    enabled: open,
    align: "right",
    preferredWidth: MENU_WIDTH,
    estimatedHeight: 240,
  });

  useEffect(() => {
    if (!open) return;

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

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="icon-btn w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Row actions"
      >
        <NavIcon name="dots" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              zIndex: GC_OVERLAY_Z.dropdown,
              visibility: position.hidden ? "hidden" : "visible",
            }}
            className="gc-overlay-portal bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden origin-top animate-pop-in motion-reduce:animate-none"
          >
            {statusOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-gray-50 hover:pl-5 ${
                  opt === current
                    ? "bg-gc-green text-white hover:bg-gc-green hover:pl-4"
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
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 hover:pl-5"
            >
              View Record
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
