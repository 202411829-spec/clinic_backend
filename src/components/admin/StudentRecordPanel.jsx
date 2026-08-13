// src/components/admin/StudentRecordPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon";
import {
  academicYears,
  resultOptions,
  glucoseOptions,
  proteinOptions,
  bloodTypeOptions,
  labExamTypeOptions,
  getStudentAnnualHistory,
  getHistorySummary,
  computeAge,
} from "../../data/studentRecordSample";

// TODO: replace with the logged-in nurse/admin from your Supabase session
// once auth is wired up — matches the placeholder used in AdminLayout.
const currentExaminer = "Joseph Daniel B. Ramos";

function initials(name = "") {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    // "Last, First M." shape (used by the masterlist rows)
    return `${parts[1]?.[0] ?? ""}${parts[0]?.[0] ?? ""}`.toUpperCase();
  }
  const words = name.split(" ").filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`.toUpperCase() || "?";
}

const STATUS_STYLES = {
  Cleared: "bg-green-100 text-green-700",
  "No Record": "bg-gray-100 text-gray-500",
};

const RESULT_STYLES = {
  Normal: "bg-green-100 text-green-700",
  "With Findings": "bg-amber-100 text-amber-700",
};

/* ---------- small shared field pieces, styled to match the rest of the app ---------- */

function FieldLabel({ children }) {
  return <label className="block text-xs font-semibold text-gray-500 mb-1">{children}</label>;
}

function TextInput({ label, ...props }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        {...props}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20 placeholder:text-gray-400"
      />
    </div>
  );
}

function DateInput({ label, ...props }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        type="date"
        {...props}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20"
      />
    </div>
  );
}

function SelectInput({ label, options, placeholder, ...props }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <select
        {...props}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20 bg-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Rounded, color-coded "Normal / With Findings" dropdown used in the findings tables. */
function ResultSelect({ value, onChange }) {
  return (
    <div className="relative inline-block w-full max-w-[150px]">
      <select
        value={value}
        onChange={onChange}
        className={`w-full appearance-none rounded-full pl-3 pr-7 py-1.5 text-xs font-semibold outline-none cursor-pointer ${
          RESULT_STYLES[value] ?? "bg-gray-100 text-gray-600"
        }`}
      >
        {resultOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <NavIcon
        name="chevron-right"
        className="w-3 h-3 rotate-90 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
      />
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2 mb-4">
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
  );
}

/** Thin gray label bar used to split up the Laboratory Results sub-sections. */
function GroupBar({ children }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
      {children}
    </div>
  );
}

function SaveButton({ children, onClick, saved }) {
  return (
    <div className="flex items-center justify-end gap-3">
      {saved && <span className="text-xs font-semibold text-gc-green">Saved ✓</span>}
      <button
        onClick={onClick}
        className="text-sm font-semibold bg-gc-green text-white px-5 py-2.5 rounded-lg hover:opacity-90"
      >
        {children}
      </button>
    </div>
  );
}

/* ---------- per-row action menu on the Annual Examination History table ---------- */

function HistoryActionMenu({ year, disabled, onSelectYear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${year.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <NavIcon name="dots" className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-gray-300 bg-white py-1.5 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={() => {
              onSelectYear(year.key);
              setOpen(false);
            }}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {disabled ? "Add Record" : "View / Edit Record"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- main panel ---------- */

export default function StudentRecordPanel({ student }) {
  const navigate = useNavigate();
  const [records, setRecords] = useState(getStudentAnnualHistory);
  const [activeYear, setActiveYear] = useState("y1");
  const [savedSection, setSavedSection] = useState(null);
  const physicalExamRef = useRef(null);

  const history = useMemo(
    () => getHistorySummary(records, `${currentExaminer} (Nurse)`),
    [records]
  );

  const rec = records[activeYear];
  const age = computeAge(student.birthday);

  function updateRecord(patch) {
    setRecords((prev) => ({ ...prev, [activeYear]: { ...prev[activeYear], ...patch } }));
  }

  function updateFinding(key, value) {
    updateRecord({ findings: { ...rec.findings, [key]: value } });
  }

  function updateFindingRemark(key, value) {
    updateRecord({ findingsRemarks: { ...rec.findingsRemarks, [key]: value } });
  }

  function updateChestXray(patch) {
    updateRecord({ chestXray: { ...rec.chestXray, ...patch } });
  }

  function updateCbc(patch) {
    updateRecord({ cbc: { ...rec.cbc, ...patch } });
  }

  function updateUrinalysis(patch) {
    updateRecord({ urinalysis: { ...rec.urinalysis, ...patch } });
  }

  function handleSave(section) {
    setSavedSection(section);
    window.setTimeout(() => setSavedSection((s) => (s === section ? null : s)), 2000);
  }

  function handleAddAnnualExamination() {
    const nextEmptyYear = academicYears.find((y) => !records[y.key].dateExamined);
    setActiveYear(nextEmptyYear ? nextEmptyYear.key : "y1");
    physicalExamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ---------- student info card ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gc-green text-white text-xl font-bold flex items-center justify-center shrink-0">
            {initials(student.name)}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-bold text-gray-800 text-base md:text-lg leading-tight">
              {formatDisplayName(student.name)}
            </h1>
            {age != null && (
              <span className="text-xs font-semibold bg-gc-green-50 text-gc-green px-2.5 py-1 rounded-full whitespace-nowrap">
                {age} yrs old
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:flex md:items-stretch gap-x-4 gap-y-3 md:divide-x md:divide-gray-100 pt-4 border-t border-gray-200">
          {[
            ["Student ID", student.studentNumber],
            ["Dept. / Course", student.deptCourse],
            ["Year Level", student.yearLevel],
            ["Civil Status", student.civilStatus],
            ["Sex", student.sex],
            ["Contact No.", student.contactNumber],
          ].map(([label, value]) => (
            <div key={label} className="md:px-4 md:first:pl-0">
              <p className="text-xs text-gray-400 mb-0.5 whitespace-nowrap">{label}</p>
              <p className="text-sm font-medium text-gray-800 whitespace-nowrap">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- annual examination history (+ its own actions, outside the box) ---------- */}
      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
                <NavIcon name="calendar" className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-gc-green text-sm md:text-base leading-tight uppercase tracking-wide">
                Annual Examination History
              </h2>
            </div>
            <button
              onClick={handleAddAnnualExamination}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
            >
              + Add Annual Examination
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-300 rounded-xl">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th className="py-2.5 px-4 font-semibold whitespace-nowrap">Year</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Date Examined</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Examined By</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.key} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 text-gray-800 font-medium whitespace-nowrap">{row.label}</td>
                    <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.dateExamined}</td>
                    <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.examinedBy}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          STATUS_STYLES[row.status]
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <HistoryActionMenu
                        year={row}
                        disabled={row.status === "No Record"}
                        onSelectYear={(key) => {
                          setActiveYear(key);
                          physicalExamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Medical Certificate / Medical Summary — live outside the Annual Examination box */}
        <div className="grid grid-cols-2 md:flex md:flex-col gap-2 md:w-52 shrink-0">
          <button
            onClick={() => navigate(`/admin/masterlist/${student.id}/medical-certificate`)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            Medical Certificate
          </button>
          <button
            onClick={() => navigate(`/admin/masterlist/${student.id}/medical-summary`)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            Medical Summary
          </button>
        </div>
      </div>

      {/* ---------- year tabs + view full record ---------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          {academicYears.map((y) => (
            <button
              key={y.key}
              onClick={() => setActiveYear(y.key)}
              className={`shrink-0 whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                activeYear === y.key
                  ? "border-gc-green text-gc-green bg-white"
                  : "border-gray-300 text-gray-500 bg-white hover:bg-gray-50"
              }`}
            >
              {y.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => physicalExamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="w-full md:w-auto text-sm font-semibold bg-gc-green text-white px-5 py-2.5 rounded-lg hover:opacity-90"
        >
          View Full Record
        </button>
      </div>

      {/* ---------- physical examinations ---------- */}
      <section ref={physicalExamRef} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader
          icon="user"
          title="Physical Examinations"
          subtitle="Record of the student's annual physical examination"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* vital signs */}
          <div>
            <GroupBar>Vital Signs and Measurements</GroupBar>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <DateInput
                label="Date Examined"
                value={rec.dateExamined}
                onChange={(e) => updateRecord({ dateExamined: e.target.value })}
              />
              <TextInput
                label="BP (mmHg)"
                placeholder="e.g. 120/80"
                value={rec.bp}
                onChange={(e) => updateRecord({ bp: e.target.value })}
              />
              <TextInput
                label="CR (bpm)"
                placeholder="e.g. 78"
                value={rec.cr}
                onChange={(e) => updateRecord({ cr: e.target.value })}
              />
              <TextInput
                label="RR (breaths/min)"
                placeholder="e.g. 18"
                value={rec.rr}
                onChange={(e) => updateRecord({ rr: e.target.value })}
              />
              <TextInput
                label="Temperature (°C)"
                placeholder="e.g. 36.5"
                value={rec.temperature}
                onChange={(e) => updateRecord({ temperature: e.target.value })}
              />
              <TextInput
                label="Weight (kg)"
                placeholder="e.g. 60"
                value={rec.weight}
                onChange={(e) => updateRecord({ weight: e.target.value })}
              />
              <TextInput
                label="Height (cm)"
                placeholder="e.g. 165"
                value={rec.height}
                onChange={(e) => updateRecord({ height: e.target.value })}
              />
              <div>
                <FieldLabel>BMI (kg/m²)</FieldLabel>
                <div className="w-full border border-gray-300 bg-gc-green-50 rounded-lg px-3 py-2 text-sm text-gray-700 flex items-center justify-between">
                  <span>{computeBmi(rec.weight, rec.height) ?? "—"}</span>
                  <span title="Calculated automatically from weight and height">
                    <NavIcon name="info" className="w-3.5 h-3.5 text-gray-400" />
                  </span>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <TextInput
                  label="Visual Acuity"
                  placeholder="e.g. 20/20"
                  value={rec.visualAcuity}
                  onChange={(e) => updateRecord({ visualAcuity: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* physical findings */}
          <div>
            <GroupBar>Physical Findings</GroupBar>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="py-2 px-3 font-semibold">Examination</th>
                    <th className="py-2 px-3 font-semibold">Result</th>
                    <th className="py-2 px-3 font-semibold">Findings / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["skin", "Skin"],
                    ["heent", "HEENT"],
                    ["heart", "Heart"],
                    ["abdomen", "Abdomen"],
                    ["extremities", "Extremities"],
                  ].map(([key, label]) => (
                    <tr key={key} className="border-b border-gray-200 last:border-b-0">
                      <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{label}</td>
                      <td className="py-2 px-3">
                        <ResultSelect value={rec.findings[key]} onChange={(e) => updateFinding(key, e.target.value)} />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          value={rec.findingsRemarks[key]}
                          onChange={(e) => updateFindingRemark(key, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-gc-accent"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-gray-700">Others</span>
                        <input
                          value={rec.othersSpecify}
                          onChange={(e) => updateRecord({ othersSpecify: e.target.value })}
                          placeholder="Specify"
                          className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-gc-accent placeholder:text-gray-400"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <ResultSelect value={rec.findings.others} onChange={(e) => updateFinding("others", e.target.value)} />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        value={rec.findingsRemarks.others}
                        onChange={(e) => updateFindingRemark("others", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-gc-accent"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
          <TextInput
            label="General Physical Examination Remarks"
            value={rec.generalRemarks}
            onChange={(e) => updateRecord({ generalRemarks: e.target.value })}
          />
          <TextInput
            label="Final Assessment"
            value={rec.finalAssessment}
            onChange={(e) => updateRecord({ finalAssessment: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <TextInput
            label="Examined By"
            value={rec.physicalExaminedBy}
            onChange={(e) => updateRecord({ physicalExaminedBy: e.target.value })}
          />
          <TextInput
            label="License No."
            value={rec.physicalLicenseNo}
            onChange={(e) => updateRecord({ physicalLicenseNo: e.target.value })}
          />
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <SaveButton onClick={() => handleSave("physical")} saved={savedSection === "physical"}>
            Save Physical Examination
          </SaveButton>
        </div>
      </section>

      {/* ---------- laboratory results ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader
          icon="chart"
          title="Laboratory Results"
          subtitle="Record of the student's laboratory examinations and results"
        />

        <div className="space-y-5">
          <div>
            <GroupBar>Chest X-Ray</GroupBar>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DateInput label="Date" value={rec.chestXray.date} onChange={(e) => updateChestXray({ date: e.target.value })} />
              <div>
                <FieldLabel>Result</FieldLabel>
                <ResultSelect value={rec.chestXray.result} onChange={(e) => updateChestXray({ result: e.target.value })} />
              </div>
              <TextInput
                label="Findings / Remarks"
                value={rec.chestXray.remarks}
                onChange={(e) => updateChestXray({ remarks: e.target.value })}
              />
            </div>
          </div>

          <div>
            <GroupBar>CBC</GroupBar>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <DateInput label="Date" value={rec.cbc.date} onChange={(e) => updateCbc({ date: e.target.value })} />
              <TextInput
                label="Hemoglobin (g/dL)"
                value={rec.cbc.hemoglobin}
                onChange={(e) => updateCbc({ hemoglobin: e.target.value })}
              />
              <TextInput
                label="Hematocrit (%)"
                value={rec.cbc.hematocrit}
                onChange={(e) => updateCbc({ hematocrit: e.target.value })}
              />
              <TextInput label="WBC" value={rec.cbc.wbc} onChange={(e) => updateCbc({ wbc: e.target.value })} />
              <TextInput
                label="Platelet Count"
                value={rec.cbc.plateletCount}
                onChange={(e) => updateCbc({ plateletCount: e.target.value })}
              />
              <SelectInput
                label="Blood Type"
                placeholder="Select"
                options={bloodTypeOptions}
                value={rec.cbc.bloodType}
                onChange={(e) => updateCbc({ bloodType: e.target.value })}
              />
            </div>
          </div>

          <div>
            <GroupBar>Urinalysis</GroupBar>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DateInput
                label="Date"
                value={rec.urinalysis.date}
                onChange={(e) => updateUrinalysis({ date: e.target.value })}
              />
              <SelectInput
                label="Glucose / Sugar"
                placeholder="Select"
                options={glucoseOptions}
                value={rec.urinalysis.glucose}
                onChange={(e) => updateUrinalysis({ glucose: e.target.value })}
              />
              <SelectInput
                label="Protein"
                placeholder="Select"
                options={proteinOptions}
                value={rec.urinalysis.protein}
                onChange={(e) => updateUrinalysis({ protein: e.target.value })}
              />
            </div>
          </div>

          <div>
            <GroupBar>Others</GroupBar>
            <div className="max-w-xs">
              <SelectInput
                label="Examination Type"
                placeholder="Select"
                options={labExamTypeOptions}
                value={rec.otherLabType}
                onChange={(e) => updateRecord({ otherLabType: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <SaveButton onClick={() => handleSave("lab")} saved={savedSection === "lab"}>
            Save Lab Results
          </SaveButton>
        </div>
      </section>

      {/* ---------- diagnosis and final remark ---------- */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader icon="info" title="Diagnosis and Final Remark" />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <TextInput
            label="Diagnosis"
            value={rec.diagnosis}
            onChange={(e) => updateRecord({ diagnosis: e.target.value })}
          />
          <TextInput
            label="Final Remark"
            value={rec.finalRemark}
            onChange={(e) => updateRecord({ finalRemark: e.target.value })}
          />
          <div className="md:pl-4 md:border-l md:border-gray-200">
            <TextInput
              label="Examined By"
              value={rec.diagnosisExaminedBy}
              onChange={(e) => updateRecord({ diagnosisExaminedBy: e.target.value })}
            />
          </div>
          <TextInput
            label="License No."
            value={rec.diagnosisLicenseNo}
            onChange={(e) => updateRecord({ diagnosisLicenseNo: e.target.value })}
          />
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={rec.normalFindingsChecked}
              onChange={(e) => updateRecord({ normalFindingsChecked: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-gc-green focus:ring-gc-accent"
            />
            Essentially normal physical findings at the time of evaluation
          </label>
          <SaveButton onClick={() => handleSave("diagnosis")} saved={savedSection === "diagnosis"}>
            Save Record
          </SaveButton>
        </div>
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

// "Ramos, Joseph Daniel B." -> "Joseph Daniel B. Ramos" (matches the mockup header)
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
