// src/pages/admin/StudentRecord.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import StudentRecordPanel from "../../components/admin/StudentRecordPanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { adaptStudentProfile } from "../../lib/studentAdapter.js";

export default function StudentRecord() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStudent(null);
    setError(null);
    Promise.all([
      masterlistApi.getStudent(studentId),
      recordsApi.medicalSummary(studentId).catch(() => null),
    ])
      .then(([profile, medSummary]) => {
        if (cancelled) return;
        const adapted = adaptStudentProfile(profile, medSummary);
        if (!adapted) {
          setError("We couldn't find a student record for this ID.");
        } else {
          setStudent(adapted);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load student record");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <div className="pt-2">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <Link to="/admin/masterlist" className="text-sm font-semibold text-gc-green hover:opacity-75">
            ← Back to Masterlist
          </Link>
        </section>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="pt-2">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">Loading student record…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <StudentRecordPanel student={student} />
    </div>
  );
}