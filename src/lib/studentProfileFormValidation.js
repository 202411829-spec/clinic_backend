// Pure validation rules for the 3-step Student Profile edit flow.
// Kept separate from the JSX so every step and the final submit can share one
// source of truth, and so the rules can be unit-tested directly.

import {
  hasStructuredAddress,
  validateAddressFields,
} from "./philippineAddress.js";

export const STRUCTURED_NAME_KEYS = ["firstName", "middleName", "lastName", "suffix"];

export const STEP_LABELS = {
  1: "Personal Information",
  2: "Medical History",
  3: "Data Privacy",
};

export const STEP1_FIELD_LABELS = {
  lastName: "Last Name",
  firstName: "First Name",
  middleName: "Middle Initial",
  suffix: "Suffix",
  birthday: "Birthday",
  sex: "Sex",
  civilStatus: "Civil Status",
  contactNumber: "Contact Number",
  departmentId: "Department",
  courseId: "Course",
  emergencyName: "Emergency Contact Name",
  emergencyFirstName: "Emergency Contact First Name",
  emergencyLastName: "Emergency Contact Last Name",
  emergencyMiddleName: "Emergency Contact Middle Initial",
  emergencySuffix: "Emergency Contact Suffix",
  emergencyRelationship: "Emergency Contact Relationship",
  emergencyContactNumber: "Emergency Contact Number",
  emergencyPresentAddress: "Emergency Contact Address",
  addressRegion: "Student Address Region",
  addressProvince: "Student Address Province",
  addressCity: "Student Address City / Municipality",
  addressBarangay: "Student Address Barangay",
  addressStreet: "Student Address Street",
  addressHouseNumber: "Student Address House Number",
  emergencyAddressRegion: "Emergency Address Region",
  emergencyAddressProvince: "Emergency Address Province",
  emergencyAddressCity: "Emergency Address City / Municipality",
  emergencyAddressBarangay: "Emergency Address Barangay",
  emergencyAddressStreet: "Emergency Address Street",
  emergencyAddressHouseNumber: "Emergency Address House Number",
};

export const STEP2_FIELD_LABELS = {
  hadOperation: "Operation history (Yes / No)",
  operationNature: "Nature of Operation",
  operationDate: "Date of Operation",
};

export const STEP3_FIELD_LABELS = {
  consent: "Data privacy consent checkbox",
};

const MAX_NAME_PART = 200;
const MAX_INITIAL = 10;
const MAX_SUFFIX = 20;

const STRUCTURED_ADDRESS_KEYS = [
  "addressRegion",
  "addressProvince",
  "addressCity",
  "addressBarangay",
  "addressStreet",
];

function filled(value) {
  return String(value ?? "").trim() !== "";
}

export function hasStructuredName(parts = {}) {
  if (Object.prototype.hasOwnProperty.call(parts, "structuredName")) {
    return parts.structuredName === true;
  }
  return STRUCTURED_NAME_KEYS.some((key) => filled(parts[key]));
}

function requireFields(form, keys, errors) {
  keys.forEach((key) => {
    if (!filled(form?.[key])) errors[key] = true;
  });
}

function requireLength(form, limits, errors) {
  Object.entries(limits).forEach(([key, max]) => {
    if (String(form?.[key] ?? "").trim().length > max) errors[key] = true;
  });
}

// A required address needs the complete PSA cascade plus Street; House Number
// / Building / Lot stays optional. Optional blocks become required once the
// user touches any part, so a half-picked address never counts as complete.
export function validateStructuredAddress(form = {}, { required = false } = {}) {
  const errors = { ...validateAddressFields(form) };
  const used =
    required ||
    form.structuredAddressEdited === true ||
    STRUCTURED_ADDRESS_KEYS.some((key) => filled(form[key]));
  if (used) requireFields(form, STRUCTURED_ADDRESS_KEYS, errors);
  return errors;
}

function withAddressPrefix(errors, prefix) {
  const prefixed = {};
  Object.keys(errors).forEach((key) => {
    // `addressRegion` under the `emergencyAddress` prefix must become
    // `emergencyAddressRegion`, not `emergencyAddressAddressRegion`.
    const suffix = key.startsWith("address") ? key.slice("address".length) : key;
    prefixed[`${prefix}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`] = true;
  });
  return prefixed;
}

export function validateNameFields(form = {}) {
  const errors = {};
  requireLength(form, {
    firstName: MAX_NAME_PART,
    lastName: MAX_NAME_PART,
    middleName: MAX_INITIAL,
    suffix: MAX_SUFFIX,
  }, errors);

  const emergency = form.emergency || {};
  if (hasStructuredName(emergency)) {
    if (!filled(emergency.firstName)) errors.emergencyFirstName = true;
    if (!filled(emergency.lastName)) errors.emergencyLastName = true;
    if (String(emergency.firstName || "").trim().length > MAX_NAME_PART) errors.emergencyFirstName = true;
    if (String(emergency.lastName || "").trim().length > MAX_NAME_PART) errors.emergencyLastName = true;
    if (String(emergency.middleName || "").trim().length > MAX_INITIAL) errors.emergencyMiddleName = true;
    if (String(emergency.suffix || "").trim().length > MAX_SUFFIX) errors.emergencySuffix = true;
  }
  return errors;
}

export function validateStep1(form = {}) {
  const errors = validateNameFields(form);
  requireFields(form, [
    "lastName",
    "firstName",
    "birthday",
    "sex",
    "civilStatus",
    "contactNumber",
    "departmentId",
    "courseId",
  ], errors);

  // The student address is the required address: no legacy-text fallback may
  // satisfy it, and Street is mandatory now that the UI captures it.
  Object.assign(errors, validateStructuredAddress(form, { required: true }));

  const emergency = form.emergency || {};
  if (hasStructuredName(emergency)) {
    if (!filled(emergency.firstName)) errors.emergencyFirstName = true;
    if (!filled(emergency.lastName)) errors.emergencyLastName = true;
  } else if (!filled(emergency.name)) {
    errors.emergencyName = true;
  }
  if (!filled(emergency.relationship)) errors.emergencyRelationship = true;
  if (!filled(emergency.contactNumber)) errors.emergencyContactNumber = true;

  // The checkbox reuses the already-validated student address, so the
  // emergency block needs no duplicate entry. Otherwise it must be complete.
  if (emergency.sameAsStudentAddress !== true) {
    if (!hasStructuredAddress(emergency) && !filled(emergency.presentAddress)) {
      errors.emergencyPresentAddress = true;
    }
    Object.assign(
      errors,
      withAddressPrefix(
        validateStructuredAddress(emergency, { required: true }),
        "emergencyAddress"
      )
    );
  }

  return errors;
}

export function validateStep2(form = {}) {
  const errors = {};
  if (!filled(form.hadOperation)) errors.hadOperation = true;
  if (form.hadOperation === "Yes") {
    if (!filled(form.operationNature)) errors.operationNature = true;
    if (!filled(form.operationDate)) errors.operationDate = true;
  }
  return errors;
}

export function validateStep3(form = {}) {
  const errors = {};
  if (form.consent !== true) errors.consent = true;
  return errors;
}

export function errorLabels(labels, errors) {
  return Object.keys(labels)
    .filter((key) => Boolean(errors?.[key]))
    .map((key) => labels[key]);
}

export function getBlockingIssues(form = {}) {
  const checks = [
    { step: 1, errors: validateStep1(form), labels: STEP1_FIELD_LABELS },
    { step: 2, errors: validateStep2(form), labels: STEP2_FIELD_LABELS },
    { step: 3, errors: validateStep3(form), labels: STEP3_FIELD_LABELS },
  ];
  return checks
    .filter((check) => Object.keys(check.errors).length > 0)
    .map((check) => ({
      step: check.step,
      label: STEP_LABELS[check.step],
      fields: errorLabels(check.labels, check.errors),
    }));
}

export function formatBlockingIssues(issues = []) {
  return issues
    .map((issue) => `${issue.label}: ${issue.fields.join(", ")}`)
    .join("; ");
}
