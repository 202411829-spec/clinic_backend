// src/components/student/EditStudentInfoModal.jsx
// 3-step "Edit Student Information" dialog opened from the Edit button on
// the Student Record page — 1:1 with the Personal Information / Medical
// History / Data Privacy mockups. Frontend-only for now: onSave hands back
// a full student record shaped like masterlistSample so the parent panel
// can update its local state. Swap the fake submit for a real Supabase
// write once that's wired up.
import { useEffect, useRef, useState } from "react";
import NavIcon from "../ui/NavIcon.jsx";
import { computeAge } from "../../data/studentRecordSample.js";
import { departmentOptions, courseOptionsByDept } from "../../data/masterlistSample.js";
import { masterlistApi } from "../../lib/api.js";
import { buildSafeProfilePatch } from "../../lib/studentProfileEditPayload.js";
import {
  errorLabels,
  getBlockingIssues,
  hasStructuredName,
  STEP1_FIELD_LABELS,
  STEP2_FIELD_LABELS,
  STRUCTURED_NAME_KEYS,
  validateStep1,
  validateStep2,
} from "../../lib/studentProfileFormValidation.js";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import AnimatedCheckbox from "../ui/AnimatedCheckbox.jsx";
import {
  buildAddressPatch,
  formatStructuredAddress,
  getBarangayOptions,
  getCityOptions,
  getProvinceOptions,
  getRegionOptions,
  updateAddressField,
} from "../../lib/philippineAddress.js";

// Fallback (only used if the masterlist API lists fail to load) so the
// modal still renders. IDs are the names themselves here — persistence won't
// work in that edge case, but the real lists from the API carry real IDs.
const fallbackDepartments = departmentOptions.map((name) => ({
  department_id: name,
  department_name: name,
}));
function fallbackCoursesForDept(deptName) {
  return (courseOptionsByDept[deptName] || []).map((name) => ({
    course_id: name,
    course_name: name,
  }));
}

const MEDICAL_CONDITIONS = [
  "Allergy",
  "Asthma",
  "Chicken Pox",
  "COVID-19",
  "Diabetes",
  "Dysmenorrhea",
  "Epilepsy / Seizure",
  "Heart Disorder",
  "Hepatitis",
  "Hypertension",
  "Measles",
  "Mumps",
  "Anxiety Disorder",
  "Panic Attack / Hyperventilation",
  "Pneumonia",
  "PTB / Primary Complex",
  "Typhoid Fever",
  "Urinary Tract Infection (UTI)",
];

const STEPS = [
  { n: 1, label: "Personal Information" },
  { n: 2, label: "Medical History" },
  { n: 3, label: "Data Privacy" },
];

const inputClass =
  "w-full min-w-0 border border-ink-300 rounded-lg px-3.5 py-2.5 text-sm text-ink-700 outline-none focus:border-brand-900 focus:ring-2 focus:ring-brand-600/25 placeholder:text-ink-400 disabled:bg-ink-50 disabled:text-ink-400";

const ADDRESS_COPY_KEYS = [
  "addressRegion",
  "addressProvince",
  "addressCity",
  "addressBarangay",
  "addressStreet",
  "addressHouseNumber",
];

/* ---------------------------- helpers: data <-> form ---------------------------- */

function hasAddressText(value) {
  const text = String(value ?? "").trim();
  return text !== "" && text !== "-";
}

// Existing rows may carry structured codes with a blank (or placeholder)
// legacy text. Compose a display value for those rows without parsing or
// rewriting the stored legacy text.
function loadedAddress(source = {}) {
  return {
    ...source,
    presentAddress: hasAddressText(source.presentAddress)
      ? source.presentAddress
      : formatStructuredAddress(source),
    legacyAddress: hasAddressText(source.legacyAddress) ? source.legacyAddress : "",
  };
}

// The legacy column stays only as a derived compatibility value. Never derive
// an empty string from an incomplete address, because that could wipe a saved
// present_address on PATCH.
function derivedAddressText(address = {}) {
  const text = hasAddressText(address.presentAddress)
    ? address.presentAddress
    : formatStructuredAddress(address);
  return hasAddressText(text) ? text : "";
}

function withDerivedPresentAddress(address = {}) {
  const presentAddress = derivedAddressText(address);
  return presentAddress ? { ...address, presentAddress } : address;
}

function copyAddressInto(source = {}, target = {}) {
  const copied = { ...target };
  ADDRESS_COPY_KEYS.forEach((key) => {
    copied[key] = source[key] || "";
  });
  copied.presentAddress = hasAddressText(source.presentAddress)
    ? source.presentAddress
    : formatStructuredAddress(source);
  copied.legacyAddress = hasAddressText(source.legacyAddress) ? source.legacyAddress : "";
  copied.structuredAddressEdited = true;
  return copied;
}

function splitName(fullName = "") {
  const [last = "", rest = ""] = fullName.split(",").map((p) => p.trim());
  const parts = rest.split(" ").filter(Boolean);
  if (parts.length === 0) return { lastName: last, firstName: "", middleName: "" };
  const middleName = parts.length > 1 ? parts[parts.length - 1] : "";
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  return { lastName: last, firstName, middleName };
}

function composeContactName(emergency) {
  const parts = emergency || {};
  const first = String(parts.firstName || "").trim();
  const middle = String(parts.middleName || "").trim();
  const last = String(parts.lastName || "").trim();
  const suffix = String(parts.suffix || "").trim();
  const middlePart = middle ? (middle.endsWith(".") ? middle : `${middle}.`) : "";
  const given = [first, middlePart].filter(Boolean).join(" ");
  const base = [last, given].filter(Boolean).join(", ");
  return base && suffix ? `${base} ${suffix}` : base;
}

// "02/05/2004" -> "2004-02-05" (for <input type="date">); passes ISO through untouched.
function toDateInputValue(value = "") {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// "2004-02-05" -> "02/05/2004" (back to the app's display format).
function fromDateInputValue(value = "") {
  if (!value) return "";
  const [yyyy, mm, dd] = value.split("-");
  if (!yyyy) return value;
  return `${mm}/${dd}/${yyyy}`;
}

// "Allergy: Peanuts" -> checks "Allergy" + fills the specify field; plain
// condition names ("Hepatitis") are matched straight against the list.
function parseConditions(list = []) {
  const conditions = [];
  let allergySpecify = "";
  list.forEach((item) => {
    if (/^allergy/i.test(item)) {
      conditions.push("Allergy");
      const idx = item.indexOf(":");
      if (idx !== -1) allergySpecify = item.slice(idx + 1).trim();
    } else if (MEDICAL_CONDITIONS.includes(item)) {
      conditions.push(item);
    }
  });
  return { conditions, allergySpecify };
}

function buildInitialForm(student, departments = [], courses = []) {
  const { lastName, firstName, middleName } = splitName(student.name);
  const deptName = student.department || "";
  const courseName = student.course || "";
  // Persisted IDs are the source of truth. Reference lists load asynchronously,
  // so resolving by name alone loses a valid saved selection on first render.
  const deptId = student.departmentId ?? student.department_id ?? "";
  const courseId = student.courseId ?? student.course_id ?? "";
  const deptObj = departments.find(
    (d) =>
      String(d.department_id) === String(deptId) ||
      (!deptId && d.department_name === deptName)
  );
  const courseObj = courses.find(
    (c) =>
      String(c.course_id) === String(courseId) ||
      (!courseId && c.course_name === courseName)
  );
  const { conditions, allergySpecify } = parseConditions(student.medicalConditions);
  const studentAddress = loadedAddress(student);
  const emergency = loadedAddress(student.emergencyContact || {});
  const emergencyParts = splitName(emergency.name);
  const hasStructuredEmergencyName = hasStructuredName(emergency);

  return {
    // Student number is derived from the school email (student_id) and the
    // backend ignores it in PATCH, so it's display-only / not validated.
    studentNumber: student.studentNumber || student.studentId || student.student_id || "",
    departmentId: deptId ? String(deptId) : deptObj ? String(deptObj.department_id) : "",
    courseId: courseId ? String(courseId) : courseObj ? String(courseObj.course_id) : "",
    // kept for legacy display / name resolution
    department: deptName,
    course: courseName,
    lastName,
    firstName,
    middleName,
    suffix: student.suffix || "",
    birthday: toDateInputValue(student.birthday),
    sex: student.sex || "",
    civilStatus: student.civilStatus || "",
    contactNumber: student.contactNumber || "",
    // Keep the legacy free-text address verbatim. Structured fields are loaded
    // separately and never back-parsed from this value.
    presentAddress: studentAddress.presentAddress,
    legacyAddress: studentAddress.legacyAddress,
    addressRegion: studentAddress.addressRegion || "",
    addressProvince: studentAddress.addressProvince || "",
    addressCity: studentAddress.addressCity || "",
    addressBarangay: studentAddress.addressBarangay || "",
    addressStreet: studentAddress.addressStreet || "",
    addressHouseNumber: studentAddress.addressHouseNumber || "",
    structuredAddressEdited: false,
    emergency: {
      sameAsStudentAddress: emergency.sameAsStudentAddress === true,
      structuredName: hasStructuredEmergencyName,
      name: hasStructuredEmergencyName ? "" : emergency.name || "",
      firstName: emergency.firstName || emergencyParts.firstName || "",
      middleName: emergency.middleName || emergencyParts.middleName || "",
      lastName: emergency.lastName || emergencyParts.lastName || "",
      suffix: emergency.suffix || "",
      relationship: emergency.relationship || "",
      contactNumber: emergency.contactNumber || "",
      presentAddress: emergency.presentAddress || "",
      legacyAddress: emergency.legacyAddress || "",
      addressRegion: emergency.addressRegion || "",
      addressProvince: emergency.addressProvince || "",
      addressCity: emergency.addressCity || "",
      addressBarangay: emergency.addressBarangay || "",
      addressStreet: emergency.addressStreet || "",
      addressHouseNumber: emergency.addressHouseNumber || "",
      structuredAddressEdited: false,
    },
    conditions,
    allergySpecify,
    hadOperation: student.previousOperation ? "Yes" : "No",
    operationNature: student.previousOperation?.procedure || "",
    operationDate: toDateInputValue(student.previousOperation?.date),
    consent: false,
  };
}

function resolveDeptCourseName(departments, courses, deptId, courseId, fallbackDept, fallbackCourse) {
  const deptObj = departments.find((d) => String(d.department_id) === String(deptId));
  const courseObj = courses.find((c) => String(c.course_id) === String(courseId));
  const deptName = deptObj ? deptObj.department_name : fallbackDept;
  const courseName = courseObj ? courseObj.course_name : fallbackCourse;
  return { deptName, courseName };
}

function buildStudentFromForm(student, form, photoDataUrl, departments = [], courses = []) {
  const name = `${form.lastName}, ${[form.firstName, form.middleName].filter(Boolean).join(" ")}`.trim();
  const conditions = form.conditions.map((c) =>
    c === "Allergy" ? (form.allergySpecify ? `Allergy: ${form.allergySpecify}` : "Allergy") : c
  );

  const { deptName, courseName } = resolveDeptCourseName(
    departments,
    courses,
    form.departmentId,
    form.courseId,
    form.department,
    form.course
  );

  const studentSource = withDerivedPresentAddress(form);

  // While "Same as Student Address" is selected, the emergency contact
  // address is derived from the student address. The stored separate address
  // is left alone until the user saves this choice.
  const emergencySource = withDerivedPresentAddress(
    form.emergency?.sameAsStudentAddress
      ? copyAddressInto(studentSource, form.emergency)
      : form.emergency || {}
  );

  return {
    ...student,
    name,
    firstName: form.firstName,
    middleName: form.middleName,
    lastName: form.lastName,
    suffix: form.suffix,
    studentNumber: form.studentNumber,
    // Both `dept`/`course` and `department`/`course` aliases are kept so the
    // panel (which reads `department`) and the form stay consistent after a save.
    dept: deptName,
    department: deptName,
    course: courseName,
    deptCourse:
      deptName && courseName ? `${deptName} / ${courseName}` : student.deptCourse,
    birthday: fromDateInputValue(form.birthday) || student.birthday,
    sex: form.sex,
    civilStatus: form.civilStatus,
    contactNumber: form.contactNumber,
    presentAddress: studentSource.presentAddress || "",
    legacyAddress: studentSource.legacyAddress || "",
    addressRegion: studentSource.addressRegion || "",
    addressProvince: studentSource.addressProvince || "",
    addressCity: studentSource.addressCity || "",
    addressBarangay: studentSource.addressBarangay || "",
    addressStreet: studentSource.addressStreet || "",
    addressHouseNumber: studentSource.addressHouseNumber || "",
    emergencyContact: {
      ...emergencySource,
      name: hasStructuredName(emergencySource)
        ? composeContactName(emergencySource)
        : emergencySource.name,
    },
    medicalConditions: conditions,
    previousOperation:
      form.hadOperation === "Yes"
        ? { date: fromDateInputValue(form.operationDate), procedure: form.operationNature }
        : null,
    photo: photoDataUrl || student.photo,
  };
}

const CONDITION_TO_COLUMN = {
  "Asthma": "has_asthma",
  "Chicken Pox": "has_chicken_pox",
  "COVID-19": "has_covid19",
  "Diabetes": "has_diabetes",
  "Dysmenorrhea": "has_dysmenorrhea",
  "Epilepsy / Seizure": "has_epilepsy_seizure",
  "Heart Disorder": "has_heart_disorder",
  "Hepatitis": "has_hepatitis",
  "Hypertension": "has_hypertension",
  "Measles": "has_measles",
  "Mumps": "has_mumps",
  "Anxiety Disorder": "has_anxiety_disorder",
  "Panic Attack / Hyperventilation": "has_panic_attack",
  "Pneumonia": "has_pneumonia",
  "PTB / Primary Complex": "has_tb_primary_complex",
  "Typhoid Fever": "has_typhoid_fever",
  "Urinary Tract Infection (UTI)": "has_urinary_tract_infection",
};

function mapToBackendPayload(student, form, photoDataUrl, departments = [], courses = []) {
  const updated = buildStudentFromForm(student, form, photoDataUrl, departments, courses);
  const { lastName, firstName, middleName } = updated;

  const hasAllergy = updated.medicalConditions.some((c) => /^allergy/i.test(c));
  let allergies = "";
  if (hasAllergy) {
    const allergyEntry = updated.medicalConditions.find((c) => /^allergy/i.test(c));
    const idx = allergyEntry?.indexOf(":");
    allergies = idx !== -1 ? allergyEntry.slice(idx + 1).trim() : "";
  }

  const medical_history = {
    has_operation_history: updated.previousOperation != null,
    operation_procedure: updated.previousOperation?.procedure || null,
    operation_date: updated.previousOperation?.date
      ? toDateInputValue(updated.previousOperation.date)
      : null,
    allergies: allergies || null,
  };
  Object.values(CONDITION_TO_COLUMN).forEach((col) => {
    medical_history[col] = false;
  });
  updated.medicalConditions.forEach((c) => {
    const col = CONDITION_TO_COLUMN[c];
    if (col) medical_history[col] = true;
  });

  const ec = updated.emergencyContact || {};
  const studentPresentAddress = derivedAddressText(updated);
  const emergencyPresentAddress = derivedAddressText(ec);

  const emergencyContact = {
    contact_name: ec.name,
    relationship: ec.relationship,
    phone_number: ec.contactNumber,
    ...(emergencyPresentAddress ? { present_address: emergencyPresentAddress } : {}),
    same_as_student_address: ec.sameAsStudentAddress === true,
    ...(hasStructuredName(ec)
      ? {
          contact_name: composeContactName(ec),
          first_name: ec.firstName || null,
          middle_initial: ec.middleName || null,
          last_name: ec.lastName || null,
          suffix: ec.suffix || null,
        }
      : {}),
    ...(ec.structuredAddressEdited
      ? {
          structured_address_edited: true,
          ...buildAddressPatch(ec),
        }
      : {}),
  };

  const payload = {
    first_name: firstName,
    middle_initial: middleName || null,
    last_name: lastName,
    suffix: form.suffix.trim() || null,
    gender: updated.sex,
    birth_date: updated.birthday ? toDateInputValue(updated.birthday) : null,
    civil_status: updated.civilStatus,
    contact_number: updated.contactNumber,
    ...(studentPresentAddress ? { present_address: studentPresentAddress } : {}),
    photo: updated.photo || null,
    // buildAddressPatch omits address_* until the structured block is touched,
    // so a legacy-only save never wipes previously stored structured data.
    ...buildAddressPatch(form),
    emergency_contact: emergencyContact,
    medical_history,
  };
  // Only send department/course when the student actually selected them,
  // so we never overwrite an existing value with null (the IDs may not
  // resolve from the dropdown for students whose dept/course isn't in the
  // loaded list). They remain required in the UI dropdown when changed.
  if (form.departmentId) payload.department_id = Number(form.departmentId);
  if (form.courseId) payload.course_id = Number(form.courseId);
  return payload;
}

const isStep1Valid = (form) => Object.keys(validateStep1(form)).length === 0;
const isStep2Valid = (form) => Object.keys(validateStep2(form)).length === 0;

// Turn a prefixed error map (emergencyAddressRegion) into the shape expected
// by StructuredAddressFields (addressRegion).
function scopedAddressErrors(errors = {}, prefix = "address") {
  const scoped = {};
  Object.keys(errors).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const suffix = key.slice(prefix.length);
    scoped[`${suffix.charAt(0).toLowerCase()}${suffix.slice(1)}`] = true;
  });
  return scoped;
}

/* ---------------------------- small shared field pieces ---------------------------- */

function Label({ children, required }) {
  return (
    <label className="block text-sm font-bold text-ink-700 mb-1.5">
      {children}
      {required && <span className="text-signal-rose"> *</span>}
    </label>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div className="min-w-0">
      {label && <Label required={required}>{label}</Label>}
      {children}
      {error && <p className="text-xs text-signal-rose mt-1">This field is required.</p>}
    </div>
  );
}

function ValidationSummary({ title, fields = [] }) {
  if (!fields.length) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-signal-rose-bg border border-signal-rose-ring text-signal-rose text-sm rounded-xl px-4 py-3 animate-fade-in-up motion-reduce:animate-none"
    >
      <NavIcon name="x" className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-xs mt-1">{fields.join(", ")}</p>
      </div>
    </div>
  );
}

function ToggleGroup({ options, value, onChange, error }) {
  return (
    <div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex-1 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-colors ${
              value === opt
                ? "bg-brand-900 text-white border-brand-900"
                : error
                ? "bg-white text-ink-500 border-signal-rose-ring hover:bg-ink-50"
                : "bg-white text-ink-500 border-ink-300 hover:bg-ink-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-signal-rose mt-1">Please make a selection.</p>}
    </div>
  );
}

function SectionBlock({ icon, title, children }) {
  return (
    <div className="border border-ink-200 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-brand-50 text-brand-900 flex items-center justify-center shrink-0">
          <NavIcon name={icon} className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-xs font-bold text-ink-700 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StructuredAddressFields({ form, onChange, errors = {}, wide = false, required = false }) {
  const field = (key) => ({
    value: form[key] || "",
    onChange: (value) => onChange(key, value),
  });
  const selectProps = {
    className: "min-w-0",
    buttonClassName: "min-h-[42px] !py-2.5",
  };
  const selectorGrid = wide
    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 min-w-0"
    : "grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3.5 min-w-0";

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className={selectorGrid}>
        <Field label="Region" required={required} error={Boolean(errors.addressRegion)}>
          <UniversalDropdown
            {...field("addressRegion")}
            {...selectProps}
            options={getRegionOptions()}
            placeholder="Select Region"
          />
        </Field>
        <Field label="Province" required={required} error={Boolean(errors.addressProvince)}>
          <UniversalDropdown
            {...field("addressProvince")}
            {...selectProps}
            options={getProvinceOptions(form.addressRegion)}
            placeholder={form.addressRegion ? "Select Province" : "Select Region first"}
            disabled={!form.addressRegion}
          />
        </Field>
        <Field label="City / Municipality" required={required} error={Boolean(errors.addressCity)}>
          <UniversalDropdown
            {...field("addressCity")}
            {...selectProps}
            options={getCityOptions(form.addressRegion, form.addressProvince)}
            placeholder={form.addressProvince ? "Select City / Municipality" : "Select Province first"}
            disabled={!form.addressProvince}
          />
        </Field>
        <Field label="Barangay" required={required} error={Boolean(errors.addressBarangay)}>
          <UniversalDropdown
            {...field("addressBarangay")}
            {...selectProps}
            options={getBarangayOptions(form.addressCity)}
            placeholder={form.addressCity ? "Select Barangay" : "Select City first"}
            disabled={!form.addressCity}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-w-0">
        <Field label="Street" required={required} error={Boolean(errors.addressStreet)}>
          <input
            className={inputClass}
            placeholder="Street / Road / Purok"
            value={form.addressStreet || ""}
            onChange={(e) => onChange("addressStreet", e.target.value)}
          />
        </Field>
        <Field label="House Number / Building / Lot" error={Boolean(errors.addressHouseNumber)}>
          <input
            className={inputClass}
            placeholder="Optional"
            value={form.addressHouseNumber || ""}
            onChange={(e) => onChange("addressHouseNumber", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/* ---------------------------- step indicator ---------------------------- */

function StepIndicator({ step }) {
  return (
    <div className="flex items-start justify-center gap-1.5 sm:gap-3 px-4 md:px-8 py-4 shrink-0 border-b border-ink-100">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-start">
          <div className="flex flex-col items-center gap-1.5 w-16 sm:w-24">
            <div
              className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors duration-300 ${
                step > s.n
                  ? "bg-brand-900 text-white"
                  : step === s.n
                  ? "animate-scale-in bg-brand-600 text-white ring-4 ring-brand-600/20"
                  : "bg-ink-100 text-ink-400"
              }`}
            >
              {step > s.n ? <NavIcon name="check" className="w-4 h-4" /> : s.n}
            </div>
            <span
              className={`text-[10px] sm:text-xs font-semibold text-center leading-tight transition-colors duration-300 ${
                step === s.n ? "text-brand-900" : "text-ink-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mt-4 h-0.5 w-4 rounded-full transition-colors duration-500 sm:w-10 md:mt-[18px] ${
                step > s.n ? "bg-brand-900" : "bg-ink-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- step 1: personal information ---------------------------- */

function StepPersonal({ form, update, updateEmergency, onAddressChange, onEmergencyAddressChange, onToggleSameAddress, photoPreview, onPickPhoto, onNext, touched, departments, courses, onDepartmentChange }) {
  const age = computeAge(form.birthday);
  const stepErrors = validateStep1(form);
  const addressErrors = scopedAddressErrors(stepErrors);
  const emergencyAddressErrors = scopedAddressErrors(stepErrors, "emergencyAddress");
  const err = (k) => touched && Boolean(stepErrors[k]);
  const errEmergency = (k) => {
    const keyMap = {
      name: "emergencyName",
      firstName: "emergencyFirstName",
      lastName: "emergencyLastName",
      middleName: "emergencyMiddleName",
      suffix: "emergencySuffix",
      relationship: "emergencyRelationship",
      contactNumber: "emergencyContactNumber",
      presentAddress: "emergencyPresentAddress",
    };
    return touched && Boolean(stepErrors[keyMap[k] || k]);
  };

  return (
    <div className="flex flex-col gap-6">
      <ValidationSummary
        title="Please complete these Personal Information fields before continuing:"
        fields={touched ? errorLabels(STEP1_FIELD_LABELS, stepErrors) : []}
      />
      {/* two-column desktop layout for photo/academic and personal details;
          emergency contact spans the full form width below */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
        <div className="md:col-span-2 flex flex-col gap-5">
          {/* photo */}
          <div className="flex flex-col items-center gap-1.5 border border-ink-200 rounded-xl p-4">
            <div className="relative w-24 h-24">
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label="Upload student photo"
                className="w-24 h-24 rounded-full bg-ink-100 border border-ink-200 flex items-center justify-center overflow-hidden"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Student" className="w-full h-full object-cover" />
                ) : (
                  <NavIcon name="user" className="w-9 h-9 text-ink-300" />
                )}
              </button>
              {/* separate element (not inside the overflow-hidden photo circle)
                  so the badge renders as a full clean circle instead of being
                  clipped at the photo circle's edge */}
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label="Change photo"
                className="absolute bottom-0.5 right-0.5 w-9 h-9 rounded-full bg-brand-900 text-white flex items-center justify-center border-[3px] border-white shadow-md"
              >
                <NavIcon name="camera" className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-ink-700">Student 1x1 Photo</p>
              <p className="text-xs text-ink-400">Tap the circle to upload</p>
            </div>
          </div>

          {/* academic information */}
          <SectionBlock icon="file" title="Academic Information">
            <Field label="Student Number">
              <input
                className={inputClass}
                placeholder="e.g. 20230000"
                value={form.studentNumber}
                readOnly
                disabled
              />
            </Field>
            <Field label="Department" required error={err("departmentId")}>
              <UniversalDropdown
                value={form.departmentId ? String(form.departmentId) : ""}
                onChange={(v) => onDepartmentChange(v)}
                options={departments.map((d) => ({ value: String(d.department_id), label: d.department_name }))}
                placeholder="Select Department"
              />
            </Field>
            <Field label="Course" required error={err("courseId")}>
              <UniversalDropdown
                value={form.courseId ? String(form.courseId) : ""}
                onChange={(v) => update({ courseId: v })}
                options={courses.map((c) => ({ value: String(c.course_id), label: c.course_name }))}
                placeholder={form.departmentId ? "Select Course" : "Select a Department first"}
                disabled={!form.departmentId}
              />
            </Field>
          </SectionBlock>
        </div>

        {/* personal details */}
        <div className="md:col-span-3">
          <SectionBlock icon="user" title="Personal Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <Field label="Last Name" required error={err("lastName")}>
                <input
                  className={inputClass}
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) => update({ lastName: e.target.value })}
                />
              </Field>
              <Field label="First Name" required error={err("firstName")}>
                <input
                  className={inputClass}
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) => update({ firstName: e.target.value })}
                />
              </Field>
              <Field label="Middle Initial / M.I." error={Boolean(stepErrors.middleName)}>
                <input
                  className={inputClass}
                  placeholder="M.I."
                  value={form.middleName}
                  onChange={(e) => update({ middleName: e.target.value })}
                />
              </Field>
              <Field label="Suffix" error={Boolean(stepErrors.suffix)}>
                <input
                  className={inputClass}
                  placeholder="Optional"
                  value={form.suffix}
                  onChange={(e) => update({ suffix: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Birthday" required error={err("birthday")}>
                <input
                  type="date"
                  className={inputClass}
                  value={form.birthday}
                  onChange={(e) => update({ birthday: e.target.value })}
                />
              </Field>
              <div>
                <Label>
                  Age{" "}
                  <span className="text-[10px] font-normal text-ink-400 normal-case">
                    (Auto-Computed)
                  </span>
                </Label>
                <input
                  className={inputClass}
                  value={age != null ? age : ""}
                  readOnly
                  disabled
                  placeholder="—"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Sex" required>
                <ToggleGroup
                  options={["Male", "Female"]}
                  value={form.sex}
                  onChange={(v) => update({ sex: v })}
                  error={err("sex")}
                />
              </Field>
              <Field label="Civil Status" required>
                <ToggleGroup
                  options={["Single", "Married"]}
                  value={form.civilStatus}
                  onChange={(v) => update({ civilStatus: v })}
                  error={err("civilStatus")}
                />
              </Field>
            </div>

            <Field label="Contact Number" required error={err("contactNumber")}>
              <input
                className={inputClass}
                placeholder="09XX XXX XXXX"
                value={form.contactNumber}
                onChange={(e) => update({ contactNumber: e.target.value })}
              />
            </Field>

            <div className="flex min-w-0 flex-col gap-3 border-t border-ink-100 pt-4">
              <h4 className="text-sm font-bold text-ink-700">Student Address</h4>
              <StructuredAddressFields
                form={form}
                onChange={onAddressChange}
                errors={addressErrors}
                required
              />
            </div>
          </SectionBlock>
        </div>
      </div>

      <SectionBlock icon="phone" title="Emergency Contact Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          <Field label="First Name" required error={errEmergency("firstName")}>
            <input
              className={inputClass}
              placeholder="First Name"
              value={form.emergency.firstName}
              onChange={(e) => updateEmergency({ firstName: e.target.value })}
            />
          </Field>
          <Field label="Middle Initial" error={Boolean(stepErrors.emergencyMiddleName)}>
            <input
              className={inputClass}
              placeholder="M.I."
              value={form.emergency.middleName}
              onChange={(e) => updateEmergency({ middleName: e.target.value })}
            />
          </Field>
          <Field label="Last Name" required error={errEmergency("lastName")}>
            <input
              className={inputClass}
              placeholder="Last Name"
              value={form.emergency.lastName}
              onChange={(e) => updateEmergency({ lastName: e.target.value })}
            />
          </Field>
          <Field label="Suffix" error={Boolean(stepErrors.emergencySuffix)}>
            <input
              className={inputClass}
              placeholder="Optional"
              value={form.emergency.suffix}
              onChange={(e) => updateEmergency({ suffix: e.target.value })}
            />
          </Field>
          <Field label="Relationship" required error={errEmergency("relationship")}>
            <input
              className={inputClass}
              placeholder="e.g. Mother / Father"
              value={form.emergency.relationship}
              onChange={(e) => updateEmergency({ relationship: e.target.value })}
            />
          </Field>
          <Field label="Contact Number" required error={errEmergency("contactNumber")}>
            <input
              className={inputClass}
              placeholder="09XX XXX XXXX"
              value={form.emergency.contactNumber}
              onChange={(e) => updateEmergency({ contactNumber: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-ink-100 pt-4">
          <h4 className="text-sm font-bold text-ink-700">Emergency Contact Address</h4>
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
            <AnimatedCheckbox
              checked={form.emergency.sameAsStudentAddress === true}
              onChange={(e) => onToggleSameAddress(e.target.checked)}
              style={{ "--gc-cb-size": "16px" }}
            />
            Same as Student Address
          </label>
          {form.emergency.sameAsStudentAddress ? (
            <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3.5 py-3 text-sm text-ink-600">
              <span className="font-semibold text-ink-700">Using student address:</span>{" "}
              {form.presentAddress || formatStructuredAddress(form) || "Student address is incomplete."}
            </div>
          ) : (
            <>
              {errEmergency("presentAddress") && (
                <p className="-mt-2 text-xs text-signal-rose">An address is required.</p>
              )}
              <StructuredAddressFields
                wide
                form={form.emergency}
                onChange={onEmergencyAddressChange}
                errors={emergencyAddressErrors}
                required
              />
            </>
          )}
        </div>
      </SectionBlock>

      <button
        type="button"
        onClick={onNext}
        className="btn-press w-full sm:w-auto sm:self-end sm:px-10 text-sm font-semibold bg-brand-900 text-white px-5 py-3 rounded-lg transition-colors hover:opacity-90"
      >
        Next: Medical History
      </button>
    </div>
  );
}
/* ---------------------------- step 2: medical history ---------------------------- */

function StepMedical({ form, update, onBack, onNext, touched }) {
  function toggleCondition(name) {
    const has = form.conditions.includes(name);
    update({
      conditions: has ? form.conditions.filter((c) => c !== name) : [...form.conditions, name],
    });
  }

  const hasAllergy = form.conditions.includes("Allergy");
  const stepErrors = validateStep2(form);
  const opErr = touched && Boolean(stepErrors.hadOperation);
  const natureErr = touched && Boolean(stepErrors.operationNature);
  const dateErr = touched && Boolean(stepErrors.operationDate);

  return (
    <div className="flex flex-col gap-5">
      <ValidationSummary
        title="Please complete these Medical History fields before continuing:"
        fields={touched ? errorLabels(STEP2_FIELD_LABELS, stepErrors) : []}
      />
      <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-ink-600 leading-relaxed">
        Please check <span className="font-semibold text-brand-900">(✓)</span> if you have or had
        any of the following medical conditions. This assists clinic nurses in keeping your
        medical profile accurate.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {MEDICAL_CONDITIONS.map((cond) => {
          const checked = form.conditions.includes(cond);
          return (
            <label
              key={cond}
              className={`flex items-center gap-2.5 border rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                checked
                  ? "border-brand-900 bg-brand-50 text-ink-800 font-semibold"
                  : "border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              <AnimatedCheckbox
                checked={checked}
                onChange={() => toggleCondition(cond)}
                style={{ "--gc-cb-size": "16px" }}
              />
              <span className="leading-tight">{cond}</span>
            </label>
          );
        })}
      </div>

      {hasAllergy && (
        <Field label="Specify allergies (e.g. Seafood, Peanuts)">
          <input
            className={inputClass}
            placeholder="Seafood, Peanuts, ..."
            value={form.allergySpecify}
            onChange={(e) => update({ allergySpecify: e.target.value })}
          />
        </Field>
      )}

      <div className="pt-1 border-t border-ink-100">
        <div className="mt-4">
          <Label required>Have you had any operations in the past?</Label>
          <div className="max-w-xs">
            <ToggleGroup
              options={["Yes", "No"]}
              value={form.hadOperation}
              onChange={(v) => update({ hadOperation: v })}
              error={opErr}
            />
          </div>
        </div>

        {form.hadOperation === "Yes" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Field label="Nature of Operation" required error={natureErr}>
              <input
                className={inputClass}
                placeholder="e.g. Appendectomy"
                value={form.operationNature}
                onChange={(e) => update({ operationNature: e.target.value })}
              />
            </Field>
            <Field label="Date of Operation" required error={dateErr}>
              <input
                type="date"
                className={inputClass}
                value={form.operationDate}
                onChange={(e) => update({ operationDate: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="btn-press flex-1 sm:flex-none sm:w-32 inline-flex items-center justify-center gap-1 text-sm font-semibold bg-ink-100 text-ink-600 px-5 py-3 rounded-lg transition-colors hover:bg-ink-200"
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn-press flex-1 text-sm font-semibold bg-brand-900 text-white px-5 py-3 rounded-lg transition-colors hover:opacity-90"
        >
          Next: Data Privacy
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- step 3: data privacy ---------------------------- */

function StepPrivacy({
  form,
  update,
  onBack,
  onSubmit,
  isSaving,
  submitError,
  onClearSaveError,
  blockingIssues = [],
}) {
  return (
    <div className="flex flex-col gap-5">
      <ValidationSummary
        title="Fix these fields before submitting:"
        fields={blockingIssues.flatMap((issue) =>
          issue.fields.map((field) => `${issue.label}: ${field}`)
        )}
      />
      <div className="flex items-center gap-2">
        <NavIcon name="shield" className="w-5 h-5 text-brand-900" />
        <h3 className="text-sm font-bold text-ink-800 uppercase tracking-wide">
          Data Privacy Consent Waiver
        </h3>
      </div>

      <div className="border border-ink-200 rounded-xl p-4 md:p-5 bg-ink-50">
        <p className="font-bold text-ink-800 mb-2 text-sm">
          Republic Act No. 10173 (Data Privacy Act of 2012):
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          I am willing to disclose my personal information with the Gordon College Health
          Services Unit (Clinic). I have the right to access my personal data in a timely manner
          upon official request. The clinic respects patient privacy and is accountable to
          protect my personal information in strict accordance with healthcare privacy
          standards.
        </p>
      </div>

      <label
        className={`flex items-start gap-3 border rounded-xl px-4 py-3.5 cursor-pointer transition-colors ${
          form.consent ? "border-brand-900 bg-brand-50" : "border-ink-200 hover:bg-ink-50"
        }`}
      >
        <AnimatedCheckbox
          checked={form.consent}
          onChange={(e) => {
            update({ consent: e.target.checked });
            onClearSaveError?.();
          }}
          style={{ "--gc-cb-size": "16px" }}
          boxClassName="mt-0.5"
        />
        <span className="text-sm text-ink-700 leading-relaxed">
          I have read and agree to the data privacy waiver above, and I confirm that all the
          information provided in this student record is true, complete, and accurate.
        </span>
      </label>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-signal-rose-bg border border-signal-rose-ring text-signal-rose text-sm rounded-xl px-4 py-3 animate-fade-in-up motion-reduce:animate-none"
        >
          <NavIcon name="x" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSaving}
          className={`btn-press flex-1 sm:flex-none sm:w-32 inline-flex items-center justify-center gap-1 text-sm font-semibold px-5 py-3 rounded-lg transition-colors disabled:active:scale-100 ${
            isSaving
              ? "bg-ink-100 text-ink-400 opacity-50 cursor-not-allowed"
              : "bg-ink-100 text-ink-600 hover:bg-ink-200"
          }`}
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          disabled={!form.consent || isSaving}
          onClick={onSubmit}
          aria-busy={isSaving}
          className={`btn-press flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-3 rounded-lg transition-colors disabled:active:scale-100 ${
            isSaving
              ? "bg-brand-900 text-white opacity-50 cursor-not-allowed"
              : form.consent
              ? "bg-brand-900 text-white hover:opacity-90"
              : "bg-ink-200 text-ink-400 cursor-not-allowed"
          }`}
        >
          {isSaving && (
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
          {isSaving ? "Saving..." : "Submit"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- main modal ---------------------------- */

export default function EditStudentInfoModal({
  student,
  departments: departmentsProp = [],
  courses: coursesProp = [],
  onClose,
  onSave,
  isSaving = false,
  saveError = null,
  onClearSaveError,
  medicalSummaryLoaded = true,
  onboarding = false,
}) {
  const departments = departmentsProp.length ? departmentsProp : fallbackDepartments;
  const [courses, setCourses] = useState(coursesProp.length ? coursesProp : []);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => buildInitialForm(student, departments, courses));
  const [touchedStep1, setTouchedStep1] = useState(false);
  const [touchedStep2, setTouchedStep2] = useState(false);
  const [blockingIssues, setBlockingIssues] = useState([]);
  const [photoPreview, setPhotoPreview] = useState(student.photo || null);
  const fileInputRef = useRef(null);

  // Reference lists arrive after the profile in both edit entry points. Keep
  // the restored course selectable when that async list finally lands, without
  // overriding a course the user picked after changing department.
  useEffect(() => {
    if (!coursesProp.length) return;
    setCourses((current) => {
      const restoredCourseInProps = coursesProp.some(
        (c) => String(c.course_id) === String(form.courseId)
      );
      if (!restoredCourseInProps) return current;
      const alreadyLoaded = current.some(
        (c) => String(c.course_id) === String(form.courseId)
      );
      return alreadyLoaded ? current : coursesProp;
    });
  }, [coursesProp, form.courseId]);

  // Guard against any step change that bypasses Next (devtools, restored
  // draft state, future clickable indicators). Invalid earlier steps always
  // send the user back to the first step that needs attention.
  useEffect(() => {
    if (step >= 2 && !isStep1Valid(form)) {
      setTouchedStep1(true);
      setBlockingIssues([]);
      setStep(1);
      return;
    }
    if (step >= 3 && !isStep2Valid(form)) {
      setTouchedStep2(true);
      setBlockingIssues([]);
      setStep(2);
    }
  }, [step, form]);

  function update(patch) {
    setBlockingIssues([]);
    setForm((f) => ({ ...f, ...patch }));
  }
  function updateEmergency(patch) {
    setBlockingIssues([]);
    setForm((f) => {
      const emergency = { ...f.emergency, ...patch };
      if (STRUCTURED_NAME_KEYS.some((key) => key in patch)) emergency.structuredName = true;
      return { ...f, emergency };
    });
  }
  function handleAddressChange(key, value) {
    setBlockingIssues([]);
    setForm((f) => updateAddressField(f, key, value));
  }
  function handleEmergencyAddressChange(key, value) {
    setBlockingIssues([]);
    setForm((f) => ({
      ...f,
      emergency: updateAddressField(f.emergency, key, value),
    }));
  }
  function handleToggleSameAddress(checked) {
    setBlockingIssues([]);
    setForm((f) => ({
      ...f,
      emergency: { ...f.emergency, sameAsStudentAddress: checked === true },
    }));
  }

  // When the department changes, load that department's courses. Values are
  // real IDs from the API; fall back to the static sample if lists are names.
  async function handleDepartmentChange(deptId) {
    update({ departmentId: deptId, courseId: "" });
    if (!deptId) {
      setCourses([]);
      return;
    }
    try {
      const list = await masterlistApi.listCourses(deptId);
      if (list && list.length) {
        setCourses(list);
        return;
      }
    } catch {
      // fall through to sample fallback below
    }
    const deptName =
      departments.find((d) => String(d.department_id) === String(deptId))?.department_name || "";
    setCourses(deptName ? fallbackCoursesForDept(deptName) : []);
  }

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }
  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  function handleStep1Next() {
    if (!isStep1Valid(form)) {
      setTouchedStep1(true);
      setBlockingIssues([]);
      return;
    }
    setTouchedStep1(false);
    setBlockingIssues([]);
    setStep(2);
  }

  function handleStep2Next() {
    if (!isStep2Valid(form)) {
      setTouchedStep2(true);
      setBlockingIssues([]);
      return;
    }
    setTouchedStep2(false);
    setBlockingIssues([]);
    onClearSaveError?.();
    setStep(3);
  }

  async function handleSubmit() {
    if (isSaving) return;
    const issues = getBlockingIssues(form);
    if (issues.length) {
      const firstInvalidStep = issues[0].step;
      setTouchedStep1(issues.some((issue) => issue.step === 1));
      setTouchedStep2(issues.some((issue) => issue.step === 2));
      setBlockingIssues(issues);
      onClearSaveError?.();
      setStep(firstInvalidStep);
      return;
    }
    setBlockingIssues([]);
    if (!form.consent) return;
    const updatedStudent = buildStudentFromForm(student, form, photoPreview, departments, courses);
    const payload = buildSafeProfilePatch(
      mapToBackendPayload(student, form, photoPreview, departments, courses),
      medicalSummaryLoaded,
      form.consent
    );
    await onSave?.(payload, updatedStudent);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {!medicalSummaryLoaded && (
        <div role="status" className="rounded-panel border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-e1">
          Emergency contact and medical history are unavailable. Only personal information will be saved; retry medical details before changing those sections.
        </div>
      )}
      {/* back link + header — this now lives inline on the page instead of
          a popup box, so it gets the full page width like the desktop mockup */}
      {!onboarding && (
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className={`btn-press inline-flex items-center gap-1.5 text-sm font-semibold w-fit transition-colors ${
            isSaving
              ? "text-ink-400 opacity-50 cursor-not-allowed"
              : "text-ink-500 hover:text-brand-900"
          }`}
        >
          <NavIcon name="back" className="w-4 h-4" />
          Back
        </button>
      )}

      <div className="card-hover rounded-panel bg-white shadow-e2">
        <div className="relative overflow-hidden rounded-t-panel bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-5 py-5 text-white md:px-8 md:py-6">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border border-white/10" />
          <h1 className="relative text-xl font-semibold md:text-2xl">Edit student information</h1>
          <p className="relative mt-0.5 text-xs text-brand-100">Step {step} of 3</p>
          <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-smooth" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>

        <StepIndicator step={step} />

        {/* key={step} remounts this wrapper on every step change so
            switching Personal -> Medical -> Privacy replays a quick
            settle-in transition — transform/opacity only, so it stays cheap. */}
        <div key={step} className="px-5 md:px-8 py-6 animate-fade-in-up motion-reduce:animate-none">
          {step === 1 && (
            <StepPersonal
              form={form}
              update={update}
              updateEmergency={updateEmergency}
              onAddressChange={handleAddressChange}
              onEmergencyAddressChange={handleEmergencyAddressChange}
              onToggleSameAddress={handleToggleSameAddress}
              photoPreview={photoPreview}
              onPickPhoto={handlePickPhoto}
              onNext={handleStep1Next}
              touched={touchedStep1}
              departments={departments}
              courses={courses}
              onDepartmentChange={handleDepartmentChange}
            />
          )}
          {step === 2 && (
            <StepMedical
              form={form}
              update={update}
              onBack={() => setStep(1)}
              onNext={handleStep2Next}
              touched={touchedStep2}
            />
          )}
          {step === 3 && (
            <StepPrivacy
              form={form}
              update={update}
              onBack={() => setStep(2)}
              onSubmit={handleSubmit}
              isSaving={isSaving}
              submitError={saveError}
              onClearSaveError={onClearSaveError}
              blockingIssues={blockingIssues}
            />
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
      </div>
    </div>
  );
}
