// src/lib/recordDate.js
// ISO string <-> Date helpers for medical-record date fields. Parsing with
// `new Date(value)` would shift the day in negative UTC offsets, so build the
// Date from explicit Y/M/D parts in local time instead.

import { toYMD } from "./calendar.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO string or Date -> local Date, or null when empty/invalid. */
export function parseRecordDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = String(value ?? "").trim().match(ISO_DATE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Date -> "YYYY-MM-DD"; empty/invalid values become "". */
export function formatRecordDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : parseRecordDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return toYMD(date);
}

/** "YYYY-MM-DD" -> "MM/DD/YYYY" for the trigger label. */
export function formatRecordDateLabel(value) {
  const date = parseRecordDate(value);
  if (!date) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}
