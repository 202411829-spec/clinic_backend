// src/lib/schedule.js
// Pure helper functions for the Clinic Schedule page. Turns working hours +
// break time + expected student count into a list of hour-long time blocks,
// each sized so that (number of blocks * slots per block) covers everyone.

/** "08:00" (24h, from <input type="time">) -> 480 (minutes since midnight) */
export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** 570 -> "9:30 AM" */
export function formatClock(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const BLOCK_LENGTH_MIN = 60;

/**
 * Builds the ordered list of working segments (start/end, in minutes),
 * skipping the break window entirely.
 */
function getWorkingSegments({ workStart, workEnd, breakStart, breakEnd }) {
  const ws = toMinutes(workStart);
  const we = toMinutes(workEnd);
  const bs = toMinutes(breakStart);
  const be = toMinutes(breakEnd);

  if (ws == null || we == null || we <= ws) return [];

  // No valid break window -> the whole working day is one segment.
  if (bs == null || be == null || be <= bs || bs < ws || be > we) {
    return [[ws, we]];
  }

  const segments = [];
  if (bs > ws) segments.push([ws, bs]);
  if (we > be) segments.push([be, we]);
  return segments;
}

/**
 * Generates 1-hour time blocks across the working day (minus break),
 * then sizes each block's capacity so the blocks together cover
 * `numStudents`. Returns { numBlocks, slotsPerBlock, blocks }.
 */
export function generateTimeBlocks({
  workStart,
  workEnd,
  breakStart,
  breakEnd,
  numStudents,
}) {
  const segments = getWorkingSegments({ workStart, workEnd, breakStart, breakEnd });

  const blockRanges = [];
  segments.forEach(([segStart, segEnd]) => {
    let cursor = segStart;
    while (cursor + BLOCK_LENGTH_MIN <= segEnd) {
      blockRanges.push([cursor, cursor + BLOCK_LENGTH_MIN]);
      cursor += BLOCK_LENGTH_MIN;
    }
  });

  const numBlocks = blockRanges.length;
  const students = Math.max(0, Number(numStudents) || 0);
  const slotsPerBlock = numBlocks > 0 ? Math.max(1, Math.ceil(students / numBlocks)) : 0;

  const blocks = blockRanges.map(([start, end], i) => ({
    id: `block-${i + 1}`,
    time: `${formatClock(start)} - ${formatClock(end)}`,
    capacity: slotsPerBlock,
  }));

  return { numBlocks, slotsPerBlock, blocks };
}
