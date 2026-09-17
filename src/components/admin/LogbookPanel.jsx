// src/components/admin/LogbookPanel.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import Letterhead from "./Letterhead.jsx";
import Pagination from "../Pagination.jsx";
import WalkInVisitForm from "./WalkInVisitForm.jsx";
import useWalkInForm from "./useWalkInForm.js";
import { logbookApi } from "../../lib/api.js";
import { isoToMDY } from "../../lib/calendar.js";
import { pdfLetterhead } from "../../lib/pdf.js";

// Backend dateTime is formatted as "MM/DD/YYYY h:mm AM" (or "MM/DD/YYYY HH:MM"
// for the created_at fallback) — normalize to "YYYY-MM-DD" so the date
// filters can compare ranges as plain strings.
function toISODate(value) {
  const s = String(value || "");
  const m = s.slice(0, 10).split("/");
  if (m.length !== 3) return "";
  const mm = m[0];
  const dd = m[1];
  const yyyy = m[2];
  if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd) || !/^\d{4}$/.test(yyyy)) return "";
  return `${yyyy}-${mm}-${dd}`;
}

// Backend deptCourse is "Course - Department" (course first). Try the known
// dash variants so course/dept filters match against loaded rows regardless
// of which separator the formatting path happened to use.
function splitDeptCourse(value) {
  const text = String(value || "");
  for (const sep of [" - ", " — ", " – ", " -", "- "]) {
    if (text.includes(sep)) {
      const parts = text.split(sep);
      return { course: (parts[0] || "").trim(), dept: (parts[1] || "").trim() };
    }
  }
  return { course: text.trim(), dept: "" };
}

function mapEntry(r) {
  const parsed = r.deptCourse && r.deptCourse !== "-" ? splitDeptCourse(r.deptCourse) : {};
  const dept = r.dept || parsed.dept || "-";
  const course = r.course || parsed.course || "-";
  const deptCourse = r.deptCourse || (course !== "-" ? `${course} - ${dept}` : "-");
  return {
    id: r.id ?? r.log_id,
    dateTime: r.dateTime || "-",
    dateISO: toISODate(r.dateTime),
    studentId: r.student_id ?? "-",
    name: r.name || "-",
    age: r.age ?? "-",
    dept,
    course,
    deptCourse,
    sex: r.sex || "-",
    reason: r.reason || "-",
    complaint: r.complaint || "-",
    medicine: r.medicine || "-",
  };
}

const PDF_TABLE_HEADERS = ["Date & Time", "Name", "Age", "Dept. / Course", "Sex", "Reason", "Complaint", "Medicine"];

function pdfCellLines(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text ?? ""), maxWidth).slice(0, 3);
}

export default function LogbookPanel({
  reasonRecords = [],
  medicineRecords = [],
}) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);

  // Derived for dropdowns
  const reasons = useMemo(() => reasonRecords.map((r) => r.description), [reasonRecords]);
  const medicines = useMemo(() => medicineRecords.map((m) => m.medicine_name), [medicineRecords]);

  // Recent visits for the dashboard widget. Reasons/medicines are provided
  // by the parent Dashboard via props (fetched once, shared).
  useEffect(() => {
    logbookApi
      .list()
      .then((res) => setEntries((res?.logbook || []).slice(0, 5).map(mapEntry)))
      .catch((err) => console.error("Failed to load logbook:", err));
  }, []);

  // Walk-in form — shared hook encapsulates all walk-in state + handlers
  const walkIn = useWalkInForm({
    reasonRecords,
    medicineRecords,
    onSubmit: async (payload) => {
      await logbookApi.createWalkIn(payload);
      const res = await logbookApi.list();
      setEntries((res?.logbook || []).slice(0, 5).map(mapEntry));
    },
  });

  // Search and filter state
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [course, setCourse] = useState("All Course");
  const [reasonFilter, setReasonFilter] = useState("All Reason");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Derive departments and courses from entries
  const departments = useMemo(() => {
    const set = new Set(entries.map((e) => e.dept).filter((d) => d && d !== "-"));
    return ["All Departments", ...Array.from(set)];
  }, [entries]);

  const courses = useMemo(() => {
    const set = new Set(entries.map((e) => e.course).filter((c) => c && c !== "-"));
    return ["All Course", ...Array.from(set)];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesSearch =
        !q ||
        (e.name || "").toLowerCase().includes(q) ||
        (e.studentId || "").toLowerCase().includes(q) ||
        (e.course || "").toLowerCase().includes(q) ||
        (e.dept || "").toLowerCase().includes(q) ||
        (e.reason || "").toLowerCase().includes(q) ||
        (e.complaint || "").toLowerCase().includes(q) ||
        (e.medicine || "").toLowerCase().includes(q);
      const matchesDept = department === "All Departments" || e.dept === department;
      const matchesCourse = course === "All Course" || e.course === course;
      const matchesReason = reasonFilter === "All Reason" || e.reason === reasonFilter;
      const matchesDate =
        (!dateFrom || (e.dateISO && e.dateISO >= dateFrom)) &&
        (!dateTo || (e.dateISO && e.dateISO <= dateTo));
      return matchesSearch && matchesDept && matchesCourse && matchesReason && matchesDate;
    });
  }, [entries, search, department, course, reasonFilter, dateFrom, dateTo]);

  // Summary of the active filters, shown on the printed page + PDF (mirrors
  // Reports' "period — department" metadata line).
  const dateSummary = dateFrom || dateTo ? `${isoToMDY(dateFrom)} to ${isoToMDY(dateTo)}` : "All Dates";
  const printSummary = `${dateSummary} — ${department} — ${course} — ${reasonFilter}${search ? ` — Search: "${search}"` : ""} — Total: ${filtered.length} entries`;

  const PAGE_SIZE = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function updateFilter(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 14;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const colWidths = [26, 30, 12, 32, 12, 23, 30, 23].map((w) => (w / 188) * usableWidth);
      const cellPad = 2;
      const lineHeight = 3.6;
      const headerHeight = 7;
      const bottomLimit = pageHeight - margin;

      // Letterhead — shared helper.
      let y = pdfLetterhead(doc);

      // Title — mirrors Reports' "Clinic Report" line.
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Clinic Logbook", 14, y);
      y += 8;

      // Metadata — mirrors Reports' "Period:"/"Department:" lines.
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.setTextColor("#000000");
      doc.text(`Date: ${isoToMDY(dateFrom)} to ${isoToMDY(dateTo)}`, 14, y);
      y += 5;
      doc.text(`Department: ${department}`, 14, y);
      y += 5;
      doc.text(`Course: ${course}`, 14, y);
      y += 5;
      doc.text(`Reason: ${reasonFilter}`, 14, y);
      if (search) {
        y += 5;
        doc.text(`Search: ${search}`, 14, y);
      }
      y += 5;
      doc.text(`Total entries: ${filtered.length}`, 14, y);
      y += 8;

      let rowTop = y;
      let pageNum = 1;

      const drawPageNumber = () => {
        doc.setFontSize(7);
        doc.setFont(undefined, "normal");
        doc.setTextColor("#9CA3AF");
        doc.text(String(pageNum), pageWidth / 2, pageHeight - 7, { align: "center" });
      };

      const drawTableHeader = () => {
        doc.setFontSize(7.5);
        doc.setFont(undefined, "bold");
        doc.setFillColor("#F3F4F6");
        doc.rect(margin, rowTop, usableWidth, headerHeight, "F");
        doc.setTextColor("#374151");
        let x = margin;
        PDF_TABLE_HEADERS.forEach((h, i) => {
          doc.text(h, x + cellPad, rowTop + 3.2);
          x += colWidths[i];
        });
        doc.setDrawColor(160);
        doc.setLineWidth(0.2);
        doc.rect(margin, rowTop, usableWidth, headerHeight);
        x = margin;
        for (let i = 0; i < colWidths.length - 1; i++) {
          x += colWidths[i];
          doc.line(x, rowTop, x, rowTop + headerHeight);
        }
        rowTop += headerHeight;
      };

      if (rowTop > bottomLimit - headerHeight) {
        drawPageNumber();
        doc.addPage();
        pageNum += 1;
        rowTop = 18;
      }
      doc.setDrawColor(190);
      doc.setLineWidth(0.15);
      drawTableHeader();

      if (pageRows.length === 0) {
        doc.setFontSize(9);
        doc.setFont(undefined, "normal");
        doc.setTextColor("#000000");
        doc.text("No logbook entries to display.", margin, rowTop + 5);
      }

      pageRows.forEach((entry) => {
        const cells = [
          entry.dateTime,
          entry.name,
          entry.age,
          entry.deptCourse,
          entry.sex,
          entry.reason,
          entry.complaint,
          entry.medicine,
        ];
        const lines = cells.map((c, i) => pdfCellLines(doc, c, colWidths[i] - cellPad * 2));
        const lineCount = Math.max(...lines.map((l) => Math.max(1, l.length)));
        const rowHeight = lineCount * lineHeight + 1.5;

        if (rowTop + rowHeight > bottomLimit) {
          drawPageNumber();
          doc.addPage();
          pageNum += 1;
          rowTop = 18;
          doc.setDrawColor(190);
          doc.setLineWidth(0.15);
          drawTableHeader();
        }

        doc.setFontSize(7.5);
        doc.setFont(undefined, "normal");
        doc.setTextColor("#111827");
        let x = margin;
        lines.forEach((cellLinesList, i) => {
          let ty = rowTop + 3.5;
          cellLinesList.forEach((line) => {
            doc.text(line, x + cellPad, ty);
            ty += lineHeight;
          });
          x += colWidths[i];
        });

        doc.line(margin, rowTop + rowHeight, margin + usableWidth, rowTop + rowHeight);
        x = margin;
        for (let i = 0; i < colWidths.length - 1; i++) {
          x += colWidths[i];
          doc.line(x, rowTop, x, rowTop + rowHeight);
        }

        rowTop += rowHeight;
      });

      drawPageNumber();
      doc.save("logbook-report.pdf");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-panel bg-white shadow-e2 print:shadow-none print:rounded-none print:border-0">
      {/* Print-only: hide every surrounding widget and dashboard chrome so that
          the printed page contains ONLY this widget's table. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #logbook-widget, #logbook-widget * { visibility: visible; }
          #logbook-widget { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-ink-100 px-5 py-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Logbook</h2>
          <p className="text-xs text-ink-500">History of completed clinic visits</p>
        </div>
        <button
          onClick={() => navigate("/admin/logbook")}
          className="rounded-control px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
        >
          View full logbook
        </button>
      </div>

      {/* search + filters + export */}
      <div className="flex flex-col gap-2 px-5 pt-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="flex items-center gap-2 rounded-control border border-ink-200 bg-white px-3 py-2 text-sm text-ink-400 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15">
            <NavIcon name="user" className="w-4 h-4 shrink-0" />
            <input
              value={search}
              onChange={updateFilter(setSearch)}
              placeholder="Search by surname, name, student ID, or course…"
              className="w-full outline-none placeholder:text-ink-400 text-ink-900"
            />
          </div>
          <UniversalDropdown value={department} onChange={(v) => { setDepartment(v); setPage(1); }} options={departments} />
          <UniversalDropdown value={course} onChange={(v) => { setCourse(v); setPage(1); }} options={courses} />
          <UniversalDropdown value={reasonFilter} onChange={(v) => { setReasonFilter(v); setPage(1); }} options={["All Reason", ...reasons]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={updateFilter(setDateFrom)}
              className="rounded-control border border-ink-200 px-3 py-2 text-sm text-ink-700 bg-white focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={updateFilter(setDateTo)}
              className="rounded-control border border-ink-200 px-3 py-2 text-sm text-ink-700 bg-white focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="btn-press inline-flex items-center gap-1.5 text-xs font-medium text-ink-700 border border-ink-200 px-3 py-2 rounded-control hover:bg-ink-50"
            >
              <NavIcon name="printer" className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="btn-press inline-flex items-center gap-1.5 text-xs font-medium bg-brand-900 text-white px-3 py-2 rounded-control shadow-e1 hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <NavIcon name="download" className="w-4 h-4" />
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* table — scrolls horizontally on mobile only; on desktop it just fits the panel width */}
      <div id="logbook-widget" className="overflow-x-auto md:overflow-x-visible px-5 pt-4 print:overflow-visible print:px-0 print:pt-0">
        {/* print-only formal letterhead — shared component */}
        <Letterhead />
        <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
          CLINIC LOGBOOK
        </h2>
        <p className="hidden print:block text-sm text-gray-600 mb-4">
          {printSummary}
        </p>
        <table className="w-full text-sm min-w-[860px] md:min-w-0 border-collapse print:min-w-0 print:table-fixed print:w-full print:text-[9.5px] print:leading-tight">
          {/* Print-only column widths — keeps the table within the printable
              page width instead of letting long cell content push columns
              past the page edge (browsers clip overflow when printing,
              they don't add horizontal scroll). Text wraps at spaces only
              (no forced mid-word breaking). Ignored on screen. */}
          <colgroup>
            <col className="print:w-[14%]" />
            <col className="print:w-[16%]" />
            <col className="print:w-[6%]" />
            <col className="print:w-[18%]" />
            <col className="print:w-[6%]" />
            <col className="print:w-[15%]" />
            <col className="print:w-[12%]" />
            <col className="print:w-[13%]" />
          </colgroup>
          <thead>
            {/* Print keeps its own bordered-cell look via print: variants —
                on screen the table drops the grid-of-boxes styling in favour
                of a single hairline under the header and between rows. */}
            <tr className="text-left text-xs font-medium text-ink-500 border-b border-ink-100 print:bg-gray-50 print:border print:border-gray-300">
              <th className="py-2.5 pl-5 pr-3 md:px-3 print:px-1 print:py-1 font-medium print:border print:border-gray-300 print:whitespace-normal">Date / time</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Name</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">Age</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Dept. &amp; course</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">Sex</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Reason</th>
              <th className="px-3 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Complaint</th>
              <th className="pl-3 pr-5 py-2.5 print:px-1 print:py-1 font-medium print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody className="tbl-animate divide-y divide-ink-100 print:divide-y-0">
            {pageRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-ink-50/70 print:hover:bg-transparent">
                <td className="tnum py-3 pl-5 pr-3 md:px-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">
                  {row.dateTime}
                </td>
                <td className="px-3 py-3 print:px-1 print:py-1 font-medium text-ink-900 print:border print:border-gray-300 print:font-normal whitespace-nowrap md:whitespace-normal print:whitespace-normal">{row.name}</td>
                <td className="tnum px-3 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">{row.age}</td>
                <td className="px-3 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">{row.deptCourse}</td>
                <td className="px-3 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">
                  {row.sex}
                </td>
                <td className="px-3 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">
                  {row.reason}
                </td>
                <td className="px-3 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">
                  {row.complaint}
                </td>
                <td className="pl-3 pr-5 py-3 print:px-1 print:py-1 text-ink-600 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">
                  {row.medicine}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-14 text-center text-sm text-ink-500 print:border print:border-gray-300">
                  No visits match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <Pagination
        page={page}
        pageCount={pageCount}
        onChange={setPage}
        label={`${filtered.length} search result${filtered.length === 1 ? "" : "s"}`}
        className="px-5 pb-4 mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 print:hidden"
      />

      {/* bottom trigger — hidden once the form is open */}
      {!walkIn.showWalkInForm && (
        <div className="border-t border-ink-100 px-5 py-4 flex items-center justify-end gap-2 print:hidden">
          <button
            onClick={() => walkIn.setShowWalkInForm(true)}
            className="btn-press inline-flex items-center gap-1.5 text-sm font-medium bg-brand-900 text-white px-3.5 py-2 rounded-control shadow-e1 hover:bg-brand-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6v12M6 12h12" strokeLinecap="round" /></svg>
            Add walk-in visit
          </button>
        </div>
      )}

      {/* walk-in visit form */}
      {walkIn.showWalkInForm && (
        <WalkInVisitForm
          regId={walkIn.regId} setRegId={walkIn.setRegId}
          walkInName={walkIn.walkInName} setWalkInName={walkIn.setWalkInName}
          walkInReasonId={walkIn.walkInReasonId} setWalkInReasonId={walkIn.setWalkInReasonId}
          complaint={walkIn.complaint} setComplaint={walkIn.setComplaint}
          medicineInput={walkIn.medicineInput} setMedicineInput={walkIn.setMedicineInput}
          quantity={walkIn.quantity} setQuantity={walkIn.setQuantity}
          medTags={walkIn.medTags}
          walkInError={walkIn.walkInError}
          handleAddMedicine={walkIn.handleAddMedicine}
          handleAddWalkIn={walkIn.handleAddWalkIn}
          handleClose={walkIn.handleClose}
          reasonRecords={reasonRecords}
        />
      )}
    </section>
  );
}