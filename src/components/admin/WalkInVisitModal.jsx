// src/components/admin/WalkInVisitModal.jsx
// Modal wrapper for the shared walk-in form. Both the dashboard Logbook widget
// and the standalone Logbook page open this portal so their tables stay
// uncluttered and long forms can scroll independently.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import WalkInVisitForm from "./WalkInVisitForm.jsx";
import {
  GC_MODAL_CLOSE_MS,
  GC_OVERLAY_Z,
  useModalPresence,
  useTriggerOrigin,
} from "../../lib/gcMotion";

export default function WalkInVisitModal({ open, walkIn, reasonRecords = [], onClose }) {
  const busy = Boolean(walkIn?.isSubmitting);
  const panelRef = useRef(null);
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const origin = useTriggerOrigin({ enabled: open && mounted, panelRef });

  useEffect(() => {
    if (!mounted) return undefined;

    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, busy, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`gc-modal-backdrop fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 backdrop-blur-[3px] sm:items-center ${
        visible ? "is-open" : "is-close"
      }`}
      style={{ zIndex: GC_OVERLAY_Z.modalBackdrop }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Walk-in Visit"
        style={{ ...origin.style, zIndex: GC_OVERLAY_Z.modalPanel }}
        className={`gc-modal-panel my-auto w-full max-w-4xl rounded-panel bg-white shadow-e4 ${
          visible ? "is-open" : "is-close"
        } ${origin.className}`}
      >
        <div className="max-h-[85vh] overflow-y-auto p-5 [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0">
          <WalkInVisitForm
            regId={walkIn.regId} setRegId={walkIn.setRegId}
            reasonId={walkIn.reasonId}
            reasonRecords={reasonRecords}
            handleReasonChange={walkIn.handleReasonChange}
            lastName={walkIn.lastName} setLastName={walkIn.setLastName}
            firstName={walkIn.firstName} setFirstName={walkIn.setFirstName}
            middleInitial={walkIn.middleInitial} setMiddleInitial={walkIn.setMiddleInitial}
            suffix={walkIn.suffix} setSuffix={walkIn.setSuffix}
            complaint={walkIn.complaint} setComplaint={walkIn.setComplaint}
            medicineInput={walkIn.medicineInput} setMedicineInput={walkIn.setMedicineInput}
            quantity={walkIn.quantity} setQuantity={walkIn.setQuantity}
            medTags={walkIn.medTags}
            walkInError={walkIn.walkInError}
            setWalkInError={walkIn.setWalkInError}
            isSubmitting={walkIn.isSubmitting}
            handleAddMedicine={walkIn.handleAddMedicine}
            handleAddWalkIn={walkIn.handleAddWalkIn}
            handleClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
