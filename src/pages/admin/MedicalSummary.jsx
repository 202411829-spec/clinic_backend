// src/pages/admin/MedicalSummary.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import MedicalSummaryPanel from "../../components/admin/MedicalSummaryPanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { adaptStudentProfile } from "../../lib/studentAdapter.js";

export default function MedicalSummary() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [medicalSummary, setMedicalSummary] = useState(null);
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
          return;
        }
        setStudent(adapted);
        setMedicalSummary(medSummary);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load medical summary");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <div className="pt-2">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-8 text-center">
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
        <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-400">Loading medical summary…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <MedicalSummaryPanel student={student} medicalSummary={medicalSummary} />
    </div>
  );
}