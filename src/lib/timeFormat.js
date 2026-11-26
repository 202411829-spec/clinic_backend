const TWENTY_FOUR_HOUR_PATTERN = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/;
const TWELVE_HOUR_PATTERN = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*$/i;
const RANGE_SEPARATOR_PATTERN = /\s*(?:–|—|-|\bto\b)\s*/i;

function normalizeTwelveHour(hour, minute, period) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 1 || h > 12) return "";
  if (!Number.isInteger(m) || m < 0 || m > 59) return "";
  return `${h}:${String(m).padStart(2, "0")} ${period.toUpperCase()}M`;
}

export function formatTime12Hour(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";

  const twelveHour = text.match(TWELVE_HOUR_PATTERN);
  if (twelveHour) {
    return normalizeTwelveHour(twelveHour[1], twelveHour[2], twelveHour[3]);
  }

  const twentyFourHour = text.match(TWENTY_FOUR_HOUR_PATTERN);
  if (!twentyFourHour) return "";

  const h = Number(twentyFourHour[1]);
  const m = Number(twentyFourHour[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return "";
  if (!Number.isInteger(m) || m < 0 || m > 59) return "";

  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatTimeRange(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";

  const parts = text.split(RANGE_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length === 2) {
    const start = formatTime12Hour(parts[0]);
    const end = formatTime12Hour(parts[1]);
    return start && end ? `${start} – ${end}` : text;
  }

  return formatTime12Hour(text) || text;
}
