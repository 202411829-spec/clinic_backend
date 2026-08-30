// src/components/admin/ReportsFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import PeriodDropdown from "./PeriodDropdown";
import SelectDateCalendar from "./SelectDateCalendar";
import Letterhead from "./Letterhead.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { masterlistApi, reportsApi } from "../../lib/api.js";
import { formatMDY, getPeriodLabel, shiftByPeriod, toYMD } from "../../lib/calendar";
import { pdfLetterhead } from "../../lib/pdf.js";

// ─── Colour tokens (reuse brand palette, no new primaries) ───────────
const GREEN_LIGHT = "bg-gc-green/10";
const GREEN_TEXT = "text-gc-green";
const BAR_TRACK = "bg-gray-100";

// ─── Accent palette for variety across bars ───────────────────────────
const ACCENTS = [
  "bg-gc-green",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-green-400",
  "bg-gc-accent",
  "bg-emerald-400",
];

// ─── Data shape the panel renders ─────────────────────────────────────
const EMPTY_DATA = {
  status: { title: "Total", rows: [] },
  reason: { title: "Reason", rows: [] },
  department: { title: "Department", rows: [] },
  complaint: { title: "Complaint", rows: [] },
  sex: { title: "Sex", rows: [] },
  age: { title: "Age", rows: [] },
};

function pct(breakdown) {
  return `${breakdown.count} (${breakdown.percent}% of total)`;
}

function mapResponse(json) {
  const data = JSON.parse(JSON.stringify(EMPTY_DATA));
  data.status.rows = [
    { label: "Total Students", value: String(json.total_students ?? 0) },
    ...(json.status_breakdown || []).map((b) => ({ label: b.label, value: pct(b) })),
  ];
  data.reason.rows = (json.reason_breakdown || []).map((b) => ({
    label: b.label,
    value: pct(b),
    count: b.count,
    percent: b.percent,
  }));
  data.department.rows = (json.department_breakdown || []).map((b) => ({
    label: b.label,
    value: pct(b),
    count: b.count,
    percent: b.percent,
  }));
  data.complaint.rows = (json.complaint_breakdown || [])
    .filter((b) => String(b.label).trim().toLowerCase() !== "no complaint logged")
    .map((b) => ({
      label: b.label,
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  data.sex.rows = (json.sex_breakdown || []).map((b) => ({
    label: b.label,
    value: pct(b),
    count: b.count,
    percent: b.percent,
  }));
  data.age.rows = (json.age_breakdown || []).map((b) => ({
    label: String(b.label),
    value: pct(b),
    count: b.count,
    percent: b.percent,
  }));
  return data;
}

// ─── KPI summary card ─────────────────────────────────────────────────
function KpiCard({ label, value, badge, icon }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 flex items-center gap-4 animate-fade-in-up">
      {icon && (
        <span className={`w-11 h-11 rounded-xl ${GREEN_LIGHT} ${GREEN_TEXT} flex items-center justify-center shrink-0`}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wider text-gray-400 uppercase mb-1">{label}</p>
        <p className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-none truncate">{value}</p>
        {badge && (
          <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gc-green/10 text-gc-green">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Breakdown card with horizontal progress bars ─────────────────────
function BreakdownCard({ title, rows, accentIndex = 0 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up print:rounded-lg print:break-inside-avoid">
      {/* Card header */}
      <div className="border-b border-gray-100 px-5 py-3">
        <span className="text-xs font-bold tracking-wider text-gray-400 uppercase">{title}</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-50 px-5 py-2">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">No data available</p>
        )}
        {rows.map((r, i) => {
          const widthPct = r.percent || 0;
          const barColor = ACCENTS[(accentIndex + i) % ACCENTS.length];
          return (
            <div key={r.label} className="py-3 group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 truncate pr-2">{r.label}</span>
                <span className="text-xs font-semibold text-gray-500 shrink-0 tabular-nums">
                  {r.count ?? r.value}
                  {r.percent != null && (
                    <span className="text-gray-400 ml-1">({r.percent}%)</span>
                  )}
                </span>
              </div>
              {/* Progress bar */}
              <div className={`h-2 rounded-full ${BAR_TRACK} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────
export default function ReportsFullPanel() {
  const [date, setDate] = useState(new Date());
  const [period, setPeriod] = useState("Day");
  const [department, setDepartment] = useState("All Departments");
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(EMPTY_DATA);
  const [downloading, setDownloading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  // Real department list for the filter dropdown.
  useEffect(() => {
    masterlistApi
      .listDepartments()
      .then((rows) =>
        setDepartments(
          (rows || []).map((r) => ({
            id: r.department_id,
            name: r.department_name,
          }))
        )
      )
      .catch(() => {});
  }, []);

  // Real report data for the selected date (+ department filter).
  useEffect(() => {
    let cancelled = false;
    const deptId =
      department === "All Departments"
        ? undefined
        : departments.find((d) => d.name === department)?.id;
    reportsApi
      .get({ date: toYMD(date), department_id: deptId })
      .then((json) => {
        if (!cancelled) setData(mapResponse(json));
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load report:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [date, department, departments]);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  const periodLabel = useMemo(() => getPeriodLabel(date, period), [date, period]);

  // KPI derived values
  const totalConsultations = data.status.rows.length > 0
    ? data.status.rows.reduce((sum, r) => sum + (parseInt(r.value, 10) || 0), 0)
    : 0;
  const totalStudents = data.status.rows.length > 0
    ? (parseInt(data.status.rows[0]?.value, 10) || 0)
    : 0;
  const topComplaint = useMemo(() => {
    if (data.complaint.rows.length === 0) return "—";
    const sorted = [...data.complaint.rows].sort((a, b) => (b.percent || 0) - (a.percent || 0));
    return sorted[0]?.label || "—";
  }, [data.complaint.rows]);

  function shiftDay(delta) {
    setDate((prev) => shiftByPeriod(prev, period, delta));
  }

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 18;

      y = pdfLetterhead(doc, y);

      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Clinic Report", 14, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Period: ${period} (${periodLabel})`, 14, y);
      y += 5;
      doc.text(`Department: ${department}`, 14, y);
      y += 10;

      const sections = [data.status, data.reason, data.department, data.complaint, data.sex, data.age];

      sections.forEach((section) => {
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text(section.title, 14, y);
        y += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        section.rows.forEach((row) => {
          doc.text(row.label, 18, y);
          doc.text(String(row.value), 120, y);
          y += 5.5;
        });
        y += 4;
      });

      doc.save(`clinic-report-${formatMDY(date).replaceAll("/", "-")}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="bg-gray-50/50 rounded-2xl p-4 md:p-6 print:shadow-none print:border-none print-a4-portrait">
      {/* print-only formal letterhead */}
      <Letterhead />
      <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
        CLINIC REPORT
      </h2>

      {/* ─── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="chart" className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-bold text-gc-green text-lg md:text-xl leading-tight">
              Reports
            </h1>
            <p className="text-xs text-gray-400 leading-tight">Clinic analytics &amp; statistics</p>
          </div>
        </div>
      </div>

      {/* ─── Filter toolbar ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 md:p-4 mb-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Date navigator */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0" ref={pickerRef}>
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(-1)}
                aria-label={`Previous ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <NavIcon name="chevron-left" className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => period !== "All Time" && setPickerOpen((v) => !v)}
              aria-haspopup={period !== "All Time" ? "dialog" : undefined}
              aria-expanded={pickerOpen}
              className={`flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 whitespace-nowrap min-w-0 ${
                period !== "All Time" ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
              }`}
            >
              <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
              <span className="truncate">{periodLabel}</span>
            </button>
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(1)}
                aria-label={`Next ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <NavIcon name="chevron-right" className="w-4 h-4" />
              </button>
            )}

            {pickerOpen && (
              <div className="absolute left-0 top-full mt-2 z-30 w-[320px]">
                <SelectDateCalendar
                  selectedDate={date}
                  onSelectDate={(d) => {
                    setDate(d);
                    setPickerOpen(false);
                  }}
                  onNavigate={setDate}
                />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-8 bg-gray-200 shrink-0" />

          {/* Period + Department filters */}
          <div className="flex items-center gap-2">
            <PeriodDropdown value={period} onChange={setPeriod} />
            <UniversalDropdown
              value={department}
              onChange={setDepartment}
              options={["All Departments", ...departments.map((d) => d.name)]}
              className="w-full sm:w-48"
            />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-8 bg-gray-200 shrink-0" />

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <NavIcon name="printer" className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2 rounded-xl hover:bg-gc-green-600 disabled:opacity-60 transition-colors"
            >
              <NavIcon name="download" className="w-4 h-4" />
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* Print-only date/department line */}
        <p className="hidden print:block text-sm text-gray-600 mb-4">
          {periodLabel} — {department}
        </p>
      </div>

      {/* ─── KPI summary row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <KpiCard
          label="Total Consultations"
          value={totalConsultations.toLocaleString()}
          icon={<NavIcon name="chart" className="w-5 h-5" />}
        />
        <KpiCard
          label="Total Students"
          value={totalStudents.toLocaleString()}
          icon={<NavIcon name="user" className="w-5 h-5" />}
        />
        <KpiCard
          label="Top Complaint"
          value={topComplaint}
          badge={topComplaint !== "—" ? `${data.complaint.rows[0]?.percent ?? 0}% of total` : undefined}
          icon={<NavIcon name="feedback" className="w-5 h-5" />}
        />
      </div>

      {/* ─── Breakdown cards grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-2">
        <BreakdownCard title="Reason for Visit" rows={data.reason.rows} accentIndex={0} />
        <BreakdownCard title="Complaint" rows={data.complaint.rows} accentIndex={1} />
        <BreakdownCard title="Department" rows={data.department.rows} accentIndex={2} />
        <BreakdownCard title="Sex" rows={data.sex.rows} accentIndex={3} />
        <BreakdownCard title="Age Group" rows={data.age.rows} accentIndex={4} />
      </div>
    </section>
  );
}
