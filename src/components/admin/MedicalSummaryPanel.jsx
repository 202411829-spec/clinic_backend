// src/components/admin/MedicalSummaryPanel.jsx
// Read-only "Medical Summary" view — printable snapshot of a student's health
// info + annual physical exam / lab history. Opened from the "Medical Summary"
// button on the Student Record page.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon";
import {
  academicYears,
  getStudentAnnualHistory,
  computeAge,
  formatLongDate,
} from "../../data/studentRecordSample";

import gordonCollegeSeal from "../../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../../assets/certificate/osws-seal.png";
import healthServicesSeal from "../../assets/certificate/health-services-seal.png";

const RESULT_STYLES = {
  Normal: "bg-green-100 text-green-700",
  "With Findings": "bg-amber-100 text-amber-700",
  Negative: "bg-green-100 text-green-700",
  Trace: "bg-amber-100 text-amber-700",
  "1+": "bg-amber-100 text-amber-700",
  "2+": "bg-amber-100 text-amber-700",
  "3+": "bg-amber-100 text-amber-700",
  "4+": "bg-amber-100 text-amber-700",
};

function Pill({ value }) {
  if (!value) return <span className="text-gray-400">-</span>;
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        RESULT_STYLES[value] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {value}
    </span>
  );
}

/** small "value or dash" helper so blank fields render as "-" like the mockup */
function v(value) {
  return value && String(value).trim() !== "" ? value : "-";
}

function SectionHeader({ icon, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name={icon} className="w-4 h-4" />
        </span>
        <div>
          <h2 className="font-bold text-gc-green text-sm md:text-base leading-tight tracking-wide uppercase">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-gray-400 leading-tight mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** thin vertical accent bar + bold label, matches the "EMERGENCY CONTACT" /
 * "MEDICAL CONDITIONS" sub-headers in the mockup (no box, unlike GroupBar). */
function SubLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 bg-gc-accent rounded-full shrink-0" />
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">{children}</h3>
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-800 break-words">{v(value)}</p>
    </div>
  );
}

function ChevronToggle({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "Collapse section" : "Expand section"}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 shrink-0 print:hidden"
    >
      <NavIcon
        name="chevron-right"
        className={`w-4 h-4 rotate-90 transition-transform ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

/** Bordered grid cells so every row AND column line is visible, matching the mockup. */
function Th({ children, wide }) {
  return (
    <th
      className={`py-2.5 px-4 font-semibold border border-gray-300 text-left ${
        wide ? "w-[200px]" : "w-[130px]"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return (
    <td className={`py-2.5 px-4 border border-gray-300 text-gray-700 break-words ${className}`}>
      {children}
    </td>
  );
}

function GroupRow({ label, span }) {
  return (
    <tr>
      <td
        colSpan={span}
        className="py-2 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide bg-gray-50 border border-gray-300"
      >
        {label}
      </td>
    </tr>
  );
}

export default function MedicalSummaryPanel({ student }) {
  const navigate = useNavigate();
  const [physicalOpen, setPhysicalOpen] = useState(true);
  const [labOpen, setLabOpen] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const records = getStudentAnnualHistory();
  const age = computeAge(student.birthday);
  const conditions = student.medicalConditions ?? [];
  const emergency = student.emergencyContact ?? {};
  const prevOp = student.previousOperation;

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      let y = 18;

      const line = (label, value, x = 14) => {
        doc.setFont(undefined, "bold");
        doc.text(`${label}:`, x, y);
        doc.setFont(undefined, "normal");
        doc.text(String(value ?? "-"), x + 42, y);
        y += 6;
      };
      const heading = (text) => {
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
        y += 2;
        doc.setFontSize(12);
        doc.setFont(undefined, "bold");
        doc.text(text, 14, y);
        y += 3;
        doc.setDrawColor(4, 75, 14);
        doc.line(14, y, 196, y);
        y += 7;
        doc.setFontSize(10);
      };

      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Medical Summary", 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text("Summary of the student's health information and laboratory results.", 14, y);
      y += 10;

      heading("Student Information");
      line("Name", formatDisplayName(student.name));
      line("Birthday", student.birthday);
      line("Civil Status", student.civilStatus);
      line("Student Number", student.studentNumber);
      line("Age", age != null ? age : "-");
      line("Contact Number", student.contactNumber);
      line("Dept. / Course", student.deptCourse);
      line("Sex", student.sex);
      line("Present Address", student.presentAddress);
      y += 2;
      doc.setFont(undefined, "bold");
      doc.text("Emergency Contact", 14, y);
      y += 6;
      doc.setFont(undefined, "normal");
      line("Name", emergency.name);
      line("Relationship", emergency.relationship);
      line("Contact Number", emergency.contactNumber);
      line("Present Address", emergency.presentAddress);

      heading("Medical History");
      line("Medical Conditions", conditions.length ? conditions.join(", ") : "None on file");
      line("Previous Operation", prevOp ? `${prevOp.date} - ${prevOp.procedure}` : "-");

      heading("Physical Examinations");
      const physCols = [14, 60, 95, 130, 165];
      doc.setFont(undefined, "bold");
      doc.text("Examination", physCols[0], y);
      academicYears.forEach((yr, i) => doc.text(yr.label.split(" (")[0], physCols[i + 1], y));
      y += 5;
      doc.setFont(undefined, "normal");
      [
        ["Date", (r) => (r.dateExamined ? formatLongDate(r.dateExamined) : "-")],
        ["BP (mmHg)", (r) => r.bp || "-"],
        ["CR (bpm)", (r) => r.cr || "-"],
        ["RR (breaths/min)", (r) => r.rr || "-"],
        ["Temperature (°C)", (r) => r.temperature || "-"],
        ["Weight (kg)", (r) => r.weight || "-"],
        ["Height (cm)", (r) => r.height || "-"],
        ["BMI (kg/m²)", (r) => computeBmi(r.weight, r.height) || "-"],
        ["Visual Acuity", (r) => r.visualAcuity || "-"],
        ["Skin", (r) => r.findings.skin],
        ["HEENT", (r) => r.findings.heent],
        ["Heart", (r) => r.findings.heart],
        ["Abdomen", (r) => r.findings.abdomen],
        ["Extremities", (r) => r.findings.extremities],
        ["Others", (r) => r.findings.others],
      ].forEach(([label, getVal]) => {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(label, physCols[0], y);
        academicYears.forEach((yr, i) => doc.text(String(getVal(records[yr.key])), physCols[i + 1], y));
        y += 5.5;
      });

      heading("Laboratory Results");
      const labCols = [14, 60, 95, 130, 165];
      doc.setFont(undefined, "bold");
      doc.text("Chest X-Ray", labCols[0], y);
      academicYears.forEach((yr, i) => doc.text(yr.label.split(" (")[0], labCols[i + 1], y));
      y += 5;
      doc.setFont(undefined, "normal");
      [
        ["Date", (r) => (r.chestXray.date ? formatLongDate(r.chestXray.date) : "-")],
        ["Result", (r) => (r.chestXray.date ? r.chestXray.result : "-")],
        ["Findings", (r) => r.chestXray.remarks || "-"],
      ].forEach(([label, getVal]) => {
        doc.text(label, labCols[0], y);
        academicYears.forEach((yr, i) => doc.text(String(getVal(records[yr.key])), labCols[i + 1], y));
        y += 5.5;
      });
      y += 3;
      doc.setFont(undefined, "bold");
      doc.text("CBC", labCols[0], y);
      y += 5.5;
      doc.setFont(undefined, "normal");
      [
        ["Date", (r) => (r.cbc.date ? formatLongDate(r.cbc.date) : "-")],
        ["Hemoglobin (g/dL)", (r) => r.cbc.hemoglobin || "-"],
        ["Hematocrit (%)", (r) => r.cbc.hematocrit || "-"],
        ["WBC", (r) => r.cbc.wbc || "-"],
        ["Platelet Count", (r) => r.cbc.plateletCount || "-"],
      ].forEach(([label, getVal]) => {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(label, labCols[0], y);
        academicYears.forEach((yr, i) => doc.text(String(getVal(records[yr.key])), labCols[i + 1], y));
        y += 5.5;
      });
      y += 3;
      doc.setFont(undefined, "bold");
      doc.text("Urinalysis", labCols[0], y);
      y += 5.5;
      doc.setFont(undefined, "normal");
      [
        ["Date", (r) => (r.urinalysis.date ? formatLongDate(r.urinalysis.date) : "-")],
        ["Glucose / Sugar", (r) => r.urinalysis.glucose || "-"],
        ["Protein", (r) => r.urinalysis.protein || "-"],
      ].forEach(([label, getVal]) => {
        doc.text(label, labCols[0], y);
        academicYears.forEach((yr, i) => doc.text(String(getVal(records[yr.key])), labCols[i + 1], y));
        y += 5.5;
      });

      doc.save(`medical-summary-${student.studentNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10 print:pb-0 print-a4-portrait">
      {/* ---------- print-only formal letterhead, matching the Medical
          Certificate / Reports header ---------- */}
      <div className="hidden print:flex items-center gap-3 pb-4 border-b border-gray-300">
        <div className="flex-1 flex items-center gap-2">
          <img src={gordonCollegeSeal} alt="Gordon College seal" className="w-14 h-14 object-contain" />
          <img src={oswsSeal} alt="Office of Student Welfare and Services seal" className="w-14 h-14 object-contain" />
        </div>
        <div className="flex-1 text-center px-2">
          <h1 className="font-bold text-gc-green text-lg tracking-wide">GORDON COLLEGE</h1>
          <p className="text-xs text-gray-600 leading-snug">
            Olongapo City Sports Complex, Donor Street, East Tapinac, Olongapo City
          </p>
          <p className="text-xs text-gray-600 leading-snug">Tel. No.: (047) 222-4080</p>
          <p className="font-bold text-gc-green text-sm mt-1">Office of Student Welfare and Service — Health Services Unit</p>
        </div>
        <div className="flex-1 flex items-center justify-end">
          <img src={healthServicesSeal} alt="Health Services Unit seal" className="w-14 h-14 object-contain" />
        </div>
      </div>
      <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4">
        MEDICAL SUMMARY
      </h2>

      {/* ---------- title row + actions ---------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="file" className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-bold text-gray-800 text-base md:text-lg leading-tight">
              Medical Summary
            </h1>
            <p className="text-xs text-gray-400 leading-tight mt-0.5">
              Summary of the student's health information and laboratory results.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 md:flex md:items-center gap-2">
          <button
            onClick={() => navigate(`/admin/masterlist/${student.id}/medical-certificate`)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            Medical Certificate
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg hover:bg-gray-50"
          >
            <NavIcon name="printer" className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            <NavIcon name="download" className="w-4 h-4" />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* ---------- student information ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4">
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

        <div className="mt-5 pt-4 border-t border-gray-200">
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
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4">
        <SectionHeader icon="medical-cross" title="Medical History" />

        <SubLabel>Medical Conditions</SubLabel>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-5">
            {conditions.map((c) => (
              <span
                key={c}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100"
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-5">No known medical conditions on file.</p>
        )}

        <div className="pt-1">
          <p className="text-xs text-gray-400 mb-1">Previous Operation</p>
          <p className="text-sm font-semibold text-gray-800">
            {prevOp ? `${prevOp.date} - ${prevOp.procedure}` : "-"}
          </p>
        </div>
      </section>

      {/* ---------- physical examinations ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4">
        <SectionHeader
          icon="user"
          title="Physical Examinations"
          right={<ChevronToggle open={physicalOpen} onClick={() => setPhysicalOpen((v) => !v)} />}
        />

        {physicalOpen && (
          <>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Vital Signs and Measurements | Physical Findings
            </div>
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-sm min-w-[640px] border-collapse table-fixed">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50">
                    <Th wide>Examination</Th>
                    {academicYears.map((y) => (
                      <Th key={y.key}>{y.label.split(" (")[0]}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Date", (r) => (r.dateExamined ? formatLongDate(r.dateExamined) : "-")],
                    ["BP (mmHg)", (r) => v(r.bp)],
                    ["CR (bpm)", (r) => v(r.cr)],
                    ["RR (breaths/min)", (r) => v(r.rr)],
                    ["Temperature (°C)", (r) => v(r.temperature)],
                    ["Weight (kg)", (r) => v(r.weight)],
                    ["Height (cm)", (r) => v(r.height)],
                    ["BMI (kg/m²)", (r) => v(computeBmi(r.weight, r.height))],
                    ["Visual Acuity", (r) => v(r.visualAcuity)],
                  ].map(([label, getVal]) => (
                    <tr key={label}>
                      <Td>{label}</Td>
                      {academicYears.map((y) => (
                        <Td key={y.key}>{getVal(records[y.key])}</Td>
                      ))}
                    </tr>
                  ))}
                  {[
                    ["skin", "Skin"],
                    ["heent", "HEENT"],
                    ["heart", "Heart"],
                    ["abdomen", "Abdomen"],
                    ["extremities", "Extremities"],
                  ].map(([key, label]) => (
                    <tr key={key}>
                      <Td>{label}</Td>
                      {academicYears.map((y) => (
                        <Td key={y.key}>
                          <Pill value={records[y.key].findings[key]} />
                        </Td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <Td>
                      Others{academicYears.some((y) => records[y.key].othersSpecify) ? "" : ": -"}
                    </Td>
                    {academicYears.map((y) => (
                      <Td key={y.key}>
                        <Pill value={records[y.key].findings.others} />
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ---------- laboratory results ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4">
        <SectionHeader
          icon="chart"
          title="Laboratory Results"
          right={<ChevronToggle open={labOpen} onClick={() => setLabOpen((v) => !v)} />}
        />

        {labOpen && (
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm min-w-[640px] border-collapse table-fixed">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <Th wide>Chest X-Ray</Th>
                  {academicYears.map((y) => (
                    <Th key={y.key}>{y.label.split(" (")[0]}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Date</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>
                      {records[y.key].chestXray.date ? formatLongDate(records[y.key].chestXray.date) : "-"}
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Result</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>
                      <Pill value={records[y.key].chestXray.date ? records[y.key].chestXray.result : ""} />
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Findings / Remarks</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>{v(records[y.key].chestXray.remarks)}</Td>
                  ))}
                </tr>

                <GroupRow label="CBC" span={academicYears.length + 1} />
                {[
                  ["Date", (r) => (r.cbc.date ? formatLongDate(r.cbc.date) : "-")],
                  ["Hemoglobin (g/dL)", (r) => v(r.cbc.hemoglobin)],
                  ["Hematocrit (%)", (r) => v(r.cbc.hematocrit)],
                  ["WBC", (r) => v(r.cbc.wbc)],
                  ["Platelet Count", (r) => v(r.cbc.plateletCount)],
                ].map(([label, getVal]) => (
                  <tr key={label}>
                    <Td>{label}</Td>
                    {academicYears.map((y) => (
                      <Td key={y.key}>{getVal(records[y.key])}</Td>
                    ))}
                  </tr>
                ))}

                <GroupRow label="Urinalysis" span={academicYears.length + 1} />
                <tr>
                  <Td>Date</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>
                      {records[y.key].urinalysis.date ? formatLongDate(records[y.key].urinalysis.date) : "-"}
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Glucose / Sugar</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>
                      <Pill value={records[y.key].urinalysis.glucose} />
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Protein</Td>
                  {academicYears.map((y) => (
                    <Td key={y.key}>
                      <Pill value={records[y.key].urinalysis.protein} />
                    </Td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

// "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos"
function formatDisplayName(name = "") {
  const [last, rest] = name.split(",").map((p) => p.trim());
  if (!rest) return name;
  return `${rest} ${last}`;
}

function computeBmi(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm);
  if (!w || !h) return null;
  const meters = h / 100;
  return (w / (meters * meters)).toFixed(1);
}
