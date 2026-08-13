// src/components/admin/MedicalCertificatePanel.jsx
// The printable Medical Certificate form — opened from the "Medical Certificate"
// button on the Student Record and Medical Summary pages. Only this document
// uses the three seal images below; the Sidebar/Login logos are untouched.
import { useState } from "react";
import NavIcon from "./NavIcon";
import { computeAge } from "../../data/studentRecordSample";
import { formatMDY } from "../../lib/calendar";

import gordonCollegeSeal from "../../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../../assets/certificate/osws-seal.png";
import healthServicesSeal from "../../assets/certificate/health-services-seal.png";

const PURPOSE_OPTIONS = ["Allergy", "Asthma", "Chicken Pox"];

// "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos"
function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  if (!rest) return name;
  return `${rest} ${last}`;
}

function pronounFor(sex) {
  return sex?.toLowerCase() === "female" ? "Ms" : "Mr";
}

export default function MedicalCertificatePanel({ student }) {
  const [normalFindings, setNormalFindings] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [finalRemark, setFinalRemark] = useState("");
  const [purpose, setPurpose] = useState(() => new Set());
  const [issuedOn, setIssuedOn] = useState(() => formatMDY(new Date()));
  const [sending, setSending] = useState(false);

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

  return (
    <div className="flex flex-col gap-5 pb-10">
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
          Print
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
        >
          <NavIcon name="download" className="w-4 h-4" />
          Download PDF
        </button>
      </div>

      {/* ---------- certificate card ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4 print:hidden">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <h2 className="font-bold text-gray-700 text-sm">Medical Certificate</h2>
        </div>

        {/* the actual printable form */}
        <div className="border border-gray-300 rounded-2xl p-6 md:p-10 relative">
          <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400">1</p>

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
              className="text-base text-gray-700 border-b border-gray-300 focus:outline-none focus:border-gc-green px-1 py-0.5 print:border-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
