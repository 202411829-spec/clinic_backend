// src/components/student/StudentRecordPanel.jsx
// Read-only "Students Record" view for the student portal — the student
// looking at their own info (mirrors the admin Medical Summary layout, but
// scoped to Student Information / Emergency Contact / Medical History only,
// with a single "Edit" action instead of print/PDF export).
import { useEffect, useState } from "react";
import NavIcon from "../admin/NavIcon";
import { computeAge } from "../../data/studentRecordSample";
import EditStudentInfoModal from "./EditStudentInfoModal";
import { recordsApi } from "../../lib/api.js";

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
        <NavIcon name={icon} className="w-4 h-4" />
      </span>
      <h2 className="font-bold text-gc-green text-sm md:text-base leading-tight tracking-wide uppercase">
        {title}
      </h2>
    </div>
  );
}

// thin vertical accent bar + bold label, matches the "EMERGENCY CONTACT" /
// "MEDICAL CONDITIONS" sub-headers in the mockup.
function SubLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 bg-gc-accent rounded-full shrink-0" />
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">{children}</h3>
    </div>
  );
}

function v(value) {
  return value && String(value).trim() !== "" ? value : "-";
}

function InfoField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-800 break-words">{v(value)}</p>
    </div>
  );
}

// "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos"
function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  if (!rest) return name;
  return `${rest} ${last}`;
}

export default function StudentRecordPanel({ student: initialStudent, studentId, error }) {
  const [student, setStudent] = useState(initialStudent);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Keep local copy in sync as the async fetch fills the prop in.
  useEffect(() => {
    if (initialStudent) setStudent(initialStudent);
  }, [initialStudent]);

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-300 p-8 text-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="bg-white rounded-2xl border border-gray-300 p-8 text-center text-sm text-gray-400">
        Loading your record…
      </div>
    );
  }

  const age = computeAge(student.birthday);
  const emergency = student.emergencyContact ?? {};
  const conditions = student.medicalConditions ?? [];
  const prevOp = student.previousOperation;

  function handleEditClick() {
    setEditing(true);
  }

  async function handleSave(payload, updatedStudent) {
    setSaveError(null);
    try {
      await recordsApi.updateProfile(studentId, payload);
      setStudent(updatedStudent);
      setEditing(false);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 4000);
    } catch (err) {
      setSaveError(err.message || "Failed to save. Please try again.");
    }
  }

  // Full-page edit view — takes over the whole page instead of popping up
  // in a small box, so the two-column layout has real room to breathe.
  if (editing) {
    return (
      <EditStudentInfoModal student={student} onClose={() => setEditing(false)} onSave={handleSave} />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ---------- title row + edit action ---------- */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleEditClick}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-5 py-2.5 rounded-full hover:opacity-90 shadow-sm"
        >
          <NavIcon name="edit" className="w-4 h-4" />
          Edit
        </button>
      </div>

      {savedNotice && (
        <div className="flex items-start justify-between gap-3 bg-gc-green/5 border border-gc-green/20 text-gc-green text-sm rounded-xl px-4 py-3">
          <span className="flex items-center gap-2">
            <NavIcon name="check" className="w-4 h-4 shrink-0" />
            Your student information has been updated.
          </span>
          <button
            onClick={() => setSavedNotice(false)}
            aria-label="Dismiss"
            className="shrink-0 text-gc-green/70 hover:text-gc-green"
          >
            <NavIcon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {saveError && (
        <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          <span className="flex items-center gap-2">
            <NavIcon name="x" className="w-4 h-4 shrink-0" />
            {saveError}
          </span>
          <button
            onClick={() => setSaveError(null)}
            aria-label="Dismiss"
            className="shrink-0 text-red-400 hover:text-red-600"
          >
            <NavIcon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---------- student information + emergency contact ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader icon="user" title="Student Information" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <InfoField label="Name" value={formatDisplayName(student.name)} />
          <InfoField label="Birthday" value={student.birthday} />
          <InfoField label="Civil Status" value={student.civilStatus} />
          <InfoField label="Student Number" value={student.studentNumber} />
          <InfoField label="Age" value={age != null ? `${age}` : "-"} />
          <InfoField label="Contact Number" value={student.contactNumber} />
          <InfoField label="Department / Course" value={student.deptCourse} />
          <InfoField label="Sex" value={student.sex} />
          <InfoField label="Present Address" value={student.presentAddress} />
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <SubLabel>Emergency Contact</SubLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <InfoField label="Name" value={emergency.name} />
            <InfoField label="Contact Number" value={emergency.contactNumber} />
            <InfoField label="Relationship" value={emergency.relationship} />
            <InfoField label="Present Address" value={emergency.presentAddress} />
          </div>
        </div>
      </section>

      {/* ---------- medical history ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader icon="medical-cross" title="Medical History" />

        <SubLabel>Medical Conditions</SubLabel>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-5">
            {conditions.map((c) => (
              <span
                key={c}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100"
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-5">No known medical conditions on file.</p>
        )}

        <div className="pt-1">
          <p className="text-xs text-gray-400 mb-1">Previous Operation</p>
          <p className="text-sm font-semibold text-gray-800">
            {prevOp ? `${prevOp.date} - ${prevOp.procedure}` : "-"}
          </p>
        </div>
      </section>
    </div>
  );
}
