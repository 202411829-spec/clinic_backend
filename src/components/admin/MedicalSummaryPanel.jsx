// src/components/admin/MedicalSummaryPanel.jsx
// Read-only "Medical Summary" view — printable snapshot of a student's health
// info + annual physical exam / lab history. Opened from the "Medical Summary"
// button on the Student Record page.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon.jsx";
import { ChevronLeftIcon } from "../icons.jsx";
import {
  academicYears,
  computeAge,
  formatLongDate,
} from "../../data/studentRecordSample.js";
import { adaptMedicalSummaryYear } from "../../lib/studentAdapter.js";

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
      // Fixed pixel widths keep columns steady on screen, but with
      // table-fixed they'd add up to more than a printed page's width.
      // print:w-auto lets the table-fixed layout fall back to splitting the
      // page width evenly across columns instead.
      className={`py-2.5 px-4 font-semibold border border-gray-300 text-left print:w-auto ${
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

export default function MedicalSummaryPanel({ student, medicalSummary }) {
  const navigate = useNavigate();
  const [physicalOpen, setPhysicalOpen] = useState(true);
  const [labOpen, setLabOpen] = useState(true);
  const [diagnosisOpen, setDiagnosisOpen] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Columns = base Year I-IV (defaults) PLUS any dynamic year labels the
  // backend returns (e.g. "Year V"), so Year V+ survive in the summary too.
  const summaryYears = Object.keys(medicalSummary?.years ?? {});
  const baseLabels = academicYears.map((y) => y.label.split(" (")[0]);
  const yearLabels = Array.from(new Set([...baseLabels, ...summaryYears]));

  const records = {};
  yearLabels.forEach((label) => {
    records[label] = adaptMedicalSummaryYear(medicalSummary?.years?.[label]);
  });
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
      yearLabels.forEach((yrLabel, i) => doc.text(yrLabel, physCols[i + 1], y));
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
        yearLabels.forEach((yrLabel, i) => doc.text(String(getVal(records[yrLabel])), physCols[i + 1], y));
        y += 5.5;
      });

      heading("Laboratory Results");
      const labCols = [14, 60, 95, 130, 165];
      doc.setFont(undefined, "bold");
      doc.text("Chest X-Ray", labCols[0], y);
      yearLabels.forEach((yrLabel, i) => doc.text(yrLabel, labCols[i + 1], y));
      y += 5;
      doc.setFont(undefined, "normal");
      [
        ["Date", (r) => (r.chestXray.date ? formatLongDate(r.chestXray.date) : "-")],
        ["Result", (r) => (r.chestXray.date ? r.chestXray.result : "-")],
        ["Findings", (r) => r.chestXray.remarks || "-"],
      ].forEach(([label, getVal]) => {
        doc.text(label, labCols[0], y);
        yearLabels.forEach((yrLabel, i) => doc.text(String(getVal(records[yrLabel])), labCols[i + 1], y));
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
        yearLabels.forEach((yrLabel, i) => doc.text(String(getVal(records[yrLabel])), labCols[i + 1], y));
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
        yearLabels.forEach((yrLabel, i) => doc.text(String(getVal(records[yrLabel])), labCols[i + 1], y));
        y += 5.5;
      });

      heading("Diagnosis and Final Remark");
      const diagCols = [14, 60, 95, 130, 165];
      doc.setFont(undefined, "bold");
      doc.text("Item", diagCols[0], y);
      yearLabels.forEach((yrLabel, i) => doc.text(yrLabel, diagCols[i + 1], y));
      y += 5;
      doc.setFont(undefined, "normal");
      [
        ["Diagnosis", (r) => r.diagnosis || "-"],
        ["Final Remark", (r) => r.finalRemark || "-"],
        ["Essentially Normal", (r) => (r.diagnosisNormalFindingsChecked ? "Yes" : r.normalFindingsChecked ? "Yes" : "No")],
        ["Examined By", (r) => r.diagnosisExaminedBy || "-"],
        ["License No.", (r) => r.diagnosisLicenseNo || "-"],
      ].forEach(([label, getVal]) => {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(label, diagCols[0], y);
        yearLabels.forEach((yrLabel, i) => doc.text(String(getVal(records[yrLabel])), diagCols[i + 1], y));
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
      <div className="flex flex-col gap-4 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 self-start text-sm font-semibold text-gc-green-700"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
      {/* print:break-before-page keeps the "Physical Examinations" title and
          the "Vital Signs and Measurements..." label bar attached to their
          table when printing. Without it the browser can end a page right
          after the header, stranding it alone with mostly blank space below,
          while the table (with no title of its own) starts on the next page. */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4 print:break-before-page">
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
                    {yearLabels.map((label) => (
                      <Th key={label}>{label}</Th>
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
                      {yearLabels.map((label) => (
                        <Td key={label}>{getVal(records[label])}</Td>
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
                      {yearLabels.map((label) => (
                        <Td key={label}>
                          <Pill value={records[label].findings[key]} />
                        </Td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <Td>
                      Others{yearLabels.some((label) => records[label].othersSpecify) ? "" : ": -"}
                    </Td>
                    {yearLabels.map((label) => (
                      <Td key={label}>
                        <Pill value={records[label].findings.others} />
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
      {/* print:break-before-page forces this section to start at the top of a
          fresh printed page instead of splitting mid-table across the
          Physical Examinations page. */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4 print:break-before-page">
        <SectionHeader
          icon="chart"
          title="Laboratory Results"
          right={<ChevronToggle open={labOpen} onClick={() => setLabOpen((v) => !v)} />}
        />

        {labOpen && (
          // On screen this scrolls horizontally (overflow-x-auto + min-w) so
          // narrow viewports can still see every column. In print that
          // scroll affordance is meaningless — it just clips columns off the
          // page — so print:overflow-visible + print:min-w-0/print:w-full
          // let the table shrink to the printable width instead.
          <div className="overflow-x-auto rounded-xl print:overflow-visible">
            <table className="w-full text-sm min-w-[640px] print:min-w-0 print:w-full print:text-xs border-collapse table-fixed">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <Th wide>Chest X-Ray</Th>
                  {yearLabels.map((label) => (
                    <Th key={label}>{label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Date</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>
                      {records[label].chestXray.date ? formatLongDate(records[label].chestXray.date) : "-"}
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Result</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>
                      <Pill value={records[label].chestXray.date ? records[label].chestXray.result : ""} />
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Findings / Remarks</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>{v(records[label].chestXray.remarks)}</Td>
                  ))}
                </tr>

                <GroupRow label="CBC" span={yearLabels.length + 1} />
                {[
                  ["Date", (r) => (r.cbc.date ? formatLongDate(r.cbc.date) : "-")],
                  ["Hemoglobin (g/dL)", (r) => v(r.cbc.hemoglobin)],
                  ["Hematocrit (%)", (r) => v(r.cbc.hematocrit)],
                  ["WBC", (r) => v(r.cbc.wbc)],
                  ["Platelet Count", (r) => v(r.cbc.plateletCount)],
                ].map(([label, getVal]) => (
                  <tr key={label}>
                    <Td>{label}</Td>
                    {yearLabels.map((label) => (
                      <Td key={label}>{getVal(records[label])}</Td>
                    ))}
                  </tr>
                ))}

                <GroupRow label="Urinalysis" span={yearLabels.length + 1} />
                <tr>
                  <Td>Date</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>
                      {records[label].urinalysis.date ? formatLongDate(records[label].urinalysis.date) : "-"}
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Glucose / Sugar</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>
                      <Pill value={records[label].urinalysis.glucose} />
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td>Protein</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>
                      <Pill value={records[label].urinalysis.protein} />
                    </Td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- diagnosis and final remark ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print:rounded-none print:p-0 print:pt-4 print:break-before-page">
        <SectionHeader
          icon="info"
          title="Diagnosis and Final Remark"
          right={<ChevronToggle open={diagnosisOpen} onClick={() => setDiagnosisOpen((v) => !v)} />}
        />

        {diagnosisOpen && (
          <div className="overflow-x-auto rounded-xl print:overflow-visible">
            <table className="w-full text-sm min-w-[640px] print:min-w-0 print:w-full print:text-xs border-collapse table-fixed">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <Th wide>Item</Th>
                  {yearLabels.map((label) => (
                    <Th key={label}>{label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Diagnosis</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>{v(records[label].diagnosis)}</Td>
                  ))}
                </tr>
                <tr>
                  <Td>Final Remark</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>{v(records[label].finalRemark)}</Td>
                  ))}
                </tr>
                <tr>
                  <Td>Essentially normal physical findings</Td>
                  {yearLabels.map((label) => {
                    const checked = records[label].diagnosisNormalFindingsChecked ?? records[label].normalFindingsChecked;
                    return (
                      <Td key={label}>
                        <Pill value={checked ? "Normal" : "With Findings"} />
                      </Td>
                    );
                  })}
                </tr>
                <tr>
                  <Td>Examined By</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>{v(records[label].diagnosisExaminedBy)}</Td>
                  ))}
                </tr>
                <tr>
                  <Td>License No.</Td>
                  {yearLabels.map((label) => (
                    <Td key={label}>{v(records[label].diagnosisLicenseNo)}</Td>
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
