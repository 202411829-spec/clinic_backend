// src/pages/admin/MedicalCertificate.jsx
import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useSearchParams } from "react-router-dom";
import MedicalCertificatePanel from "../../components/admin/MedicalCertificatePanel";
import { masterlistApi, recordsApi } from "../../lib/api.js";
import { adaptStudentProfile, latestAnnualExamId } from "../../lib/studentAdapter.js";

const YKEY_TO_LABEL = { y1: "Year I", y2: "Year II", y3: "Year III", y4: "Year IV" };
const LABEL_TO_YKEY = Object.fromEntries(Object.entries(YKEY_TO_LABEL).map(([k, v]) => [v, k]));

function resolveYearParam(raw) {
  if (!raw) return { yearKey: null, yearLabel: null };
  const s = String(raw).trim();
  if (YKEY_TO_LABEL[s]) return { yearKey: s, yearLabel: YKEY_TO_LABEL[s] };
  if (LABEL_TO_YKEY[s]) return { yearKey: LABEL_TO_YKEY[s], yearLabel: s };
  const m = s.match(/^(Year\s+[IV]+)/);
  if (m && LABEL_TO_YKEY[m[1]]) return { yearKey: LABEL_TO_YKEY[m[1]], yearLabel: m[1] };
  if (m && YKEY_TO_LABEL[m[1]]) return { yearKey: m[1], yearLabel: YKEY_TO_LABEL[m[1]] };
  return { yearKey: null, yearLabel: null };
}

function examIdForYear(medSummary, yearLabel, yearKey) {
  if (!medSummary) return null;
  const years =
    medSummary.years ??
    Object.fromEntries((medSummary.annual_exam_history || []).map((row) => [row.year_label, row])) ??
    {};
  if (yearLabel && years[yearLabel]?.annual_exam_id) return years[yearLabel].annual_exam_id;
  // also try yKey if map was keyed by yKey (defensive)
  if (yearKey && years[yearKey]?.annual_exam_id) return years[yearKey].annual_exam_id;
  // scan annual_exam_history for matching year_label variants
  const hist = medSummary.annual_exam_history || [];
  if (yearLabel) {
    const hit = hist.find((r) => r.year_label === yearLabel);
    if (hit?.annual_exam_id) return hit.annual_exam_id;
  }
  if (yearKey && YKEY_TO_LABEL[yearKey]) {
    const hit = hist.find((r) => r.year_label === YKEY_TO_LABEL[yearKey]);
    if (hit?.annual_exam_id) return hit.annual_exam_id;
  }
  return null;
}

export default function MedicalCertificate() {
  const { studentId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [student, setStudent] = useState(null);
  const [certificateData, setCertificateData] = useState(null);
  const [certificateYearLabel, setCertificateYearLabel] = useState(null);
  const [error, setError] = useState(null);

  const rawYear = searchParams.get("year") || location.state?.year || null;
  const { yearKey, yearLabel } = resolveYearParam(rawYear);

  useEffect(() => {
    let cancelled = false;
    setStudent(null);
    setCertificateData(null);
    setCertificateYearLabel(yearLabel ?? null);
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

        // Prefer the year selected on Student Record (via ?year= or location.state).
        // Fall back to the most recent year that has an annual exam.
        let examId = null;
        let resolvedLabel = yearLabel;
        if (yearLabel || yearKey) {
          examId = examIdForYear(medSummary, yearLabel, yearKey);
        }
        if (!examId) {
          examId = latestAnnualExamId(medSummary);
          // if we fell back to latest, clear or set to that latest's label
          if (!yearLabel && examId) {
            const hist = medSummary?.annual_exam_history || [];
            const yearsMap =
              medSummary?.years ??
              Object.fromEntries(hist.map((r) => [r.year_label, r]));
            for (const lbl of ["Year IV", "Year III", "Year II", "Year I"]) {
              if (yearsMap[lbl]?.annual_exam_id === examId) {
                resolvedLabel = lbl;
                break;
              }
            }
          }
        }
        if (!cancelled) setCertificateYearLabel(resolvedLabel ?? yearLabel ?? null);
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
  }, [studentId, rawYear]);

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
        yearLabel={certificateYearLabel}
      />
    </div>
  );
}