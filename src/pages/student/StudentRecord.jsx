// src/pages/student/StudentRecord.jsx
import { useEffect, useState } from "react";
import StudentRecordPanel from "../../components/student/StudentRecordPanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";

function formatDate(value) {
  if (!value) return "-";
  try {
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate()
    ).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return String(value);
  }
}

const CONDITION_FIELDS = [
  "has_asthma", "has_chicken_pox", "has_diabetes", "has_dysmenorrhea",
  "has_epilepsy_seizure", "has_heart_disorder", "has_hepatitis",
  "has_hypertension", "has_measles", "has_mumps", "has_anxiety_disorder",
  "has_panic_attack", "has_pneumonia", "has_tb_primary_complex",
  "has_typhoid_fever", "has_covid19", "has_urinary_tract_infection",
];

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
      contactNumber: ec.contact_number ?? ec.phone_number ?? ec.phone ?? "-",
    },
    medicalConditions: CONDITION_FIELDS.filter((k) => history[k]),
    previousOperation: {
      date: formatDate(history.operation_date),
      procedure: history.operation_procedure ?? "-",
    },
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
