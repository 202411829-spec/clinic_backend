// src/components/student/SelectTimeSlots.jsx
import NavIcon from "../ui/NavIcon";
import { remainingSlots, isSlotFull } from "../../lib/timeSlots";

function SlotBar({ slot }) {
  const full = isSlotFull(slot);
  const bookedPct = Math.min(100, Math.round((slot.booked / slot.capacity) * 100));

  return (
    <div className="h-1 w-full rounded-full bg-ink-100 overflow-hidden flex">
      <div
        className="bg-signal-rose transition-[width] duration-300 ease-smooth"
        style={{ width: `${full ? 100 : bookedPct}%` }}
      />
      {!full && (
        <div
          className="bg-gradient-to-r from-brand-600 to-brand-900 transition-[width] duration-300 ease-smooth"
          style={{ width: `${100 - bookedPct}%` }}
        />
      )}
    </div>
  );
}

function SlotBadge({ slot }) {
  const full = isSlotFull(slot);
  const badgeText = slot.booked + " / " + slot.capacity + " Booked";
  const bgClass = full ? "bg-signal-rose-bg text-signal-rose" : "bg-brand-50 text-brand-800";
  const classNames = ["text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap", bgClass].join(" ");
  return (
    <span className={classNames}>
      {badgeText}
    </span>
  );
}

function SlotAvailabilityLabel({ slot }) {
  const remaining = remainingSlots(slot);
  const full = remaining <= 0;

  let labelClass;
  if (full) {
    labelClass = "text-signal-rose";
  } else if (remaining <= 2) {
    labelClass = "text-signal-rose";
  } else {
    labelClass = "text-ink-400";
  }

  const classNames = ["text-[11px] font-bold whitespace-nowrap", labelClass].join(" ");
  return (
    <span className={classNames}>
      {full ? "Full" : remaining + " Slot" + (remaining === 1 ? "" : "s") + " Left"}
    </span>
  );
}

/**
 * slots: [{ id, time, capacity, booked }]
 * selectedTime: string | null (matches a slot.time)
 * onSelectTime: (time: string) => void
 * status: "loading" | "error" | "ready" (optional)
 * errorMessage: string (optional, for error state)
 */
export default function SelectTimeSlots({ slots, selectedTime, onSelectTime, status = "ready", errorMessage }) {
  // Loading state
  if (status === "loading") {
    return (
      <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
        <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600/25 border-t-brand-600" />
          <p className="text-sm text-ink-500">Loading available time slots...</p>
        </div>
      </section>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
        <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <NavIcon name="alert-triangle" className="h-8 w-8 text-signal-rose" />
          <p className="text-sm font-medium text-signal-rose">{errorMessage || "Couldn't load time slots."}</p>
          <p className="text-xs text-ink-400">Please try again later.</p>
        </div>
      </section>
    );
  }

  // Empty state
  if (!slots || slots.length === 0) {
    return (
      <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
        <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <NavIcon name="calendar-x" className="h-8 w-8 text-ink-400" />
          <p className="text-sm font-medium text-ink-600">
            The clinic is closed on this date or no time slots are configured.
          </p>
        </div>
      </section>
    );
  }

  // Ready state with slots
  return (
    <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
      <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
        Select Time
      </h2>

      <div className="mb-4 flex items-center gap-2 rounded-control border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700">
        <NavIcon name="clock" className="h-4 w-4 shrink-0 text-brand-600" />
        <span className={selectedTime ? "" : "font-normal text-ink-400"}>
          {selectedTime || "Select a time slot"}
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {/* Bounded per-page list, so a one-time staggered entrance stays
            cheap — transform/opacity only. */}
        {slots.map((slot, i) => {
          const full = isSlotFull(slot);
          const selected = selectedTime === slot.time;

          const btnClass = [
            "btn-press w-full animate-fade-in-up rounded-card border px-3.5 py-3 text-left transition-all duration-200 motion-reduce:animate-none disabled:active:scale-100",
            full
              ? "cursor-not-allowed border-ink-100 bg-ink-50 opacity-70"
              : selected
              ? "cursor-pointer border-brand-600 bg-brand-50 shadow-e1 ring-1 ring-brand-600/30"
              : "cursor-pointer border-ink-200 hover:border-brand-600/50 hover:bg-brand-50/40",
          ].join(" ");

          return (
            <button
              key={slot.id}
              type="button"
              disabled={full}
              onClick={() => onSelectTime(slot.time)}
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              className={btnClass}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
                <span className="whitespace-nowrap text-sm font-semibold text-ink-900">
                  {slot.time}
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <SlotBadge slot={slot} />
                  <SlotAvailabilityLabel slot={slot} />
                </div>
              </div>
              <SlotBar slot={slot} />
            </button>
          );
        })}
      </div>
    </section>
  );
}