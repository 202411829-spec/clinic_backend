// src/components/student/StudentRecordPanel.jsx
// Read-only "Students Record" view for the student portal — the student
// looking at their own info (mirrors the admin Medical Summary layout, but
// scoped to Student Information / Emergency Contact / Medical History only,
// with a single "Edit" action instead of print/PDF export).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon.jsx";
import { computeAge } from "../../data/studentRecordSample.js";
import EditStudentInfoModal from "./EditStudentInfoModal.jsx";
import { recordsApi, masterlistApi } from "../../lib/api.js";
import { useProfileCompleteness } from "../../context/ProfileCompletenessContext.jsx";
import { isStudentProfileComplete } from "../../lib/profileCompleteness.js";
import { formatDisplayName } from "../../lib/format.js";

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-800">
        <NavIcon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <h2 className="panel-title font-serif">{title}</h2>
    </div>
  );
}

// thin vertical accent bar + bold label, matches the "EMERGENCY CONTACT" /
// "MEDICAL CONDITIONS" sub-headers in the mockup.
function SubLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-4 w-1 shrink-0 rounded-full bg-brand-600" />
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-900">{children}</h3>
    </div>
  );
}

function v(value) {
  return value && String(value).trim() !== "" ? value : "-";
}

function InfoField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-ink-500">{label}</p>
      <p className="cell-wrap text-sm font-medium text-ink-900">{v(value)}</p>
    </div>
  );
}

export default function StudentRecordPanel({ student: initialStudent, studentId, error }) {
  const navigate = useNavigate();
  const { status, loadError, applyProfile, recheck } = useProfileCompleteness();
  const [student, setStudent] = useState(initialStudent);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Real department/course lists (with IDs) for the edit modal so it can
  // persist department_id / course_id instead of plain text names.
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

  // Keep local copy in sync as the async fetch fills the prop in.
  useEffect(() => {
    if (initialStudent) setStudent(initialStudent);
  }, [initialStudent]);

  // Load the department + course lists once the student record is known.
  useEffect(() => {
    if (!student) return;
    let active = true;
    masterlistApi
      .listDepartments()
      .then((depts) => {
        if (!active) return;
        setDepartments(depts || []);
        const current = (depts || []).find((d) => d.department_name === student.department);
        if (current) {
          masterlistApi
            .listCourses(current.department_id)
            .then((cs) => active && setCourses(cs || []))
            .catch(() => active && setCourses([]));
        }
      })
      .catch(() => active && setDepartments([]));
    return () => {
      active = false;
    };
  }, [student]);

  if (error) {
    return (
      <div role="alert" className="rounded-panel bg-signal-rose-bg p-8 text-center text-sm text-signal-rose shadow-e1">
        {error}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your profile">
        <div className="h-36 animate-pulse rounded-panel bg-ink-100" />
        <div className="h-64 animate-pulse rounded-panel bg-ink-100/70" />
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
    setIsSaving(true);
    try {
      const res = await recordsApi.updateProfile(studentId, payload);
      setStudent(updatedStudent);
      setEditing(false);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 4000);
      // Complete-your-record gate: recompute derived completeness straight
      // from the backend echo (no extra fetch) so the gate lifts the moment
      // the profile becomes complete, then hand the student off to the
      // Dashboard. If the record is still incomplete (e.g. the edit form's
      // department/course selectors were left empty), they simply stay on
      // this page with the banner explaining what's left.
      const updatedData = res?.data;
      const complete = Boolean(updatedData && isStudentProfileComplete(updatedData));
      applyProfile(updatedData);
      if (complete) {
        window.setTimeout(() => navigate("/student/dashboard"), 1600);
      }
    } catch (err) {
      setSaveError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  // Full-page edit view — takes over the whole page instead of popping up
  // in a small box, so the two-column layout has real room to breathe.
  if (editing) {
    return (
      <EditStudentInfoModal
        student={student}
        departments={departments}
        courses={courses}
        onClose={() => setEditing(false)}
        onSave={handleSave}
        isSaving={isSaving}
        saveError={saveError}
      />
    );
  }

  return (
    <div className="stagger flex flex-col gap-5 pb-10">
      {/* ---------- identity card + edit action ---------- */}
      <section className="relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-5 text-white shadow-e2 md:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full border border-white/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-14 right-20 h-36 w-36 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-semibold ring-2 ring-white/30">
              {[student.firstName, student.lastName].map((n) => (n || "").charAt(0)).join("").toUpperCase() || "ST"}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-brand-100">Student record</p>
              <h1 className="cell-wrap font-serif text-xl font-semibold leading-tight md:text-2xl">
                {formatDisplayName(student.name)}
              </h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[student.studentNumber, student.course, student.yearLevel && student.yearLevel !== "-" ? `Year ${student.yearLevel}` : null]
                  .filter((c) => c && c !== "-")
                  .map((c) => (
                    <span key={c} className="cell-wrap rounded-full bg-white/15 px-2.5 py-0.5 text-2xs font-medium">{c}</span>
                  ))}
              </div>
            </div>
          </div>
          <button
            onClick={handleEditClick}
            className="btn btn-press btn-shine bg-white text-brand-900 shadow-e2 hover:bg-brand-50"
          >
            <NavIcon name="edit" className="h-4 w-4" />
            Edit information
          </button>
        </div>
      </section>

      {status === "incomplete" && (
        <div className="flex items-start justify-between gap-3 rounded-card border border-signal-amber-ring bg-signal-amber-bg px-4 py-3 text-sm text-signal-amber animate-fade-in-up motion-reduce:animate-none">
          <span className="flex items-start gap-2">
            <NavIcon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Complete your profile to unlock the portal.</span>{" "}
              Only this page is available until your profile below is filled in.
            </span>
          </span>
          {loadError && (
            <button
              type="button"
              onClick={() => recheck()}
              className="btn-press shrink-0 text-sm font-semibold underline underline-offset-2 hover:opacity-75"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {savedNotice && (
        <div className="flex items-start justify-between gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 animate-fade-in-up motion-reduce:animate-none">
          <span className="flex items-center gap-2">
            <NavIcon name="check" className="w-4 h-4 shrink-0" />
            Your student information has been updated.
          </span>
          <button
            onClick={() => setSavedNotice(false)}
            aria-label="Dismiss"
            className="btn-press shrink-0 text-brand-700/70 transition-colors hover:text-brand-800"
          >
            <NavIcon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {saveError && (
        <div className="flex items-start justify-between gap-3 rounded-card border border-signal-rose-ring bg-signal-rose-bg px-4 py-3 text-sm text-signal-rose animate-fade-in-up motion-reduce:animate-none">
          <span className="flex items-center gap-2">
            <NavIcon name="x" className="w-4 h-4 shrink-0" />
            {saveError}
          </span>
          <button
            onClick={() => setSaveError(null)}
            aria-label="Dismiss"
            className="btn-press shrink-0 text-signal-rose/70 transition-colors hover:text-signal-rose"
          >
            <NavIcon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---------- student information + emergency contact ---------- */}
      <section className="card-hover rounded-panel bg-white p-5 shadow-e2 md:p-7">
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

        <div className="mt-6 border-t border-ink-100 pt-5">
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
      <section className="card-hover rounded-panel bg-white p-5 shadow-e2 md:p-7">
        <SectionHeader icon="medical-cross" title="Medical History" />

        <SubLabel>Medical Conditions</SubLabel>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-5">
            {conditions.map((c, i) => (
              <span
                key={c}
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                className="cell-wrap animate-fade-in-up rounded-full bg-signal-rose-bg px-3 py-1.5 text-xs font-medium text-signal-rose ring-1 ring-inset ring-signal-rose-ring motion-reduce:animate-none"
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-5 text-sm text-ink-400">No known medical conditions on file.</p>
        )}

        <div className="pt-1">
          <p className="mb-1 text-xs text-ink-500">Previous Operation</p>
          <p className="cell-wrap text-sm font-medium text-ink-900">
            {prevOp ? `${prevOp.date} - ${prevOp.procedure}` : "-"}
          </p>
        </div>
      </section>
    </div>
  );
}
