// src/components/student/EditStudentInfoModal.jsx
// 3-step "Edit Student Information" dialog opened from the Edit button on
// the Student Record page — 1:1 with the Personal Information / Medical
// History / Data Privacy mockups. Frontend-only for now: onSave hands back
// a full student record shaped like masterlistSample so the parent panel
// can update its local state. Swap the fake submit for a real Supabase
// write once that's wired up.
import { useRef, useState } from "react";
import NavIcon from "../admin/NavIcon";
import { computeAge } from "../../data/studentRecordSample";
import { departmentOptions, courseOptionsByDept } from "../../data/masterlistSample";
import { masterlistApi } from "../../lib/api.js";

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
  "w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-green focus:ring-2 focus:ring-gc-green/15 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400";

/* ---------------------------- helpers: data <-> form ---------------------------- */

function splitName(fullName = "") {
  const [last = "", rest = ""] = fullName.split(",").map((p) => p.trim());
  const parts = rest.split(" ").filter(Boolean);
  if (parts.length === 0) return { lastName: last, firstName: "", middleName: "" };
  const middleName = parts.length > 1 ? parts[parts.length - 1] : "";
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  return { lastName: last, firstName, middleName };
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
  const deptObj = departments.find((d) => d.department_name === deptName);
  const courseObj = courses.find((c) => c.course_name === courseName);
  const { conditions, allergySpecify } = parseConditions(student.medicalConditions);
  const emergency = student.emergencyContact || {};

  return {
    studentNumber: student.studentNumber || "",
    departmentId: deptObj ? deptObj.department_id : "",
    courseId: courseObj ? courseObj.course_id : "",
    // kept for legacy display / name resolution
    department: deptName,
    course: courseName,
    lastName,
    firstName,
    middleName,
    birthday: toDateInputValue(student.birthday),
    sex: student.sex || "",
    civilStatus: student.civilStatus || "",
    contactNumber: student.contactNumber || "",
    presentAddress: student.presentAddress || "",
    emergency: {
      name: emergency.name || "",
      relationship: emergency.relationship || "",
      contactNumber: emergency.contactNumber || "",
      presentAddress: emergency.presentAddress || "",
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
  const deptObj = departments.find((d) => d.department_id === deptId);
  const courseObj = courses.find((c) => c.course_id === courseId);
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

  return {
    ...student,
    name,
    studentNumber: form.studentNumber,
    dept: deptName,
    course: courseName,
    deptCourse:
      deptName && courseName ? `${deptName} / ${courseName}` : student.deptCourse,
    birthday: fromDateInputValue(form.birthday) || student.birthday,
    sex: form.sex,
    civilStatus: form.civilStatus,
    contactNumber: form.contactNumber,
    presentAddress: form.presentAddress,
    emergencyContact: { ...form.emergency },
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
  const { lastName, firstName, middleName } = splitName(updated.name);

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

  const payload = {
    first_name: firstName,
    middle_initial: middleName || null,
    last_name: lastName,
    gender: updated.sex,
    birth_date: updated.birthday ? toDateInputValue(updated.birthday) : null,
    civil_status: updated.civilStatus,
    contact_number: updated.contactNumber,
    present_address: updated.presentAddress,
    photo: updated.photo || null,
    emergency_contact: {
      contact_name: ec.name,
      relationship: ec.relationship,
      phone_number: ec.contactNumber,
      present_address: ec.presentAddress,
    },
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

const STEP1_REQUIRED = [
  "lastName",
  "firstName",
  "birthday",
  "sex",
  "civilStatus",
  "contactNumber",
  "presentAddress",
];
const STEP1_EMERGENCY_REQUIRED = ["name", "relationship", "contactNumber", "presentAddress"];

function isStep1Valid(form) {
  return (
    STEP1_REQUIRED.every((k) => String(form[k] || "").trim() !== "") &&
    STEP1_EMERGENCY_REQUIRED.every((k) => String(form.emergency[k] || "").trim() !== "")
  );
}

function isStep2Valid(form) {
  if (!form.hadOperation) return false;
  if (form.hadOperation === "Yes") {
    return form.operationNature.trim() !== "" && form.operationDate.trim() !== "";
  }
  return true;
}

/* ---------------------------- small shared field pieces ---------------------------- */

function Label({ children, required }) {
  return (
    <label className="block text-sm font-bold text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">This field is required.</p>}
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
                ? "bg-gc-green text-white border-gc-green"
                : error
                ? "bg-white text-gray-500 border-red-300 hover:bg-gray-50"
                : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">Please make a selection.</p>}
    </div>
  );
}

function SectionBlock({ icon, title, children }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name={icon} className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ---------------------------- step indicator ---------------------------- */

function StepIndicator({ step }) {
  return (
    <div className="flex items-start justify-center gap-1.5 sm:gap-3 px-4 md:px-8 py-4 shrink-0 border-b border-gray-100">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-start">
          <div className="flex flex-col items-center gap-1.5 w-16 sm:w-24">
            <div
              className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                step > s.n
                  ? "bg-gc-green text-white"
                  : step === s.n
                  ? "bg-gc-green text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step > s.n ? <NavIcon name="check" className="w-4 h-4" /> : s.n}
            </div>
            <span
              className={`text-[10px] sm:text-xs font-semibold text-center leading-tight ${
                step === s.n ? "text-gc-green" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-4 sm:w-10 h-0.5 mt-4 md:mt-4.5 rounded-full ${
                step > s.n ? "bg-gc-green" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- step 1: personal information ---------------------------- */

function StepPersonal({ form, update, updateEmergency, photoPreview, onPickPhoto, onNext, touched, departments, courses, onDepartmentChange }) {
  const age = computeAge(form.birthday);
  const err = (k) => touched && String(form[k] ?? "").trim() === "";
  const errEmergency = (k) => touched && String(form.emergency[k] || "").trim() === "";

  return (
    <div className="flex flex-col gap-6">
      {/* wide two-column layout on desktop so nothing feels squeezed:
          photo + academic info + emergency contact on the left,
          personal details on the right — matches the desktop mockup */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
        <div className="md:col-span-2 flex flex-col gap-5">
          {/* photo */}
          <div className="flex flex-col items-center gap-1.5 border border-gray-200 rounded-xl p-4">
            <div className="relative w-24 h-24">
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label="Upload student photo"
                className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Student" className="w-full h-full object-cover" />
                ) : (
                  <NavIcon name="user" className="w-9 h-9 text-gray-300" />
                )}
              </button>
              {/* separate element (not inside the overflow-hidden photo circle)
                  so the badge renders as a full clean circle instead of being
                  clipped at the photo circle's edge */}
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label="Change photo"
                className="absolute bottom-0.5 right-0.5 w-9 h-9 rounded-full bg-gc-green text-white flex items-center justify-center border-[3px] border-white shadow-md"
              >
                <NavIcon name="camera" className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-700">Student 1x1 Photo</p>
              <p className="text-xs text-gray-400">Tap the circle to upload</p>
            </div>
          </div>

          {/* academic information */}
          <SectionBlock icon="file" title="Academic Information">
            <Field label="Student Number" required error={err("studentNumber")}>
              <input
                className={inputClass}
                placeholder="e.g. 20230000"
                value={form.studentNumber}
                readOnly
                disabled
              />
            </Field>
            <Field label="Department" required error={err("departmentId")}>
              <select
                className={`${inputClass} bg-white`}
                value={form.departmentId || ""}
                onChange={(e) => onDepartmentChange(e.target.value)}
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Course" required error={err("courseId")}>
              <select
                className={`${inputClass} bg-white`}
                value={form.courseId || ""}
                onChange={(e) => update({ courseId: e.target.value })}
                disabled={!form.departmentId}
              >
                <option value="">
                  {form.departmentId ? "Select Course" : "Select a Department first"}
                </option>
                {courses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_name}
                  </option>
                ))}
              </select>
            </Field>
          </SectionBlock>

          {/* emergency contact */}
          <SectionBlock icon="phone" title="Emergency Contact">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Full Name" required error={errEmergency("name")}>
                <input
                  className={inputClass}
                  placeholder="Contact Person Name"
                  value={form.emergency.name}
                  onChange={(e) => updateEmergency({ name: e.target.value })}
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Contact Number" required error={errEmergency("contactNumber")}>
                <input
                  className={inputClass}
                  placeholder="09XX XXX XXXX"
                  value={form.emergency.contactNumber}
                  onChange={(e) => updateEmergency({ contactNumber: e.target.value })}
                />
              </Field>
              <Field label="Address" required error={errEmergency("presentAddress")}>
                <input
                  className={inputClass}
                  placeholder="City / Municipality, Province"
                  value={form.emergency.presentAddress}
                  onChange={(e) => updateEmergency({ presentAddress: e.target.value })}
                />
              </Field>
            </div>
          </SectionBlock>
        </div>

        {/* personal details */}
        <div className="md:col-span-3">
          <SectionBlock icon="user" title="Personal Details">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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
              <Field label="Middle Initial / M.I.">
                <input
                  className={inputClass}
                  placeholder="M.I."
                  value={form.middleName}
                  onChange={(e) => update({ middleName: e.target.value })}
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
                  <span className="text-[10px] font-normal text-gray-400 normal-case">
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

            <Field label="Present Address" required error={err("presentAddress")}>
              <input
                className={inputClass}
                placeholder="House No., Street, Barangay, City / Municipality"
                value={form.presentAddress}
                onChange={(e) => update({ presentAddress: e.target.value })}
              />
            </Field>
          </SectionBlock>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full sm:w-auto sm:self-end sm:px-10 text-sm font-semibold bg-gc-green text-white px-5 py-3 rounded-lg hover:opacity-90"
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
  const opErr = touched && !form.hadOperation;
  const natureErr = touched && form.hadOperation === "Yes" && form.operationNature.trim() === "";
  const dateErr = touched && form.hadOperation === "Yes" && form.operationDate.trim() === "";

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-gc-green/5 border border-gc-green/20 rounded-xl px-4 py-3 text-sm text-gray-600 leading-relaxed">
        Please check <span className="font-semibold text-gc-green">(✓)</span> if you have or had
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
                  ? "border-gc-green bg-gc-green/5 text-gray-800 font-semibold"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-gc-green focus:ring-gc-green/30 shrink-0"
                checked={checked}
                onChange={() => toggleCondition(cond)}
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

      <div className="pt-1 border-t border-gray-100">
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
          className="flex-1 sm:flex-none sm:w-32 inline-flex items-center justify-center gap-1 text-sm font-semibold bg-gray-100 text-gray-600 px-5 py-3 rounded-lg hover:bg-gray-200"
        >
          <NavIcon name="chevron-left" className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 text-sm font-semibold bg-gc-green text-white px-5 py-3 rounded-lg hover:opacity-90"
        >
          Next: Data Privacy
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- step 3: data privacy ---------------------------- */

function StepPrivacy({ form, update, onBack, onSubmit, isSaving, submitError }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <NavIcon name="shield" className="w-5 h-5 text-gc-green" />
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
          Data Privacy Consent Waiver
        </h3>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-gray-50">
        <p className="font-bold text-gray-800 mb-2 text-sm">
          Republic Act No. 10173 (Data Privacy Act of 2012):
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          I am willing to disclose my personal information with the Gordon College Health
          Services Unit (Clinic). I have the right to access my personal data in a timely manner
          upon official request. The clinic respects patient privacy and is accountable to
          protect my personal information in strict accordance with healthcare privacy
          standards.
        </p>
      </div>

      <label
        className={`flex items-start gap-3 border rounded-xl px-4 py-3.5 cursor-pointer transition-colors ${
          form.consent ? "border-gc-green bg-gc-green/5" : "border-gray-200 hover:bg-gray-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gc-green focus:ring-gc-green/30 shrink-0"
          checked={form.consent}
          onChange={(e) => update({ consent: e.target.checked })}
        />
        <span className="text-sm text-gray-700 leading-relaxed">
          I have read and agree to the data privacy waiver above, and I confirm that all the
          information provided in this student record is true, complete, and accurate.
        </span>
      </label>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
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
          className={`flex-1 sm:flex-none sm:w-32 inline-flex items-center justify-center gap-1 text-sm font-semibold px-5 py-3 rounded-lg transition-colors ${
            isSaving
              ? "bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          className={`flex-1 inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-3 rounded-lg transition-colors ${
            isSaving
              ? "bg-gc-green text-white opacity-50 cursor-not-allowed"
              : form.consent
              ? "bg-gc-green text-white hover:opacity-90"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
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
}) {
  const departments = departmentsProp.length ? departmentsProp : fallbackDepartments;
  const [courses, setCourses] = useState(coursesProp.length ? coursesProp : []);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => buildInitialForm(student, departments, courses));
  const [touchedStep1, setTouchedStep1] = useState(false);
  const [touchedStep2, setTouchedStep2] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(student.photo || null);
  const fileInputRef = useRef(null);

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function updateEmergency(patch) {
    setForm((f) => ({ ...f, emergency: { ...f.emergency, ...patch } }));
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
      departments.find((d) => d.department_id === deptId)?.department_name || "";
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
      return;
    }
    setTouchedStep1(false);
    setStep(2);
  }

  function handleStep2Next() {
    if (!isStep2Valid(form)) {
      setTouchedStep2(true);
      return;
    }
    setTouchedStep2(false);
    setStep(3);
  }

  async function handleSubmit() {
    if (!form.consent || isSaving) return;
    const updatedStudent = buildStudentFromForm(student, form, photoPreview, departments, courses);
    const payload = mapToBackendPayload(student, form, photoPreview, departments, courses);
    await onSave?.(payload, updatedStudent);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* back link + header — this now lives inline on the page instead of
          a popup box, so it gets the full page width like the desktop mockup */}
      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold w-fit ${
          isSaving
            ? "text-gray-400 opacity-50 cursor-not-allowed"
            : "text-gray-500 hover:text-gc-green"
        }`}
      >
        <NavIcon name="back" className="w-4 h-4" />
        Back
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-300">
        <div className="px-5 md:px-8 pt-5 md:pt-6">
          <h2 className="font-bold text-gray-800 text-lg md:text-xl">Edit Student Information</h2>
          <p className="text-xs text-gray-400 mt-0.5">Step {step} of 3</p>
        </div>

        <StepIndicator step={step} />

        <div className="px-5 md:px-8 py-6">
          {step === 1 && (
            <StepPersonal
              form={form}
              update={update}
              updateEmergency={updateEmergency}
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
