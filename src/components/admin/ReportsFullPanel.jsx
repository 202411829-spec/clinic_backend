// src/components/admin/ReportsFullPanel.jsx
import { useMemo, useState } from "react";
import NavIcon from "./NavIcon";
import PeriodDropdown from "./PeriodDropdown";
import { getReportData } from "../../data/reportsSample";
import { departmentOptions } from "../../data/masterlistSample";
import { formatMDY, getPeriodLabel, shiftByPeriod } from "../../lib/calendar";

function StatCard({ title, rows }) {
  return (
    <div className="border border-gray-300 rounded-2xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-300 px-4 py-2.5">
        <span className="text-xs font-bold tracking-wide text-gc-green uppercase">{title}</span>
      </div>
      <div className="divide-y divide-gray-200 px-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 text-sm py-2.5">
            <span className="text-gray-800 font-semibold">{r.label}</span>
            <span className="text-gray-500 text-right whitespace-nowrap">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsFullPanel() {
  const [date, setDate] = useState(new Date(2026, 5, 7));
  const [period, setPeriod] = useState("Day");
  const [department, setDepartment] = useState("All Departments");
  const [downloading, setDownloading] = useState(false);

  // NOTE: getReportData is still placeholder data (see src/data/reportsSample.js).
  // Once real aggregation queries are wired up, pass `period` through so the
  // backend can bucket by day/week/month/semester/academic year/year/all-time.
  const data = useMemo(() => getReportData(date, department, period), [date, department, period]);

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
      const doc = new jsPDF();
      let y = 18;

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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 md:p-6 print:shadow-none print:border-none">
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
          <div className="flex items-center gap-2 max-w-[320px]">
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(-1)}
                aria-label={`Previous ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <NavIcon name="chevron-left" className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1 flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 whitespace-nowrap">
              <NavIcon name="calendar" className="w-4 h-4 text-gc-green shrink-0" />
              {periodLabel}
            </div>
            {period !== "All Time" && (
              <button
                onClick={() => shiftDay(1)}
                aria-label={`Next ${period.toLowerCase()}`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <NavIcon name="chevron-right" className="w-4 h-4" />
              </button>
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
              {departmentOptions.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* print-only date/department line, since the controls above are hidden when printing */}
        <p className="hidden print:block text-sm text-gray-600 mb-4">
          {periodLabel} — {department}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <StatCard title={data.status.title} rows={data.status.rows} />
            <StatCard title={data.reason.title} rows={data.reason.rows} />
            <StatCard title={data.department.title} rows={data.department.rows} />
          </div>
          <div className="space-y-4">
            <StatCard title={data.complaint.title} rows={data.complaint.rows} />
            <StatCard title={data.sex.title} rows={data.sex.rows} />
            <StatCard title={data.age.title} rows={data.age.rows} />
          </div>
        </div>
      </div>
    </section>
  );
}
