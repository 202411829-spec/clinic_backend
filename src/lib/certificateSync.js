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

/** Called when the nurse clicks "Save Record" on the Diagnosis and Final
 *  Remark section of the Student Record page. */
export function saveCertificateDefaults(studentId, { diagnosis, finalRemark, normalFindingsChecked }) {
  store.set(studentId, { diagnosis, finalRemark, normalFindingsChecked });
}

/** Read by the Medical Certificate form on mount to pre-fill Diagnosis,
 *  Final Remark, and the "Essentially normal findings" checkbox. The nurse
 *  can still edit any of these on the certificate itself afterward. */
export function getCertificateDefaults(studentId) {
  return store.get(studentId) ?? EMPTY_DEFAULTS;
}
