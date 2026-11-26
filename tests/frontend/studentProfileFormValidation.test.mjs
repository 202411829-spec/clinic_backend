import test from "node:test";
import assert from "node:assert/strict";

import {
  errorLabels,
  formatBlockingIssues,
  getBlockingIssues,
  STEP1_FIELD_LABELS,
  STEP2_FIELD_LABELS,
  STEP3_FIELD_LABELS,
  validateStep1,
  validateStep2,
  validateStep3,
} from "../../src/lib/studentProfileFormValidation.js";

function completeForm() {
  return {
    firstName: "Juan",
    middleName: "D",
    lastName: "Cruz",
    suffix: "",
    birthday: "2004-05-20",
    sex: "Male",
    civilStatus: "Single",
    contactNumber: "09171234567",
    presentAddress: "123 Test St, Zambales",
    departmentId: "1",
    courseId: "2",
    addressRegion: "010000000000",
    addressProvince: "010100000000",
    addressCity: "010100100000",
    addressBarangay: "010100100001",
    addressStreet: "Rizal Street",
    addressHouseNumber: "",
    structuredAddressEdited: false,
    hadOperation: "No",
    operationNature: "",
    operationDate: "",
    conditions: [],
    allergySpecify: "",
    consent: true,
    emergency: {
      name: "Maria Cruz",
      firstName: "",
      middleName: "",
      lastName: "",
      suffix: "",
      structuredName: false,
      relationship: "Mother",
      contactNumber: "09181234567",
      presentAddress: "456 Test St, Zambales",
      addressRegion: "020000000000",
      addressProvince: "020100000000",
      addressCity: "020100100000",
      addressBarangay: "020100100001",
      addressStreet: "Rizal Street",
      addressHouseNumber: "",
      structuredAddressEdited: false,
      sameAsStudentAddress: false,
    },
  };
}

test("a complete form has no blocking issues", () => {
  const form = completeForm();
  assert.deepEqual(validateStep1(form), {});
  assert.deepEqual(validateStep2(form), {});
  assert.deepEqual(validateStep3(form), {});
  assert.deepEqual(getBlockingIssues(form), []);
});

test("step 1 reports every missing personal and emergency field", () => {
  const form = completeForm();
  Object.assign(form, {
    firstName: "",
    birthday: "",
    departmentId: "",
    courseId: "",
    emergency: {
      ...form.emergency,
      name: "",
      relationship: "",
      contactNumber: "",
      presentAddress: "",
      addressRegion: "",
      addressProvince: "",
      addressCity: "",
      addressBarangay: "",
      addressStreet: "",
    },
  });

  const errors = validateStep1(form);
  const fields = errorLabels(STEP1_FIELD_LABELS, errors);
  assert.deepEqual(fields, [
    "First Name",
    "Birthday",
    "Department",
    "Course",
    "Emergency Contact Name",
    "Emergency Contact Relationship",
    "Emergency Contact Number",
    "Emergency Contact Address",
    "Emergency Address Region",
    "Emergency Address Province",
    "Emergency Address City / Municipality",
    "Emergency Address Barangay",
    "Emergency Address Street",
  ]);
});

test("step 2 blocks operation details until nature and date are supplied", () => {
  const form = completeForm();
  form.hadOperation = "Yes";
  assert.deepEqual(
    errorLabels(STEP2_FIELD_LABELS, validateStep2(form)),
    ["Nature of Operation", "Date of Operation"]
  );

  form.operationNature = "Appendectomy";
  form.operationDate = "2020-02-03";
  assert.deepEqual(validateStep2(form), {});
});

test("step 3 blocks consent", () => {
  const form = completeForm();
  form.consent = false;
  assert.deepEqual(
    errorLabels(STEP3_FIELD_LABELS, validateStep3(form)),
    ["Data privacy consent checkbox"]
  );
});

test("final validation reports exact steps and fields across the form", () => {
  const form = completeForm();
  form.lastName = "";
  form.hadOperation = "Yes";
  form.consent = false;

  const issues = getBlockingIssues(form);
  assert.deepEqual(issues, [
    {
      step: 1,
      label: "Personal Information",
      fields: ["Last Name"],
    },
    {
      step: 2,
      label: "Medical History",
      fields: ["Nature of Operation", "Date of Operation"],
    },
    {
      step: 3,
      label: "Data Privacy",
      fields: ["Data privacy consent checkbox"],
    },
  ]);
  assert.equal(
    formatBlockingIssues(issues),
    "Personal Information: Last Name; Medical History: Nature of Operation, Date of Operation; Data Privacy: Data privacy consent checkbox"
  );
});

test("a partially selected structured address is incomplete", () => {
  const form = completeForm();
  form.addressRegion = "030000000000";
  form.addressProvince = "030700000000";
  form.addressCity = "";
  form.addressBarangay = "";
  form.structuredAddressEdited = true;

  const errors = validateStep1(form);
  assert.equal(errors.addressCity, true);
  assert.equal(errors.addressBarangay, true);

  form.addressCity = "030700100000";
  form.addressBarangay = "030700100001";
  assert.equal(validateStep1(form).addressCity, undefined);
  assert.equal(validateStep1(form).addressBarangay, undefined);
});

test("structured emergency names require first and last name", () => {
  const form = completeForm();
  form.emergency = {
    ...form.emergency,
    structuredName: true,
    firstName: "Maria",
    lastName: "",
  };

  const errors = validateStep1(form);
  assert.equal(errors.emergencyName, undefined);
  assert.equal(errors.emergencyFirstName, undefined);
  assert.equal(errors.emergencyLastName, true);
});

test("student address is always complete and Street is required", () => {
  const form = completeForm();
  form.addressStreet = "";

  const errors = validateStep1(form);
  assert.equal(errors.addressStreet, true);
  assert.equal(errors.presentAddress, undefined);

  form.addressStreet = "Rizal Street";
  form.addressBarangay = "";
  assert.equal(validateStep1(form).addressBarangay, true);
});

test("the derived legacy student address is not a separate visible requirement", () => {
  const form = completeForm();
  form.presentAddress = "";

  assert.deepEqual(validateStep1(form), {});
  assert.equal(STEP1_FIELD_LABELS.presentAddress, undefined);
});

test("unchecked emergency address requires the full cascade including Street", () => {
  const form = completeForm();
  form.emergency.addressStreet = "";

  const errors = validateStep1(form);
  assert.equal(errors.emergencyAddressStreet, true);
  assert.equal(errors.emergencyAddressHouseNumber, undefined);
});

test("same-as-student address skips duplicate emergency address requirements", () => {
  const form = completeForm();
  Object.assign(form.emergency, {
    sameAsStudentAddress: true,
    presentAddress: "",
    addressRegion: "",
    addressProvince: "",
    addressCity: "",
    addressBarangay: "",
    addressStreet: "",
  });

  assert.deepEqual(validateStep1(form), {});

  form.addressStreet = "";
  const errors = validateStep1(form);
  assert.equal(errors.addressStreet, true);
  assert.equal(
    Object.keys(errors).some((key) => key.startsWith("emergencyAddress")),
    false
  );
});
