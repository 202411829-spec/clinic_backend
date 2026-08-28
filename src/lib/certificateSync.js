// src/lib/certificateSync.js
// Bridges the "Diagnosis and Final Remark" section on the Student Record
// page to the Medical Certificate form, so saving a diagnosis there
// auto-fills the certificate instead of the nurse re-typing it.
//
// This is a plain in-memory Map, not persisted storage — it only survives
// for the current browser tab/session (client-side route changes keep it
// alive, a full page reload clears it). That's fine for now since neither
// page is backed by a real database yet. TODO: once the Diagnosis and Final
// Remark fields are read from Supabase, drop this file and have the
// Medical Certificate read the same row directly instead.
const store = new Map();

const EMPTY_DEFAULTS = { diagnosis: "", finalRemark: "", normalFindingsChecked: false };

function keyFor(studentId, yearLabel) {
  if (yearLabel) return `${studentId}::${yearLabel}`;
  return String(studentId);
}

const YKEY_TO_LABEL = { y1: "Year I", y2: "Year II", y3: "Year III", y4: "Year IV" };
const LABEL_TO_YKEY = Object.fromEntries(Object.entries(YKEY_TO_LABEL).map(([k, v]) => [v, k]));

function yearVariants(yearLabel) {
  if (!yearLabel) return [];
  const v = [String(yearLabel)];
  if (YKEY_TO_LABEL[yearLabel]) v.push(YKEY_TO_LABEL[yearLabel]);
  if (LABEL_TO_YKEY[yearLabel]) v.push(LABEL_TO_YKEY[yearLabel]);
  // also handle full academicYears label like "Year I (2025 - 2026)" -> "Year I"
  const m = String(yearLabel).match(/^(Year\s+[IV]+)/);
  if (m && m[1] !== yearLabel) v.push(m[1]);
  if (m && LABEL_TO_YKEY[m[1]]) v.push(LABEL_TO_YKEY[m[1]]);
  return [...new Set(v)];
}

/** Called when the nurse clicks "Save Record" on the Diagnosis and Final
 *  Remark section of the Student Record page. */
export function saveCertificateDefaults(studentId, { diagnosis, finalRemark, normalFindingsChecked, yearLabel }) {
  if (yearLabel) {
    const payload = { diagnosis, finalRemark, normalFindingsChecked };
    for (const variant of yearVariants(yearLabel)) {
      store.set(keyFor(studentId, variant), payload);
    }
    return;
  }
  store.set(keyFor(studentId), { diagnosis, finalRemark, normalFindingsChecked });
}

/** Read by the Medical Certificate form on mount to pre-fill Diagnosis,
 *  Final Remark, and the "Essentially normal findings" checkbox. The nurse
 *  can still edit any of these on the certificate itself afterward. */
export function getCertificateDefaults(studentId, yearLabel) {
  if (yearLabel) {
    for (const variant of yearVariants(yearLabel)) {
      const hit = store.get(keyFor(studentId, variant));
      if (hit) return hit;
    }
    return EMPTY_DEFAULTS;
  }
  // backward fallback: caller omitted yearLabel (legacy call) -> try generic key
  return store.get(keyFor(studentId)) ?? EMPTY_DEFAULTS;
}
