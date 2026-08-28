// src/components/admin/StudentRecordPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon";
import AddAnnualExamModal from "./AddAnnualExamModal";
import {
  academicYears,
  resultOptions,
  glucoseOptions,
  proteinOptions,
  bloodTypeOptions,
  labExamTypeOptions,
  labOtherFieldsConfig,
  createEmptyYearRecord,
  getHistorySummary,
  computeAge,
} from "../../data/studentRecordSample";
import { saveCertificateDefaults } from "../../lib/certificateSync";
import { recordsApi } from "../../lib/api";
import { yearIndexFromLabel, formatYearLabel } from "../../lib/yearLabel";

// TODO: replace with the logged-in nurse/admin from your Supabase session
// once auth is wired up — matches the placeholder used in AdminLayout.
const currentExaminer = "Joseph Daniel B. Ramos";

// Fixed base years every student has; dynamic years (Year V+) are appended
// on top. Keys are the canonical year_label string itself.
const DEFAULT_YEAR_LABELS = ["Year I", "Year II", "Year III", "Year IV"];

// "Year I (2025 - 2026)" -> { "Year I": "2025-2026", ... }
const DEFAULT_YEAR_SCHOOL_YEAR = Object.fromEntries(
  academicYears.map((y) => [
    y.label.split(" (")[0],
    (y.label.match(/(\d{4})\s*-\s*(\d{4}|\d{2})/) || []).slice(1).join("-") || null,
  ])
);

function defaultYearList() {
  return DEFAULT_YEAR_LABELS.map((label) => ({
    key: label,
    label,
    schoolYear: DEFAULT_YEAR_SCHOOL_YEAR[label] ?? null,
  }));
}

function defaultRecords() {
  const rec = {};
  DEFAULT_YEAR_LABELS.forEach((label) => {
    rec[label] = createEmptyYearRecord();
  });
  return rec;
}

/** Highest school_year end across known years, +1 -> "2029-2030". */
function nextSchoolYear(yearsList) {
  let maxEnd = null;
  for (const y of yearsList || []) {
    const m = String(y.schoolYear || "").match(/(\d{4})\s*-\s*(\d{4}|\d{2})/);
    if (m) {
      const end = parseInt(m[2].length === 2 ? `20${m[2]}` : m[2], 10);
      if (maxEnd === null || end > maxEnd) maxEnd = end;
    }
  }
  if (maxEnd === null) {
    const now = new Date().getFullYear();
    return `${now}-${now + 1}`;
  }
  return `${maxEnd}-${maxEnd + 1}`;
}

function parseNumberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function initials(name = "") {
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
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

/* ---------- small shared field pieces ---------- */

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

function LabOtherDynamicFields({ examType, details, onChange }) {
  const fields = labOtherFieldsConfig[examType];
  if (!fields || fields.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
      {fields.map((f) =>
        f.type === "select" ? (
          <SelectInput
            key={f.key}
            label={f.label}
            placeholder="Select"
            options={f.options}
            value={details?.[f.key] ?? ""}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
          />
        ) : (
          <TextInput
            key={f.key}
            label={f.label}
            value={details?.[f.key] ?? ""}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
          />
        )
      )}
    </div>
  );
}

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

function GroupBar({ children }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
      {children}
    </div>
  );
}

function SaveButton({ children, onClick, saved, saving, disabled }) {
  return (
    <div className="flex items-center justify-end gap-3">
      {saved && <span className="text-xs font-semibold text-gc-green">Saved ✓</span>}
      {saving && <span className="text-xs font-semibold text-gray-500">Saving…</span>}
      <button
        onClick={onClick}
        disabled={disabled || saving}
        className="text-sm font-semibold bg-gc-green text-white px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {children}
      </button>
    </div>
  );
}

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

/* ---------- payload builders ---------- */

function buildPhysicalPayload(rec) {
  const weight = parseNumberOrNull(rec.weight);
  const height = parseNumberOrNull(rec.height);
  return {
    date_examined: rec.dateExamined || null,
    blood_pressure: rec.bp || null,
    cardiac_rate: parseNumberOrNull(rec.cr),
    respiratory_rate: parseNumberOrNull(rec.rr),
    temperature: parseNumberOrNull(rec.temperature),
    weight: weight,
    height: height,
    visual_acuity: rec.visualAcuity || null,
    examined_by: rec.physicalExaminedBy || currentExaminer,
    other_findings_label: rec.othersSpecify || null,
    general_remarks: rec.generalRemarks || null,
    final_assessment: rec.finalAssessment || null,
    skin: { result: rec.findings.skin || "Normal", remarks: rec.findingsRemarks.skin || null },
    heent: { result: rec.findings.heent || "Normal", remarks: rec.findingsRemarks.heent || null },
    heart: { result: rec.findings.heart || "Normal", remarks: rec.findingsRemarks.heart || null },
    abdomen: { result: rec.findings.abdomen || "Normal", remarks: rec.findingsRemarks.abdomen || null },
    extremities: { result: rec.findings.extremities || "Normal", remarks: rec.findingsRemarks.extremities || null },
    other_findings: { result: rec.findings.others || "Normal", remarks: rec.findingsRemarks.others || null },
  };
}

function buildLabPayload(rec) {
  const otherResults =
    rec.otherLabType && rec.otherLabDetails && Object.keys(rec.otherLabDetails).length
      ? JSON.stringify({ type: rec.otherLabType, details: rec.otherLabDetails, extra: rec.extraLabOthers })
      : rec.otherLabType || null;
  return {
    cbc_date: rec.cbc.date || null,
    hemoglobin: parseNumberOrNull(rec.cbc.hemoglobin),
    hematocrit: parseNumberOrNull(rec.cbc.hematocrit),
    wbc: parseNumberOrNull(rec.cbc.wbc),
    platelet_count: parseNumberOrNull(rec.cbc.plateletCount),
    blood_type: rec.cbc.bloodType || null,
    urinalysis_date: rec.urinalysis.date || null,
    glucose: rec.urinalysis.glucose || null,
    protein: rec.urinalysis.protein || null,
    other_examination_type: rec.otherLabType || null,
    other_results: otherResults,
    chest_xray_date: rec.chestXray.date || null,
    chest_xray_result: rec.chestXray.result || null,
    chest_xray_notes: rec.chestXray.remarks || null,
  };
}

function buildDiagnosisPayload(rec) {
  return {
    diagnosis: rec.diagnosis || null,
    final_remark: rec.finalRemark || null,
    essentially_normal: !!rec.diagnosisNormalFindingsChecked,
    examined_by: rec.diagnosisExaminedBy || currentExaminer,
  };
}

/* ---------- main panel ---------- */

export default function StudentRecordPanel({ student }) {
  const navigate = useNavigate();
  const [records, setRecords] = useState(defaultRecords);
  const [yearsList, setYearsList] = useState(defaultYearList);
  const [activeYear, setActiveYear] = useState(defaultYearList()[0].key);
  const [savedSection, setSavedSection] = useState(null);
  const [savingSection, setSavingSection] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [annualExamIds, setAnnualExamIds] = useState({});
  const [hydrated, setHydrated] = useState({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const physicalExamRef = useRef(null);

  const history = useMemo(
    () => getHistorySummary(records, `${currentExaminer} (Nurse)`),
    [records]
  );

  const rec = records[activeYear];
  const age = computeAge(student.birthday);

  // Next year a student can be admitted to (one past the highest known year).
  const maxYearIndex = yearsList.reduce((max, y) => {
    const idx = yearIndexFromLabel(y.label);
    return idx != null && idx > max ? idx : max;
  }, 0);
  const nextYearLabel = formatYearLabel(maxYearIndex + 1);

  // Fetch header on mount to discover existing annual_exam_ids
  useEffect(() => {
    const sid = student?.id;
    if (!sid) return;
    let cancelled = false;
    async function fetchHeader() {
      try {
        const data = await recordsApi.header(sid);
        if (cancelled) return;
        const hist = data?.annual_exam_history;
        if (Array.isArray(hist)) {
          // Iterate the history rows DIRECTLY (keyed by year_label), so any
          // label outside the fixed Year I-IV set (e.g. "Year V") is kept.
          const nextIds = {};
          const nextYears = [];
          const seenLabels = new Set();
          const patch = {};
          hist.forEach((row) => {
            const yrLabel = row.year_label;
            if (!yrLabel) return;
            if (row.annual_exam_id) nextIds[yrLabel] = row.annual_exam_id;
            if (!seenLabels.has(yrLabel)) {
              seenLabels.add(yrLabel);
              nextYears.push({ key: yrLabel, label: yrLabel, schoolYear: row.school_year ?? null });
            }
            // use backend date_examined to hydrate history status even before physical fetch
            if (row.date_examined) {
              patch[yrLabel] = row.date_examined;
            }
          });
          // Ensure the base 4 years always render even if the backend ever
          // omits one (defensive; current backend always returns them).
          DEFAULT_YEAR_LABELS.forEach((label) => {
            if (!seenLabels.has(label)) {
              seenLabels.add(label);
              nextYears.push({ key: label, label, schoolYear: DEFAULT_YEAR_SCHOOL_YEAR[label] ?? null });
            }
          });
          setAnnualExamIds(nextIds);
          setYearsList(nextYears);
          setRecords((prev) => {
            const next = { ...prev };
            nextYears.forEach((y) => {
              if (!next[y.key]) next[y.key] = { ...createEmptyYearRecord(), schoolYear: y.schoolYear };
            });
            for (const [k, d] of Object.entries(patch)) {
              next[k] = { ...next[k], dateExamined: d ? String(d).slice(0, 10) : next[k].dateExamined };
            }
            return next;
          });
          setActiveYear((prev) =>
            nextYears.some((y) => y.key === prev) ? prev : nextYears[0]?.key ?? null
          );
        }
      } catch {
        // keep sample fallback
      }
    }
    fetchHeader();
    return () => { cancelled = true; };
  }, [student?.id]);

  // Hydrate active year from backend when an exam id exists and not yet hydrated
  useEffect(() => {
    const examId = annualExamIds[activeYear];
    if (!examId || hydrated[activeYear]) return;
    let cancelled = false;
    async function hydrate() {
      try {
        const [phys, lab, diag] = await Promise.all([
          recordsApi.physicalExam(examId).catch(() => null),
          recordsApi.labResults(examId).catch(() => null),
          recordsApi.diagnosis(examId).catch(() => null),
        ]);
        if (cancelled) return;
        setRecords((prev) => {
          const cur = prev[activeYear];
          let next = { ...cur };

          if (phys && typeof phys === "object" && !Array.isArray(phys) && Object.keys(phys).length) {
            next = {
              ...next,
              dateExamined: phys.examined_at ? String(phys.examined_at).slice(0, 10) : next.dateExamined,
              bp: phys.blood_pressure ?? next.bp,
              cr: phys.cardiac_rate != null ? String(phys.cardiac_rate) : next.cr,
              rr: phys.respiratory_rate != null ? String(phys.respiratory_rate) : next.rr,
              temperature: phys.temperature != null ? String(phys.temperature) : next.temperature,
              weight: phys.weight_kg != null ? String(phys.weight_kg) : next.weight,
              height: phys.height_cm != null ? String(phys.height_cm) : next.height,
              visualAcuity: phys.visual_acuity ?? next.visualAcuity,
              othersSpecify: phys.other_findings_label ?? next.othersSpecify,
              generalRemarks: phys.general_remarks ?? next.generalRemarks,
              finalAssessment: phys.final_assessment ?? next.finalAssessment,
              findings: {
                skin: phys.skin_result ?? next.findings.skin,
                heent: phys.heent_result ?? next.findings.heent,
                heart: phys.heart_result ?? next.findings.heart,
                abdomen: phys.abdomen_result ?? next.findings.abdomen,
                extremities: phys.extremities_result ?? next.findings.extremities,
                others: phys.other_findings_result ?? next.findings.others,
              },
              findingsRemarks: {
                skin: phys.skin_remarks ?? next.findingsRemarks.skin,
                heent: phys.heent_remarks ?? next.findingsRemarks.heent,
                heart: phys.heart_remarks ?? next.findingsRemarks.heart,
                abdomen: phys.abdomen_remarks ?? next.findingsRemarks.abdomen,
                extremities: phys.extremities_remarks ?? next.findingsRemarks.extremities,
                others: phys.other_findings_remarks ?? next.findingsRemarks.others,
              },
            };
            if (phys.examined_at) {
              next.dateExamined = String(phys.examined_at).slice(0, 10);
            }
          }

          if (lab && typeof lab === "object" && !Array.isArray(lab) && Object.keys(lab).length) {
            // lab may contain chest_xrays array via embedded relation
            const chest = Array.isArray(lab.chest_xrays) ? lab.chest_xrays[0] : lab.chest_xray || lab.chest_xrays;
            const chestRow = chest && typeof chest === "object" ? chest : null;
            next = {
              ...next,
              cbc: {
                date: lab.cbc_date ? String(lab.cbc_date).slice(0, 10) : next.cbc.date,
                hemoglobin: lab.hemoglobin != null ? String(lab.hemoglobin) : next.cbc.hemoglobin,
                hematocrit: lab.hematocrit != null ? String(lab.hematocrit) : next.cbc.hematocrit,
                wbc: lab.wbc != null ? String(lab.wbc) : next.cbc.wbc,
                plateletCount: lab.platelet_count != null ? String(lab.platelet_count) : next.cbc.plateletCount,
                bloodType: lab.blood_type ?? next.cbc.bloodType,
              },
              urinalysis: {
                date: lab.urinalysis_date ? String(lab.urinalysis_date).slice(0, 10) : next.urinalysis.date,
                glucose: lab.glucose ?? next.urinalysis.glucose,
                protein: lab.protein ?? next.urinalysis.protein,
              },
              otherLabType: lab.other_examination_type ?? next.otherLabType,
              chestXray: {
                date: chestRow?.chest_xray_date ? String(chestRow.chest_xray_date).slice(0, 10) : (lab.chest_xray_date ? String(lab.chest_xray_date).slice(0, 10) : next.chestXray.date),
                result: chestRow?.chest_xray_result ?? lab.chest_xray_result ?? next.chestXray.result,
                remarks: chestRow?.chest_xray_notes ?? lab.chest_xray_notes ?? next.chestXray.remarks,
              },
            };
            // try to restore otherLabDetails if it was stored as JSON
            if (lab.other_results) {
              try {
                const parsed = JSON.parse(lab.other_results);
                if (parsed && parsed.details) {
                  next.otherLabDetails = parsed.details;
                  if (Array.isArray(parsed.extra)) next.extraLabOthers = parsed.extra;
                }
              } catch {
                // plain text — keep as is
              }
            }
          }

          if (diag && typeof diag === "object" && !Array.isArray(diag) && Object.keys(diag).length) {
            next = {
              ...next,
              diagnosis: diag.diagnosis ?? next.diagnosis,
              finalRemark: diag.final_remark ?? next.finalRemark,
              diagnosisNormalFindingsChecked: diag.is_essentially_normal ?? next.diagnosisNormalFindingsChecked,
            };
          }

          return { ...prev, [activeYear]: next };
        });
        setHydrated((p) => ({ ...p, [activeYear]: true }));
      } catch {
        setHydrated((p) => ({ ...p, [activeYear]: true }));
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [activeYear, annualExamIds, hydrated]);

  function updateRecord(patch) {
    setRecords((prev) => ({ ...prev, [activeYear]: { ...prev[activeYear], ...patch } }));
  }

  function updateFinding(key, value) {
    updateRecord({ findings: { ...rec.findings, [key]: value } });
  }

  function updateFindingRemark(key, value) {
    updateRecord({ findingsRemarks: { ...rec.findingsRemarks, [key]: value } });
  }

  function addExtraOthersFinding() {
    updateRecord({
      extraOthersFindings: [
        ...rec.extraOthersFindings,
        { id: `${Date.now()}-${Math.random()}`, specify: "", result: "Normal", remarks: "" },
      ],
    });
  }

  function updateExtraOthersFinding(id, patch) {
    updateRecord({
      extraOthersFindings: rec.extraOthersFindings.map((row) =>
        row.id === id ? { ...row, ...patch } : row
      ),
    });
  }

  function removeExtraOthersFinding(id) {
    updateRecord({ extraOthersFindings: rec.extraOthersFindings.filter((row) => row.id !== id) });
  }

  function addExtraLabOther() {
    updateRecord({
      extraLabOthers: [
        ...rec.extraLabOthers,
        { id: `${Date.now()}-${Math.random()}`, examType: "", details: {} },
      ],
    });
  }

  function updateExtraLabOther(id, examType) {
    updateRecord({
      extraLabOthers: rec.extraLabOthers.map((row) =>
        row.id === id ? { ...row, examType, details: {} } : row
      ),
    });
  }

  function updateExtraLabOtherDetails(id, patch) {
    updateRecord({
      extraLabOthers: rec.extraLabOthers.map((row) =>
        row.id === id ? { ...row, details: { ...row.details, ...patch } } : row
      ),
    });
  }

  function removeExtraLabOther(id) {
    updateRecord({ extraLabOthers: rec.extraLabOthers.filter((row) => row.id !== id) });
  }

  function updateOtherLabType(examType) {
    updateRecord({ otherLabType: examType, otherLabDetails: {} });
  }

  function updateOtherLabDetails(patch) {
    updateRecord({ otherLabDetails: { ...rec.otherLabDetails, ...patch } });
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

  async function ensureAnnualExamId(yearLabel) {
    const existing = annualExamIds[yearLabel];
    if (existing) return existing;
    const yearObj = yearsList.find((y) => y.key === yearLabel);
    const school_year = yearObj?.schoolYear ?? null;
    const created = await recordsApi.addAnnualExam(student.id, {
      year_label: yearLabel,
      school_year,
      date_examined: records[yearLabel]?.dateExamined || null,
    });
    const newId = created?.annual_exam_id ?? created?.annualExamId ?? created?.id;
    if (!newId) throw new Error("Failed to create annual examination");
    setAnnualExamIds((prev) => ({ ...prev, [yearLabel]: newId }));
    return newId;
  }

  function flashSaved(section) {
    setSavedSection(section);
    setSaveError(null);
    window.setTimeout(() => setSavedSection((s) => (s === section ? null : s)), 2000);
  }

  async function handleSavePhysical() {
    setSaveError(null);
    setSavingSection("physical");
    try {
      const examId = await ensureAnnualExamId(activeYear);
      await recordsApi.savePhysicalExam(examId, buildPhysicalPayload(records[activeYear]));
      // lab requires physical first — keep hydrated so lab fetch works next time
      setHydrated((p) => ({ ...p, [activeYear]: true }));
      // ensure header reflects new exam
      setRecords((prev) => {
        const cur = prev[activeYear];
        // if dateExamined was empty, backend will have stored provided date; reflect cleared status via date
        return prev;
      });
      flashSaved("physical");
    } catch (e) {
      setSaveError(e.message || "Failed to save physical examination");
    } finally {
      setSavingSection(null);
    }
  }

  async function handleSaveLab() {
    setSaveError(null);
    setSavingSection("lab");
    try {
      const examId = await ensureAnnualExamId(activeYear);
      // lab endpoint requires physical_examinations to exist first
      await recordsApi.savePhysicalExam(examId, buildPhysicalPayload(records[activeYear])).catch(() => {});
      await recordsApi.saveLabResults(examId, buildLabPayload(records[activeYear]));
      flashSaved("lab");
    } catch (e) {
      setSaveError(e.message || "Failed to save lab results");
    } finally {
      setSavingSection(null);
    }
  }

  async function handleSaveDiagnosis() {
    setSaveError(null);
    setSavingSection("diagnosis");
    try {
      const cur = records[activeYear];
      const yearLabel = activeYear;
      saveCertificateDefaults(student.id, {
        diagnosis: cur.diagnosis,
        finalRemark: cur.finalRemark,
        normalFindingsChecked: cur.diagnosisNormalFindingsChecked,
        yearLabel,
      });
      const examId = await ensureAnnualExamId(activeYear);
      // ensure physical exists for lab/diagnosis flow — no-op if already there
      await recordsApi.savePhysicalExam(examId, buildPhysicalPayload(cur)).catch(() => {});
      await recordsApi.saveDiagnosis(examId, buildDiagnosisPayload(cur));
      // reflect cleared-ish status locally by ensuring dateExamined is set
      if (!cur.dateExamined) {
        const today = new Date().toISOString().slice(0, 10);
        setRecords((prev) => ({ ...prev, [activeYear]: { ...prev[activeYear], dateExamined: today } }));
      }
      flashSaved("diagnosis");
    } catch (e) {
      setSaveError(e.message || "Failed to save diagnosis");
    } finally {
      setSavingSection(null);
    }
  }

  function handleAddAnnualExamination() {
    setAddModalOpen(true);
  }

  async function handleAddAnnualExamSubmit(yearLabel, schoolYear) {
    const created = await recordsApi.addAnnualExam(student.id, {
      year_label: yearLabel,
      school_year: schoolYear,
      date_examined: null,
    });
    const newId = created?.annual_exam_id ?? created?.annualExamId ?? created?.id;
    if (!newId) throw new Error("Failed to create annual examination");
    setAnnualExamIds((prev) => ({ ...prev, [yearLabel]: newId }));
    setYearsList((prev) =>
      prev.some((y) => y.key === yearLabel)
        ? prev
        : [...prev, { key: yearLabel, label: yearLabel, schoolYear }]
    );
    setRecords((prev) => ({
      ...prev,
      [yearLabel]: { ...createEmptyYearRecord(), schoolYear },
    }));
    setActiveYear(yearLabel);
    setAddModalOpen(false);
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

      {/* ---------- annual examination history ---------- */}
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

        <div className="grid grid-cols-2 md:flex md:flex-col gap-2 md:w-52 shrink-0">
          <button
            onClick={() => navigate(`/admin/masterlist/${student.id}/medical-certificate?year=${activeYear}`, { state: { year: activeYear } })}
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

      {/* ---------- year tabs ---------- */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
        {yearsList.map((y) => (
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

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {saveError}
        </div>
      )}

      {/* ---------- physical examinations ---------- */}
      <section ref={physicalExamRef} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6">
        <SectionHeader
          icon="user"
          title="Physical Examinations"
          subtitle="Record of the student's annual physical examination"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  {rec.extraOthersFindings.map((row) => (
                    <tr key={row.id} className="border-t border-gray-200">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-gray-700">Others</span>
                          <input
                            value={row.specify}
                            onChange={(e) => updateExtraOthersFinding(row.id, { specify: e.target.value })}
                            placeholder="Specify"
                            className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-gc-accent placeholder:text-gray-400"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <ResultSelect
                          value={row.result}
                          onChange={(e) => updateExtraOthersFinding(row.id, { result: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={row.remarks}
                            onChange={(e) => updateExtraOthersFinding(row.id, { remarks: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-gc-accent"
                          />
                          <button
                            type="button"
                            onClick={() => removeExtraOthersFinding(row.id)}
                            aria-label="Remove this finding"
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500"
                          >
                            <NavIcon name="x" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="py-2 px-3">
                      <button
                        type="button"
                        onClick={addExtraOthersFinding}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gc-green text-white px-3 py-1.5 rounded-lg hover:opacity-90"
                      >
                        + Add
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <SaveButton onClick={handleSavePhysical} saved={savedSection === "physical"} saving={savingSection === "physical"}>
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
                onChange={(e) => updateOtherLabType(e.target.value)}
              />
            </div>
            <LabOtherDynamicFields
              examType={rec.otherLabType}
              details={rec.otherLabDetails}
              onChange={updateOtherLabDetails}
            />

            {rec.extraLabOthers.map((row) => (
              <div key={row.id} className="mt-4 pt-4 border-t border-gray-100">
                <div className="max-w-xs flex items-end gap-2">
                  <div className="flex-1">
                    <SelectInput
                      label="Examination Type"
                      placeholder="Select"
                      options={labExamTypeOptions}
                      value={row.examType}
                      onChange={(e) => updateExtraLabOther(row.id, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExtraLabOther(row.id)}
                    aria-label="Remove this examination"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  >
                    <NavIcon name="x" className="w-4 h-4" />
                  </button>
                </div>
                <LabOtherDynamicFields
                  examType={row.examType}
                  details={row.details}
                  onChange={(patch) => updateExtraLabOtherDetails(row.id, patch)}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addExtraLabOther}
              className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gc-green text-white px-3 py-1.5 rounded-lg hover:opacity-90"
            >
              + Add
            </button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-200">
          <SaveButton onClick={handleSaveLab} saved={savedSection === "lab"} saving={savingSection === "lab"}>
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

        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={rec.diagnosisNormalFindingsChecked}
              onChange={(e) => updateRecord({ diagnosisNormalFindingsChecked: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-gc-green focus:ring-gc-accent"
            />
            Essentially normal physical findings at the time of evaluation
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <SaveButton
            onClick={handleSaveDiagnosis}
            saved={savedSection === "diagnosis"}
            saving={savingSection === "diagnosis"}
          >
            Save Record
          </SaveButton>
        </div>
      </section>

      {addModalOpen && (
        <AddAnnualExamModal
          nextYearLabel={nextYearLabel}
          initialSchoolYear={nextSchoolYear(yearsList)}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddAnnualExamSubmit}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

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
