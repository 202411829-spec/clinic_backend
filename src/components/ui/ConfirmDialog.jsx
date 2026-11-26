// src/components/ui/ConfirmDialog.jsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GC_MODAL_CLOSE_MS, GC_OVERLAY_Z, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion";

/**
 * Small "are you sure?" modal (portal to <body>, Esc / backdrop to dismiss).
 * Used before destructive actions such as cancelling an appointment.
 * Motion follows the GC-RFB modal + trigger-origin design; copy and callbacks
 * remain unchanged.
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Yes, cancel it",
  cancelLabel = "No, keep it",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const origin = useTriggerOrigin({ enabled: open && mounted, panelRef });

  useEffect(() => {
    if (!mounted) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !busy) onCancel?.();
    }
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, busy, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`gc-modal-backdrop fixed inset-0 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[3px] ${
        visible ? "is-open" : "is-close"
      }`}
      style={{ zIndex: GC_OVERLAY_Z.confirmBackdrop }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{ ...origin.style, zIndex: GC_OVERLAY_Z.confirmPanel }}
        className={`gc-modal-panel relative w-full max-w-sm rounded-panel bg-white p-6 shadow-e4 ${
          visible ? "is-open" : "is-close"
        } ${origin.className}`}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal-rose-bg text-signal-rose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h3 id="confirm-dialog-title" className="text-center font-serif text-lg font-semibold text-ink-900">
          {title}
        </h3>
        {message && <p className="mt-2 text-center text-sm text-ink-500">{message}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-press rounded-card border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="btn-press rounded-card bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Cancelling…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
