// src/components/LogoutMenu.jsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";

function LogoutIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * Centered "Are you sure you want to logout?" confirmation dialog,
 * portaled to <body> so it always sits dead-center of the viewport
 * (matches the mobile-app style confirm sheet) regardless of where the
 * trigger button lives in the layout — used by both the admin and
 * student portals.
 *
 * Props:
 *  - redirectTo: route to send the user to after logging out
 *  - variant: "chip" (icon only, for compact avatar chips) | "full" (icon + label)
 */
export default function LogoutMenu({
  redirectTo = "/admin/login",
  variant = "full",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleConfirm() {
    setLoading(true);
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    } finally {
      setLoading(false);
      setOpen(false);
      navigate(redirectTo, { replace: true });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Logout"
        className={
          (variant === "chip"
            ? "flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            : "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600") +
          (className ? ` ${className}` : "")
        }
      >
        <LogoutIcon className="h-[18px] w-[18px] shrink-0" />
        {variant === "full" && <span>Logout</span>}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-[fadeIn_0.15s_ease-out]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm logout"
              className="w-full max-w-[340px] rounded-3xl bg-white p-6 text-center shadow-2xl animate-[popIn_0.15s_ease-out]"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <LogoutIcon className="h-6 w-6 text-red-600" />
              </div>

              <h2 className="mt-4 text-lg font-bold text-gray-900">Logout</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                Are you sure you want to log out of your account?
              </p>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {loading ? "Logging out…" : "Logout"}
                </button>
              </div>
            </div>

            <style>{`
              @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
              @keyframes popIn {
                from { opacity: 0; transform: scale(0.95) translateY(4px) }
                to { opacity: 1; transform: scale(1) translateY(0) }
              }
            `}</style>
          </div>,
          document.body
        )}
    </>
  );
}
