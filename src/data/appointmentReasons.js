// src/data/appointmentReasons.js
// Static fallback for the "Select Reason" dropdown on the Student Book page.
// LIVE data comes from GET /reasons (appointment_reasons table); this file
// mirrors the canonical seed (migrations/2026-08-28_clean_seed.sql) exactly.

export const appointmentReasons = [
  "Medical Certificate",
  "Consultation",
];
