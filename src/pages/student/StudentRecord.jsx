// src/pages/student/StudentRecord.jsx
import { useEffect, useState } from "react";
import StudentRecordPanel from "../../components/student/StudentRecordPanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";

// Adapt the backend shapes (student_masterlist row + /api/records/<id>/
// medical-summary payload) into the shape StudentRecordPanel renders.
function adaptStudent(profile, medSummary) {
  if (!profile) return null;
  const middle = profile.middle_initial ? ` ${profile.middle_initial}.` : "";
  const ec = medSummary?.emergency_contact || {};
  const history = medSummary?.medical_history || {};
  return {
    studentId: profile.student_id,
    name: `${profile.last_name ?? ""}, ${profile.first_name ?? ""}${middle}`.trim(),
    firstName: profile.first_name,
    lastName: profile.last_name,
    birthday: profile.birth_date ?? null,
    sex: profile.gender ?? "-",
    yearLevel: profile.year_level ?? "-",
    course: profile.course_name ?? "-",
    department: profile.department_name ?? "-",
    emergencyContact: {
      name: ec.contact_name ?? ec.name ?? "-",
      relationship: ec.relationship ?? "-",
      contactNumber: ec.contact_number ?? ec.phone ?? "-",
    },
    medicalConditions: Array.isArray(history.conditions)
      ? history.conditions
      : history.conditions
      ? [String(history.conditions)]
      : [],
    previousOperation: history.previous_operation ?? "-",
  };
}

export default function StudentRecord() {
  const { studentId } = useAuth();
  const [student, setStudent] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    Promise.all([
      masterlistApi.getStudent(studentId),
      recordsApi.medicalSummary(studentId).catch(() => null),
    ])
      .then(([profile, medSummary]) => {
        if (cancelled) return;
        setStudent(adaptStudent(profile, medSummary));
        setSummary(medSummary);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load your record");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <div className="pt-2 md:pt-4 max-w-6xl mx-auto">
      <StudentRecordPanel student={student} error={error} />
    </div>
  );
}
