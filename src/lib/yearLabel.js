// src/lib/yearLabel.js
// Helpers for dynamic academic-year labels ("Year I".."Year IV", then
// "Year V", "Year VI", ... or "Year 5", "Year 6", ...).

const ROMAN_VALS = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function romanToInt(s) {
  if (!s) return 0;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALS[s[i]];
    const next = ROMAN_VALS[s[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

export function intToRoman(num) {
  const map = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [val, sym] of map) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out;
}

/** "Year I" -> 1, "Year V" -> 5, "Year 5" -> 5; null when unparseable. */
export function yearIndexFromLabel(label) {
  if (!label) return null;
  const m = String(label).match(/^Year\s+([IVXLCDM]+|[0-9]+)$/i);
  if (!m) return null;
  const part = m[1].toUpperCase();
  if (/^[0-9]+$/.test(part)) return parseInt(part, 10);
  return romanToInt(part);
}

export function formatYearLabel(index) {
  return `Year ${intToRoman(index)}`;
}
