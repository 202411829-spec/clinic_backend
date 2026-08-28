// src/components/admin/AddAnnualExamModal.jsx
// Modal for adding a new annual examination year for a student. Rendered via
// a portal to <body> (same pattern as src/components/LogoutMenu.jsx). The
// year label is derived automatically (one past the highest known year); the
// school year is prefilled from the previous year and editable.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SCHOOL_YEAR_RE = /^\d{4}\s*-\s*(\d{4}|\d{2})$/;

export default function AddAnnualExamModal({
  nextYearLabel,
  initialSchoolYear,
  onClose,
  onSubmit,
}) {
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const schoolYearValid = SCHOOL_YEAR_RE.test(String(schoolYear).trim());

  async function handleSubmit() {
    if (!schoolYearValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(nextYearLabel, String(schoolYear).trim());
    } catch (e) {
      setError(e?.message || "Failed to add annual examination");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-[fadeIn_0.15s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add annual examination"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-[popIn_0.15s_ease-out]"
      >
        <h2 className="text-lg font-bold text-gray-900">Add Annual Examination</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          Add a new annual examination year for this student. The year label
          is set to the next available year automatically.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Year Label
            </label>
            <select
              value={nextYearLabel}
              disabled
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none bg-gray-50"
            >
              <option value={nextYearLabel}>{nextYearLabel}</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              The next academic year this student doesn't have yet.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              School Year
            </label>
            <input
              type="text"
              placeholder="e.g. 2029-2030"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20 placeholder:text-gray-400"
            />
            {!schoolYearValid && schoolYear.trim() !== "" && (
              <p className="mt-1 text-xs text-red-600">
                Use the format YYYY-YYYY (e.g. 2029-2030).
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!schoolYearValid || submitting}
            className="flex-1 rounded-xl bg-gc-green py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes popIn {
            from { opacity: 0; transform: scale(0.95) translateY(4px) }
            to { opacity: 1; transform: scale(1) translateY(0) }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
