// src/components/admin/MedicalCertificatePanel.jsx
// The printable Medical Certificate form — opened from the "Medical Certificate"
// button on the Student Record and Medical Summary pages. Only this document
// uses the three seal images below; the Sidebar/Login logos are untouched.
//
// Print output: formal format, A4 portrait, three copies stacked on one
// sheet (per the clinic's paper trail — one for the student, one for the
// department, one for the clinic's own file).
import { useRef, useState } from "react";
import NavIcon from "./NavIcon";
import { computeAge } from "../../data/studentRecordSample";
import { formatMDY } from "../../lib/calendar";
import { getCertificateDefaults } from "../../lib/certificateSync";

import gordonCollegeSeal from "../../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../../assets/certificate/osws-seal.png";
import healthServicesSeal from "../../assets/certificate/health-services-seal.png";

const PURPOSE_OPTIONS = ["Enrollment", "OJT Internship", "R.L.E"];
const COPY_LABELS = ["Student's Copy", "Coordinator's Copy", "Registrar's Copy"];

// "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos"
function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  if (!rest) return name;
  return `${rest} ${last}`;
}

function pronounFor(sex) {
  return sex?.toLowerCase() === "female" ? "Ms" : "Mr";
}

// Compact, read-only rendering of one certificate copy — used only in the
// print output, where three of these stack on a single portrait A4 page.
function CertificateCopy({ student, age, normalFindings, diagnosis, finalRemark, purpose, issuedOn, copyLabel, copyNumber }) {
  return (
    <div className="border border-gray-400 rounded-lg p-3 relative flex flex-col text-[9px] leading-snug h-full">
      <p className="absolute top-1.5 right-2 text-[8px] text-gray-500">{copyNumber}</p>
      <p className="absolute top-1.5 left-2 text-[8px] font-semibold text-gray-500 uppercase tracking-wide">
        {copyLabel}
      </p>

      <div className="flex items-start gap-1 mt-3">
        <div className="flex items-start gap-1 shrink-0">
          <img src={gordonCollegeSeal} alt="" className="w-8 h-8 object-contain shrink-0" />
          <img src={oswsSeal} alt="" className="w-8 h-8 object-contain shrink-0" />
        </div>
        <div className="flex-1 text-center px-1">
          <h1 className="font-bold text-gc-green text-[11px] tracking-wide leading-tight">GORDON COLLEGE</h1>
          <p className="text-[7px] text-gray-600 leading-tight">
            Olongapo City Sports Complex, Donor St., East Tapinac, Olongapo City
          </p>
          <p className="text-[7px] text-gray-600 leading-tight">Tel. No.: (047) 222-4080</p>
        </div>
        <img src={healthServicesSeal} alt="" className="w-8 h-8 object-contain shrink-0" />
      </div>

      <div className="text-center mt-1">
        <p className="font-bold text-gc-green text-[8px] leading-tight">
          Office of Student Welfare and Service — Health Services Unit
        </p>
      </div>

      <h2 className="text-center font-bold text-gc-green text-[10px] tracking-[0.15em] underline underline-offset-2 mt-1.5 mb-2">
        MEDICAL CERTIFICATE
      </h2>

      <p className="text-gray-800 mb-2">
        This is to certify that {pronounFor(student.sex)} {formatDisplayName(student.name)},{" "}
        {age != null ? age : "__"} years old, {student.sex || "____"} has submitted all required
        medical requirements and upon physical examination.
      </p>

      <div className="flex items-start gap-1 mb-1.5">
        <span className="font-semibold text-gray-800 shrink-0">Findings:</span>
        <span className="flex-1 flex items-center gap-1 text-gray-700">
          <span
            className={`inline-block w-2.5 h-2.5 border border-gray-500 shrink-0 ${
              normalFindings ? "bg-gc-green" : "bg-white"
            }`}
          />
          Essentially normal physical findings at the time of evaluation
        </span>
      </div>

      <div className="mb-1.5">
        <span className="font-semibold text-gray-800 block">Diagnosis:</span>
        <span className="block border-b border-gray-400 min-h-[10px] text-gray-700">{diagnosis}</span>
      </div>

      <div className="flex items-start gap-1 mb-1.5">
        <span className="font-semibold text-gray-800 shrink-0">Final Remark:</span>
        <span className="flex-1 border-b border-gray-400 min-h-[10px] text-gray-700">{finalRemark}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="font-semibold text-gray-800 shrink-0">Purpose:</span>
        {PURPOSE_OPTIONS.map((label) => (
          <span key={label} className="flex items-center gap-0.5 text-gray-700">
            <span
              className={`inline-block w-2 h-2 border border-gray-500 shrink-0 ${
                purpose.has(label) ? "bg-gc-green" : "bg-white"
              }`}
            />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between gap-2">
        <span className="text-gray-700">
          <span className="font-semibold text-gray-800">Issued on:</span> {issuedOn}
        </span>
        <span className="text-gray-500 text-center">
          ______________________
          <br />
          Attending Physician / Nurse
        </span>
      </div>
    </div>
  );
}

export default function MedicalCertificatePanel({ student }) {
  // Pre-fill from whatever was last saved on the Diagnosis and Final Remark
  // section of this student's Student Record — the nurse can still edit any
  // of these here, this just saves re-typing them.
  const certDefaults = getCertificateDefaults(student.id);
  const [normalFindings, setNormalFindings] = useState(certDefaults.normalFindingsChecked);
  const [diagnosis, setDiagnosis] = useState(certDefaults.diagnosis);
  const [finalRemark, setFinalRemark] = useState(certDefaults.finalRemark);
  const [purpose, setPurpose] = useState(() => new Set());
  const [issuedOn, setIssuedOn] = useState(() => formatMDY(new Date()));
  const [sending, setSending] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const printRef = useRef(null);

  const age = computeAge(student.birthday);

  function togglePurpose(label) {
    setPurpose((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function handleSendEmail() {
    // No email backend is wired up yet — this opens a prefilled draft in the
    // nurse's own mail client as a stand-in until a real "send" endpoint exists.
    setSending(true);
    const subject = encodeURIComponent(`Medical Certificate - ${formatDisplayName(student.name)}`);
    const body = encodeURIComponent(
      `Medical Certificate for ${formatDisplayName(student.name)} (${student.studentNumber}), issued ${issuedOn}.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setTimeout(() => setSending(false), 600);
  }

  // Renders the same three-copy certificate layout used for printing into a
  // real, downloadable PDF file — instead of just opening the browser's
  // print dialog like the "Print" button does. We snapshot the off-screen
  // print-only grid (see printRef below) with html2canvas, then place that
  // image into an A4-portrait jsPDF document at the same 10mm margin used
  // by the print stylesheet, so the download matches what printing produces.
  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const node = printRef.current;
      if (!node) return;

      const canvas = await html2canvas(node, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const margin = 10; // matches the certificate-portrait @page margin
      const imgWidth = 210 - margin * 2; // 190mm
      const imgHeight = (canvas.height / canvas.width) * imgWidth;

      doc.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
      doc.save(`medical-certificate-${student.studentNumber || student.name}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const copyProps = { student, age, normalFindings, diagnosis, finalRemark, purpose, issuedOn };

  return (
    <div className="flex flex-col gap-5 pb-10 print:pb-0 print:gap-0">
      {/* ---------- action row ---------- */}
      <div className="grid grid-cols-3 md:flex md:items-center md:justify-end gap-2 print:hidden">
        <button
          onClick={handleSendEmail}
          disabled={sending}
          className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
        >
          {sending ? "Opening…" : "Send through email"}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg hover:bg-gray-50"
        >
          <NavIcon name="printer" className="w-4 h-4" />
          Print (3 copies, A4 portrait)
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
        >
          <NavIcon name="download" className="w-4 h-4" />
          {downloadingPdf ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {/* ---------- certificate card (screen: editable single form) ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:hidden">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <h2 className="font-bold text-gray-700 text-sm">Medical Certificate</h2>
        </div>
        <p className="text-xs text-gray-400 -mt-2 mb-4">
          Fill this in once — printing produces three formal copies (student, department, clinic) stacked on a single A4 portrait sheet.
        </p>

        {/* the actual editable form */}
        <div className="border border-gray-300 rounded-2xl p-6 md:p-10 relative">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <img src={gordonCollegeSeal} alt="Gordon College seal" className="w-16 h-16 md:w-20 md:h-20 object-contain" />
              <img src={oswsSeal} alt="Office of Student Welfare and Services seal" className="w-16 h-16 md:w-20 md:h-20 object-contain" />
            </div>

            <div className="flex-1 text-center px-2">
              <h1 className="font-bold text-gc-green text-xl md:text-2xl tracking-wide">GORDON COLLEGE</h1>
              <p className="text-xs md:text-sm text-gray-600 leading-snug">
                Olongapo City Sports Complex, Donor Street, East Tapinac, Olongapo City
              </p>
              <p className="text-xs md:text-sm text-gray-600 leading-snug">Tel. No.: (047) 222-4080</p>
            </div>

            <div className="flex-1 flex items-center justify-end">
              <img
                src={healthServicesSeal}
                alt="Health Services Unit seal"
                className="w-16 h-16 md:w-20 md:h-20 object-contain"
              />
            </div>
          </div>

          <div className="text-center mt-3">
            <p className="font-bold text-gc-green text-base md:text-lg">Office of Student Welfare and Service</p>
            <p className="font-bold text-gc-green text-base md:text-lg">Health Services Unit</p>
          </div>

          <h2 className="text-center font-bold text-gc-green text-lg md:text-xl tracking-[0.3em] underline underline-offset-4 mt-5 mb-6">
            MEDICAL CERTIFICATE
          </h2>

          <p className="text-base text-gray-800 leading-relaxed mb-6">
            This is to certify that {pronounFor(student.sex)} {formatDisplayName(student.name)},{" "}
            {age != null ? age : "__"} years old, {student.sex || "____"} has submitted all required medical
            requirements and upon physical examination.
          </p>

          <div className="flex items-start gap-3 mb-4">
            <label className="text-base font-semibold text-gray-800 shrink-0 pt-2">Findings:</label>
            <label className="flex-1 flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 text-base text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={normalFindings}
                onChange={(e) => setNormalFindings(e.target.checked)}
                className="w-4 h-4 accent-gc-green shrink-0"
              />
              Essentially normal physical findings at the time of evaluation
            </label>
          </div>

          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-800 block mb-1">Diagnosis</label>
            <input
              type="text"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-green/30"
              placeholder=""
            />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <label className="text-base font-semibold text-gray-800 shrink-0">Final Remark:</label>
            <input
              type="text"
              value={finalRemark}
              onChange={(e) => setFinalRemark(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-base text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-green/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="text-base font-semibold text-gray-800 shrink-0">Purpose:</label>
            {PURPOSE_OPTIONS.map((label) => (
              <label key={label} className="flex items-center gap-1.5 text-base text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={purpose.has(label)}
                  onChange={() => togglePurpose(label)}
                  className="w-4 h-4 accent-gc-green"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-6">
            <label className="text-base font-semibold text-gray-800 shrink-0">Issued on:</label>
            <input
              type="text"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
              className="text-base text-gray-700 border-b border-gray-300 focus:outline-none focus:border-gc-green px-1 py-0.5"
            />
          </div>
        </div>
      </section>

      {/* ---------- print/PDF-only: three formal copies, stacked on A4 portrait ----------
          Kept off-screen (not display:none) so html2canvas can still capture it for the
          "Download PDF" button — display:none elements have no layout box to snapshot. */}
      <div
        ref={printRef}
        className="grid grid-cols-1 grid-rows-3 gap-3 bg-white fixed top-0 -left-[9999px] w-[190mm] print-a4-portrait-cert print-cert-grid print:static print:left-auto print:top-auto print:w-auto"
      >
        {COPY_LABELS.map((label, i) => (
          <CertificateCopy key={label} {...copyProps} copyLabel={label} copyNumber={i + 1} />
        ))}
      </div>
    </div>
  );
}
