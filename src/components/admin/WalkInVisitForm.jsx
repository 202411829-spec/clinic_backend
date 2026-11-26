// src/components/admin/WalkInVisitForm.jsx
// Shared "Add Walk-in Visit" form used by both the dashboard Logbook
// widget (LogbookPanel) and the standalone Logbook page (LogbookFullPanel).
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { isMedicalCertificateReason } from "../../lib/walkInForm.js";

export default function WalkInVisitForm({
  regId, setRegId,
  reasonId, reasonRecords = [], handleReasonChange,
  lastName, setLastName,
  firstName, setFirstName,
  middleInitial, setMiddleInitial,
  suffix, setSuffix,
  complaint, setComplaint,
  medicineInput, setMedicineInput,
  quantity, setQuantity,
  medTags, walkInError, setWalkInError,
  isSubmitting,
  handleAddMedicine, handleAddWalkIn, handleClose,
}) {
  const clearError = () => {
    if (walkInError) setWalkInError(null);
  };

  // Medical Certificate visits are administrative only. This is computed on
  // every render, so changing Reason immediately enables/disables the fields.
  const clinicalFieldsDisabled = isMedicalCertificateReason(reasonId, reasonRecords);

  const inputClass =
    "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent";
  const disabledClass = clinicalFieldsDisabled
    ? " disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
    : "";

  return (
    <div className="mt-4 pt-4 border-t-2 border-gray-300 print:hidden animate-fade-in-up motion-reduce:animate-none">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-800">Add Walk-in Visit</h2>
        <button
          onClick={handleClose}
          aria-label="Close"
          className="btn-press w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <span aria-hidden className="text-base leading-none">&times;</span>
        </button>
      </div>

      {walkInError && (
        <p className="mb-3 text-sm font-semibold text-red-600 animate-fade-in-up">{walkInError}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">
            ID / Registration Number
          </label>
          <input
            value={regId}
            onChange={(e) => { setRegId(e.target.value); clearError(); }}
            placeholder="Student ID"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500" aria-required="true">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); clearError(); }}
            placeholder="Last Name"
            aria-required="true"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500" aria-required="true">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); clearError(); }}
            placeholder="First Name"
            aria-required="true"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Middle Initial</label>
          <input
            value={middleInitial}
            onChange={(e) => { setMiddleInitial(e.target.value); clearError(); }}
            placeholder="Middle Initial"
            maxLength={1}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">Suffix</label>
          <input
            value={suffix}
            onChange={(e) => { setSuffix(e.target.value); clearError(); }}
            placeholder="Suffix"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500" aria-required="true">
            Reason <span className="text-red-500">*</span>
          </label>
          <UniversalDropdown
            value={reasonId}
            onChange={handleReasonChange}
            options={reasonRecords.map((r) => ({
              value: String(r.reason_id),
              label: r.description,
            }))}
            placeholder="Select Reason"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Complaint</label>
          <input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            disabled={clinicalFieldsDisabled}
            placeholder="E.g. Headache"
            className={inputClass + disabledClass}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Medicine</label>
          <input
            value={medicineInput}
            onChange={(e) => setMedicineInput(e.target.value)}
            disabled={clinicalFieldsDisabled}
            placeholder="E.g. Paracetamol"
            className={inputClass + disabledClass}
          />
          {medTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {medTags.map((tag, i) => (
                <span
                  key={`${tag.name}-${tag.quantity}-${i}`}
                  className="text-xs font-medium bg-gc-accent/10 text-gc-accent px-3 py-1.5 rounded-full animate-pop-in"
                >
                  {tag.name} x{tag.quantity}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-start-4">
          <label className="text-xs font-semibold text-gray-500">Quantity</label>
          <div className="mt-1 flex gap-1.5">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={clinicalFieldsDisabled}
              type="number"
              min="1"
              placeholder="1"
              className={
                "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent" +
                disabledClass
              }
            />
            <button
              onClick={handleAddMedicine}
              disabled={clinicalFieldsDisabled || isSubmitting}
              className="btn-press shrink-0 text-xs font-semibold bg-gc-accent text-white px-3 py-2 rounded-lg hover:opacity-90 whitespace-nowrap disabled:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse md:flex-row md:justify-end gap-2">
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          className="btn-press text-sm font-semibold text-gray-600 border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={handleAddWalkIn}
          disabled={isSubmitting}
          className="btn-press text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving…" : "+ Add Walk-in Visit"}
        </button>
      </div>
    </div>
  );
}
