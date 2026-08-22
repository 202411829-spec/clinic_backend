// src/components/admin/ReportsFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import PeriodDropdown from "./PeriodDropdown";
import SelectDateCalendar from "./SelectDateCalendar";
import { masterlistApi, reportsApi } from "../../lib/api.js";
import { formatMDY, getPeriodLabel, shiftByPeriod } from "../../lib/calendar";

import gordonCollegeSeal from "../../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../../assets/certificate/osws-seal.png";
import healthServicesSeal from "../../assets/certificate/health-services-seal.png";

// Shape the panel renders; filled in from GET /api/reports/?date=...
const EMPTY_DATA = {
  status: { title: "Total", rows: [] },
  reason: { title: "Reason", rows: [] },
  department: { title: "Department", rows: [] },
  complaint: { title: "Complaint", rows: [] },
  sex: { title: "Sex", rows: [] },
  age: { title: "Age", rows: [] },
};

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pct(breakdown) {
  return `${breakdown.count} (${breakdown.percent}% of total)`;
}

function mapResponse(json) {
  const data = JSON.parse(JSON.stringify(EMPTY_DATA));
  data.status.rows = [
    { label: "Total Students", value: String(json.total_students ?? 0) },
    ...(json.status_breakdown || []).map((b) => ({ label: b.label, value: pct(b) })),
  ];
  data.reason.rows = (json.reason_breakdown || []).map((b) => ({ label: b.label, value: pct(b) }));
  data.department.rows = (json.department_breakdown || []).map((b) => ({ label: b.label, value: pct(b) }));
  data.complaint.rows = (json.complaint_breakdown || []).map((b) => ({ label: b.label, value: pct(b) }));
  data.sex.rows = (json.sex_breakdown || []).map((b) => ({ label: b.label, value: pct(b) }));
  data.age.rows = (json.age_breakdown || []).map((b) => ({
    label: String(b.label),
    value: pct(b),
  }));
  return data;
}

function StatCard({ title, rows }) {
  return (
    <div className="border border-gray-300 rounded-2xl overflow-hidden print:rounded-lg print:break-inside-avoid">
      <div className="bg-gray-50 border-b border-gray-300 px-4 py-2.5 print:px-3 print:py-1.5">
        <span className="text-xs font-bold tracking-wide text-gc-green uppercase">{title}</span>
      </div>
      <div className="divide-y divide-gray-200 px-4 print:px-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 text-sm py-2.5 print:py-1.5">
            <span className="text-gray-800 font-semibold">{r.label}</span>
            <span className="text-gray-500 text-right whitespace-nowrap">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("GORDON COLLEGE", 105, y, { align: "center" });
      y += 5;
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text("Office of Student Welfare and Service — Health Services Unit", 105, y, { align: "center" });
      y += 10;

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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none print-a4-portrait">
      {/* print-only formal letterhead, matching the Medical Certificate header */}
      <div className="hidden print:flex items-center gap-3 mb-4 pb-4 border-b border-gray-300">
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
      <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
        CLINIC REPORT
      </h2>

      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="chart" className="w-4 h-4" />
          </span>
          <div>
            <h1 className="font-bold text-gc-green text-base md:text-lg leading-tight">
              Reports
            </h1>
            <p className="text-xs text-gray-400 leading-tight">View statistics report.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 text-base font-semibold text-gray-700 border border-gray-300 px-5 py-3 rounded-xl hover:bg-gray-50"
          >
            <NavIcon name="printer" className="w-5 h-5" />
            Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 text-base font-semibold bg-gc-green text-white px-5 py-3 rounded-xl hover:bg-gc-green-600 disabled:opacity-60"
          >
            <NavIcon name="download" className="w-5 h-5" />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="border border-gray-300 rounded-2xl p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5 print:hidden">
          <div className="flex items-center gap-2 max-w-[320px] relative" ref={pickerRef}>
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(-1)}
                aria-label={`Previous ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <NavIcon name="chevron-left" className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => period !== "All Time" && setPickerOpen((v) => !v)}
              aria-haspopup={period !== "All Time" ? "dialog" : undefined}
              aria-expanded={pickerOpen}
              className={`flex-1 flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 whitespace-nowrap ${
                period !== "All Time" ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
              }`}
            >
              <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
              {periodLabel}
            </button>
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(1)}
                aria-label={`Next ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
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
                />
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <PeriodDropdown value={period} onChange={setPeriod} />
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 md:w-56"
            >
              <option>All Departments</option>
              {departments.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* print-only date/department line, since the controls above are hidden when printing */}
        <p className="hidden print:block text-sm text-gray-600 mb-4">
          {periodLabel} — {department}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-2">
          <div className="space-y-4 print:space-y-2">
            <StatCard title={data.status.title} rows={data.status.rows} />
            <StatCard title={data.reason.title} rows={data.reason.rows} />
            <StatCard title={data.department.title} rows={data.department.rows} />
          </div>
          <div className="space-y-4 print:space-y-2">
            <StatCard title={data.complaint.title} rows={data.complaint.rows} />
            <StatCard title={data.sex.title} rows={data.sex.rows} />
            <StatCard title={data.age.title} rows={data.age.rows} />
          </div>
        </div>
      </div>
    </section>
  );
}
