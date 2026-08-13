// src/pages/admin/MedicalCertificate.jsx
import { useParams, Link } from "react-router-dom";
import MedicalCertificatePanel from "../../components/admin/MedicalCertificatePanel";
import { masterlistStudents } from "../../data/masterlistSample";

export default function MedicalCertificate() {
  const { studentId } = useParams();
  const student = masterlistStudents.find((s) => s.id === studentId);

  if (!student) {
    return (
      <div className="pt-2">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            We couldn't find a student record for this ID.
          </p>
          <Link to="/admin/masterlist" className="text-sm font-semibold text-gc-green hover:opacity-75">
            ← Back to Masterlist
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <MedicalCertificatePanel student={student} />
    </div>
  );
}
