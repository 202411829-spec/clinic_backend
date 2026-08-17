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

function buildInitialForm(student) {
  const { lastName, firstName, middleName } = splitName(student.name);
  const [department = "", course = ""] = (student.deptCourse || "")
    .split("/")
    .map((s) => s.trim());
  const { conditions, allergySpecify } = parseConditions(student.medicalConditions);
  const emergency = student.emergencyContact || {};

  return {
    studentNumber: student.studentNumber || "",
    department,
    course,
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

function buildStudentFromForm(student, form, photoDataUrl) {
  const name = `${form.lastName}, ${[form.firstName, form.middleName].filter(Boolean).join(" ")}`.trim();
  const conditions = form.conditions.map((c) =>
    c === "Allergy" ? (form.allergySpecify ? `Allergy: ${form.allergySpecify}` : "Allergy") : c
  );

  return {
    ...student,
    name,
    studentNumber: form.studentNumber,
    dept: form.department,
    course: form.course,
    deptCourse:
      form.department && form.course ? `${form.department} / ${form.course}` : student.deptCourse,
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

const STEP1_REQUIRED = [
  "studentNumber",
  "department",
  "course",
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
    <div className="border border-gray-200 rounded-xl p-4 md:p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
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

function StepPersonal({ form, update, updateEmergency, photoPreview, onPickPhoto, onNext, touched }) {
  const age = computeAge(form.birthday);
  const courses = form.department ? courseOptionsByDept[form.department] ?? [] : [];
  const err = (k) => touched && String(form[k] || "").trim() === "";
  const errEmergency = (k) => touched && String(form.emergency[k] || "").trim() === "";

  return (
    <div className="flex flex-col gap-5">
      {/* photo */}
      <div className="flex flex-col items-center gap-2 pb-1">
        <div className="relative w-28 h-28">
          <button
            type="button"
            onClick={onPickPhoto}
            aria-label="Upload student photo"
            className="w-28 h-28 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Student" className="w-full h-full object-cover" />
            ) : (
              <NavIcon name="user" className="w-11 h-11 text-gray-300" />
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Student Number" required error={err("studentNumber")}>
            <input
              className={inputClass}
              placeholder="e.g. 20230000"
              value={form.studentNumber}
              onChange={(e) => update({ studentNumber: e.target.value })}
            />
          </Field>
          <Field label="Department" required error={err("department")}>
            <select
              className={`${inputClass} bg-white`}
              value={form.department}
              onChange={(e) => update({ department: e.target.value, course: "" })}
            >
              <option value="">Select Department</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course" required error={err("course")}>
            <select
              className={`${inputClass} bg-white`}
              value={form.course}
              onChange={(e) => update({ course: e.target.value })}
              disabled={!form.department}
            >
              <option value="">
                {form.department ? "Select Course" : "Select a Department first"}
              </option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionBlock>

      {/* personal details */}
      <SectionBlock icon="user" title="Personal Details">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              Age <span className="text-[10px] font-normal text-gray-400 normal-case">(Auto-Computed)</span>
            </Label>
            <input className={inputClass} value={age != null ? age : ""} readOnly disabled placeholder="—" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* emergency contact */}
      <SectionBlock icon="phone" title="Emergency Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <button
        type="button"
        onClick={onNext}
        className="w-full text-sm font-semibold bg-gc-green text-white px-5 py-3 rounded-lg hover:opacity-90"
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

function StepPrivacy({ form, update, onBack, onSubmit }) {
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
          disabled={!form.consent}
          onClick={onSubmit}
          className={`flex-1 text-sm font-semibold px-5 py-3 rounded-lg transition-colors ${
            form.consent
              ? "bg-gc-green text-white hover:opacity-90"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- main modal ---------------------------- */

export default function EditStudentInfoModal({ student, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => buildInitialForm(student));
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

  function handleSubmit() {
    if (!form.consent) return;
    onSave?.(buildStudentFromForm(student, form, photoPreview));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-0 sm:p-6 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full sm:max-w-3xl bg-white sm:rounded-2xl shadow-xl border border-gray-200 min-h-screen sm:min-h-0 sm:max-h-[92vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 sm:px-8 pt-5 sm:pt-6 pb-1 shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-base md:text-lg">
              Edit Student Information
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Step {step} of 3</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 shrink-0"
          >
            <NavIcon name="x" className="w-5 h-5" />
          </button>
        </div>

        <StepIndicator step={step} />

        <div className="px-4 sm:px-8 py-5 overflow-y-auto flex-1">
          {step === 1 && (
            <StepPersonal
              form={form}
              update={update}
              updateEmergency={updateEmergency}
              photoPreview={photoPreview}
              onPickPhoto={handlePickPhoto}
              onNext={handleStep1Next}
              touched={touchedStep1}
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
