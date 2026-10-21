// src/components/student/AppointmentSummaryCard.jsx
import { formatMDY } from "../../lib/calendar";

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <span
        className={[
          "cell-wrap text-right text-sm font-medium",
          value ? "text-ink-900" : "text-ink-300",
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
    <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
      <div className="mb-3 border-l-4 border-brand-600 pl-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-900">
          Appointment summary
        </h2>
      </div>

      <div className="divide-y divide-ink-100">
        <SummaryRow label="Date" value={date ? formatMDY(date) : ""} />
        <SummaryRow label="Time" value={time} />
        <SummaryRow label="Reason" value={reason} />
      </div>

      {disabled && disabledReason && (
        <p className="mt-3 rounded-control border border-signal-amber-ring bg-signal-amber-bg px-3 py-2 text-xs text-signal-amber animate-fade-in-up motion-reduce:animate-none">
          {disabledReason}
        </p>
      )}
      <button
        type="button"
        disabled={!canBook}
        onClick={onBook}
        className={[
          "btn btn-press mt-4 w-full py-2.5 font-semibold transition-colors disabled:active:scale-100",
          canBook
            ? "bg-brand-900 text-white shadow-e1 hover:bg-brand-800"
            : "bg-ink-100 text-ink-400 cursor-not-allowed",
        ].join(" ")}
      >
        {booking ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            {loadingLabel}
          </span>
        ) : (
          actionLabel
        )}
      </button>
    </section>
  );
}
