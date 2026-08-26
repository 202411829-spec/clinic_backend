// src/components/student/SelectTimeSlots.jsx
import NavIcon from "../admin/NavIcon";
import { remainingSlots, isSlotFull } from "../../lib/timeSlots";

function SlotBar({ slot }) {
  const full = isSlotFull(slot);
  const bookedPct = Math.min(100, Math.round((slot.booked / slot.capacity) * 100));

  return (
    <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden flex">
      <div
        className={full ? "bg-red-500" : "bg-gc-green"}
        style={{ width: `${full ? 100 : bookedPct}%` }}
      />
      {!full && (
        <div className="bg-red-400" style={{ width: `${100 - bookedPct}%` }} />
      )}
    </div>
  );
}

function SlotBadge({ slot }) {
  const full = isSlotFull(slot);
  return (
    <span
      className={[
        "text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap",
        full ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700",
      ].join(" ")}
    >
      {slot.booked} / {slot.capacity} Booked
    </span>
  );
}

function SlotAvailabilityLabel({ slot }) {
  const remaining = remainingSlots(slot);
  const full = remaining <= 0;

  return (
    <span
      className={[
        "text-[11px] font-bold whitespace-nowrap",
        full ? "text-red-600" : remaining <= 2 ? "text-red-500" : "text-gray-400",
      ].join(" ")}
    >
      {full ? "Full" : `${remaining} Slot${remaining === 1 ? "" : "s"} Left`}
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
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
        <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-8 h-8 border-4 border-gc-accent/30 border-t-gc-accent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading available time slots…</p>
        </div>
      </section>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
        <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <NavIcon name="alert-triangle" className="w-8 h-8 text-red-500" />
          <p className="text-sm text-red-600 font-medium">{errorMessage || "Couldn't load time slots."}</p>
          <p className="text-xs text-gray-400">Please try again later.</p>
        </div>
      </section>
    );
  }

  // Empty state
  if (!slots || slots.length === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
        <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
          Select Time
        </h2>
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <NavIcon name="calendar-x" className="w-8 h-8 text-gray-400" />
          <p className="text-sm text-gray-600 font-medium">
            The clinic is closed on this date or no time slots are configured.
          </p>
        </div>
      </section>
    );
  }

  // Ready state with slots
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        Select Time
      </h2>

      <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 mb-4">
        <NavIcon name="clock" className="w-4 h-4 text-gc-green shrink-0" />
        <span className={selectedTime ? "" : "text-gray-400 font-normal"}>
          {selectedTime || "Select a time slot"}
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {slots.map((slot) => {
          const full = isSlotFull(slot);
          const selected = selectedTime === slot.time;

          return (
            <button
              key={slot.id}
              type="button"
              disabled={full}
              onClick={() => onSelectTime(slot.time)}
              className={[
                "w-full text-left rounded-xl border px-3.5 py-3 transition-colors",
                full
                  ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-70"
                  : selected
                  ? "border-gc-accent bg-gc-accent/5 cursor-pointer"
                  : "border-gray-200 hover:border-gc-accent/50 cursor-pointer",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
                <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
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
