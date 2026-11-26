// src/lib/adminProfile.js
// Shared Admin Profile validation/patch rules. Mirrors Admin Signup's name
// fields so Profile edits cannot bypass the same validation or normalization.
import {
  formatAdminMiddleInitial,
  isValidAdminMiddleInitial,
} from "./format.js";

export const ADMIN_PROFILE_SUFFIX_MAX = 20;

export function validateAdminProfile(form = {}) {
  if (!String(form.last_name ?? "").trim()) return "Last name is required.";
  if (!String(form.first_name ?? "").trim()) return "First name is required.";
  if (!isValidAdminMiddleInitial(form.middle_initial ?? "")) {
    return "Middle initial must be a single letter, optionally followed by a period.";
  }
  if (String(form.suffix ?? "").trim().length > ADMIN_PROFILE_SUFFIX_MAX) {
    return `Suffix must be ${ADMIN_PROFILE_SUFFIX_MAX} characters or fewer.`;
  }
  return "";
}

// Only send fields that changed. Omitted/unchanged optional values are never
// written back as blanks, so legacy null middle initials/suffixes survive.
export function buildAdminProfilePatch(form = {}, original = {}) {
  const patch = {
    first_name: String(form.first_name ?? "").trim(),
    last_name: String(form.last_name ?? "").trim(),
    license_no: String(form.license_no ?? "").trim(),
  };

  const nextMiddle = formatAdminMiddleInitial(form.middle_initial ?? "");
  const currentMiddle = formatAdminMiddleInitial(original.middle_initial ?? "");
  if (nextMiddle !== currentMiddle) patch.middle_initial = nextMiddle;

  const nextSuffix = String(form.suffix ?? "").trim();
  const currentSuffix = String(original.suffix ?? "").trim();
  if (nextSuffix !== currentSuffix) patch.suffix = nextSuffix;

  return patch;
}
