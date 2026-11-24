// src/lib/profileCompleteness.js
// Derived "complete-your-record" check for the student portal.
//
// Completeness is deliberately derived from persistent backend fields: every
// required profile field, an emergency contact, and a non-null
// `data_privacy_consented_at` timestamp written only after the student's
// explicit final submission. The consent checkbox itself is not the source
// of truth; the persisted timestamp is.
//
// Consumed with the record data shape returned by
// recordsApi.medicalSummary() and by the updateProfile() PATCH echo:
//   { profile: {...student_masterlist row...}, emergency_contact: {...} | null }
//
// It also tolerates being passed a bare profile row, but that shape cannot
// prove an emergency contact exists, so it fails safe (incomplete).

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

// Persistent profile fields that must be filled for the gate to lift.
// gender/birth_date/civil_status/contact_number/present_address come from the
// masterlist view; department_id/course_id confirm the student picked their
// academic program in the edit form.
const REQUIRED_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "gender",
  "birth_date",
  "civil_status",
  "contact_number",
  "present_address",
  "department_id",
  "course_id",
  "data_privacy_consented_at",
];

function hasEmergencyContact(data) {
  const ec = data?.emergency_contact ?? data?.emergencyContact ?? null;
  return Boolean(ec) && typeof ec === "object" && !Array.isArray(ec);
}

export function isStudentProfileComplete(recordData) {
  const profile = recordData?.profile ?? recordData ?? null;
  if (!profile) return false;
  if (!REQUIRED_PROFILE_FIELDS.every((key) => isFilled(profile[key]))) {
    return false;
  }
  return hasEmergencyContact(recordData);
}