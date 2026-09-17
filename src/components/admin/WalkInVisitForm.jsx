// src/components/admin/WalkInVisitForm.jsx
// Shared "Add Walk-in Visit" form used by both the dashboard Logbook
// widget (LogbookPanel) and the standalone Logbook page (LogbookFullPanel).
import UniversalDropdown from "../ui/UniversalDropdown.jsx";

export default function WalkInVisitForm({
  regId, setRegId,
  walkInName, setWalkInName,
  walkInReasonId, setWalkInReasonId,
  complaint, setComplaint,
  medicineInput, setMedicineInput,
  quantity, setQuantity,
  medTags, walkInError, setWalkInError,
  isSubmitting,
  handleAddMedicine, handleAddWalkIn, handleClose,
  reasonRecords,
}) {
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

      {/* Row 1: the four short text/select fields, evenly spaced. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">
            ID / Registration Number
          </label>
          <input
            value={regId}
            onChange={(e) => { setRegId(e.target.value); if (walkInError) setWalkInError(null); }}
            placeholder="Student ID"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Patient Name</label>
          <input
            value={walkInName}
            onChange={(e) => { setWalkInName(e.target.value); if (walkInError) setWalkInError(null); }}
            placeholder="Full name (required if not registered)"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Reason</label>
          <UniversalDropdown
            value={walkInReasonId}
            onChange={setWalkInReasonId}
            options={reasonRecords.map((r) => ({ value: String(r.reason_id), label: r.description }))}
            placeholder="Select Reason"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Complaint</label>
          <input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="E.g. Headache"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
          />
        </div>
      </div>

      {/* Row 2: Medicine + Quantity now sit in the same column positions
          as ID and Patient Name in row 1 above (col 1 and col 2 of the
          same 4-column grid), so their boxes line up edge-to-edge with
          those two fields instead of using a different width split. */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">Medicine</label>
          <input
            value={medicineInput}
            onChange={(e) => setMedicineInput(e.target.value)}
            placeholder="E.g. Paracetamol"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
          />
          {medTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {medTags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs font-medium bg-gc-accent/10 text-gc-accent px-3 py-1.5 rounded-full animate-pop-in"
                >
                  {tag.name} x{tag.quantity}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Quantity</label>
          <div className="mt-1 flex gap-1.5">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              min="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
            />
            <button
              onClick={handleAddMedicine}
              className="btn-press shrink-0 text-xs font-semibold bg-gc-accent text-white px-3 py-2 rounded-lg hover:opacity-90 whitespace-nowrap"
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
