// Pure date helpers for the shared GC-RFB date-range picker.
// All dates use local Date objects and ISO YYYY-MM-DD strings, matching the
// existing clinic calendar helpers. No external date library is introduced.

const pad = (value) => String(value).padStart(2, "0");

export const EMPTY_RANGE = Object.freeze({ from: "", to: "" });

export function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  // Date(year, ...) maps 0-99 to 1900-1999, while Academic Timeline accepts
  // year 0, so setFullYear keeps the parsed identity exact.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function sameDay(left, right) {
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function addMonths(date, amount) {
  const next = new Date(0);
  next.setFullYear(date.getFullYear(), date.getMonth() + amount, 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function getMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatDateLabel(iso, fallback = "") {
  const date = parseISODate(iso);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : fallback;
}

export function formatRangeLabel(value, placeholder = "All dates") {
  const from = value?.from || "";
  const to = value?.to || "";
  if (from && to) return `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
  if (from) return `From ${formatDateLabel(from)}`;
  if (to) return `Until ${formatDateLabel(to)}`;
  return placeholder;
}

export function getCalendarDays(viewDate) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function isDateDisabled(day, { minDate, maxDate, disabled } = {}) {
  if (!day) return true;
  if (disabled === true) return true;
  const date = startOfDay(day);
  const min = parseISODate(minDate);
  const max = parseISODate(maxDate);
  if (min && date < startOfDay(min)) return true;
  if (max && date > startOfDay(max)) return true;
  if (typeof disabled === "function") return Boolean(disabled(date, toISODate(date)));
  return false;
}

export function pickRangeDate(value, iso) {
  const currentFrom = value?.from || "";
  const currentTo = value?.to || "";

  if (!currentFrom || (currentFrom && currentTo)) return { from: iso, to: "" };
  if (iso < currentFrom) return { from: iso, to: currentFrom };
  return { from: currentFrom, to: iso };
}

export function getRangePreview(value, hoverISO = "") {
  const fromISO = value?.from || "";
  const toISO = value?.to || "";
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  const hover = parseISODate(hoverISO);

  if (from && !to && hover) {
    const start = hover < from ? hover : from;
    const end = hover < from ? from : hover;
    return { start: toISODate(start), end: toISODate(end), isPreview: true };
  }

  if (from && to && to < from) {
    return { start: toISO, end: fromISO, isPreview: false };
  }

  return {
    start: fromISO,
    end: toISO,
    isPreview: false,
  };
}

export function moveFocusISO(iso, deltaDays, disabledOptions = {}) {
  let current = parseISODate(iso);
  if (!current) return "";

  for (let step = 0; step < 400; step += 1) {
    current = new Date(current);
    current.setDate(current.getDate() + deltaDays);
    if (!isDateDisabled(current, disabledOptions)) return toISODate(current);
  }

  return "";
}
