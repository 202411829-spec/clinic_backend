// src/pages/admin/MedicalCertificate.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import MedicalCertificatePanel from "../../components/admin/MedicalCertificatePanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { adaptStudentProfile, latestAnnualExamId } from "../../lib/studentAdapter.js";

export default function MedicalCertificate() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [certificateData, setCertificateData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStudent(null);
    setCertificateData(null);
    setError(null);
    (async () => {
      try {
        const profile = await masterlistApi.getStudent(studentId);
        const medSummary = await recordsApi
          .medicalSummary(studentId)
          .catch(() => null);
        if (cancelled) return;
        const adapted = adaptStudentProfile(profile, medSummary);
        if (!adapted) {
          setError("We couldn't find a student record for this ID.");
          return;
        }
        setStudent(adapted);

        // The printable certificate hangs off an annual exam — use the
        // most recent year that has one.
        const examId = latestAnnualExamId(medSummary);
        if (examId) {
          const cert = await recordsApi.medicalCertificate(examId).catch(() => null);
          if (!cancelled) setCertificateData(cert);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load medical certificate");
      }
    })();
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
          <p className="text-sm text-gray-400">Loading medical certificate…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <MedicalCertificatePanel
        student={student}
        certificate={certificateData?.certificate ?? null}
      />
    </div>
  );
}