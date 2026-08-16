// src/lib/timeSlots.js
// Pure helpers for the Student "Select Time" panel. Produces the same
// { id, time, capacity } shape used by the admin Clinic Schedule blocks
// (see lib/schedule.js), plus a `booked` count so the UI can show
// "X / Y Booked" and disable full slots.
//
// TODO: replace generateDaySlots() with a real Supabase query
// (appointments booked for the selected date, grouped by time block)
// once the backend endpoint is ready. The component only cares about
// the { id, time, capacity, booked } shape, so swapping this out is a
// drop-in change — no UI changes needed.

const DAY_BLOCKS = [
  { id: "block-1", time: "8:00 AM - 9:00 AM" },
  { id: "block-2", time: "9:00 AM - 10:00 AM" },
  { id: "block-3", time: "10:00 AM - 11:00 AM" },
  { id: "block-4", time: "1:00 PM - 2:00 PM" },
  { id: "block-5", time: "2:00 PM - 3:00 PM" },
];

const CAPACITY_PER_BLOCK = 10;

/** Small deterministic PRNG so the same date always shows the same demo availability. */
function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function dateSeed(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * date: Date
 * returns: [{ id, time, capacity, booked }]
 */
export function generateDaySlots(date) {
  const baseSeed = dateSeed(date);
  return DAY_BLOCKS.map((block, i) => {
    const r = seededRandom(baseSeed + i * 97);
    // Bias toward "mostly booked" so the near-full / full states are visible,
    // matching the mockup (8/10, 10/10, 5/10, 10/10).
    const booked = Math.min(
      CAPACITY_PER_BLOCK,
      Math.round(r * (CAPACITY_PER_BLOCK + 3))
    );
    return { ...block, capacity: CAPACITY_PER_BLOCK, booked };
  });
}

export function remainingSlots(slot) {
  return Math.max(0, slot.capacity - slot.booked);
}

export function isSlotFull(slot) {
  return remainingSlots(slot) <= 0;
}
