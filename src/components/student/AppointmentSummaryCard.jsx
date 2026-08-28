// src/components/student/AppointmentSummaryCard.jsx
import { formatMDY } from "../../lib/calendar";

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs font-semibold text-gray-400 shrink-0">{label}</span>
      <span
        className={[
          "text-sm font-semibold text-right",
          value ? "text-gray-800" : "text-gray-300",
        ].join(" ")}
      >
        {value || "—"}
      </span>
    </div>
  );
}

/**
 * date: Date
 * time: string | null
 * reason: string
 * onBook: () => void
 * booking: boolean — true while the (simulated) booking request is in flight
 * actionLabel: string — button text when idle, e.g. "Book" or "Confirm Reschedule"
 * loadingLabel: string — button text while `booking` is true
 */
export default function AppointmentSummaryCard({
  date,
  time,
  reason,
  onBook,
  booking,
  actionLabel = "Book",
  loadingLabel = "Booking…",
  disabled = false,
  disabledReason = "",
}) {
  const canBook = Boolean(date && time && reason) && !booking && !disabled;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <div className="border-l-4 border-gc-accent pl-3 mb-3">
        <h2 className="font-bold text-gray-800 text-xs md:text-sm tracking-wide">
          APPOINTMENT SUMMARY
        </h2>
      </div>

      <div className="divide-y divide-gray-100">
        <SummaryRow label="Date" value={date ? formatMDY(date) : ""} />
        <SummaryRow label="Time" value={time} />
        <SummaryRow label="Reason" value={reason} />
      </div>

      {disabled && disabledReason && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        disabled={!canBook}
        onClick={onBook}
        className={[
          "w-full mt-4 rounded-lg py-2.5 text-sm font-bold transition-colors",
          canBook
            ? "bg-gc-green text-white hover:bg-gc-green-600"
            : "bg-gray-200 text-gray-400 cursor-not-allowed",
        ].join(" ")}
      >
        {booking ? loadingLabel : actionLabel}
      </button>
    </section>
  );
}
