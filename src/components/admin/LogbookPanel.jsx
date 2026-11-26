// src/components/admin/LogbookPanel.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon.jsx";
import FilterMultiSelect from "../ui/FilterMultiSelect.jsx";
import LogbookRangePicker from "./LogbookRangePicker.jsx";
import { DownloadPdfButton, PrintButton } from "../ui/PrintDownloadButtons.jsx";
import Letterhead from "./Letterhead.jsx";
import Pagination from "../ui/Pagination.jsx";
import WalkInVisitModal from "./WalkInVisitModal.jsx";
import useWalkInForm from "./useWalkInForm.js";
import { logbookApi } from "../../lib/api.js";
import { matchesAppointmentSearch } from "../../lib/appointmentSlots.js";
import { getWeekRangeYMD, isoToMDY } from "../../lib/calendar.js";
import { clampPage, getPageCount } from "../../lib/pagination.js";
import { buildLogbookQueryParams } from "../../lib/logbookQuery.js";
import {
  deriveRecordFilterOptions,
  formatFilterSelectionLabel,
  isFilterSelected,
  reconcileRecordFilterSelections,
} from "../../lib/filterMultiSelect.js";
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

  // Walk-in form — shared hook encapsulates all walk-in state + handlers
  const walkIn = useWalkInForm({
    reasonRecords,
    medicineRecords,
    onSubmit: async (payload) => {
      await logbookApi.createWalkIn(payload);
      const res = await logbookApi.list(buildLogbookQueryParams({ dateFrom, dateTo }));
      setEntries((res?.logbook || []).slice(0, 5).map(mapEntry));
    },
  });

  // Search and filter state — categorical filters are multi-select arrays;
  // an empty array always means "All" for that category.
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState([]);
  const [course, setCourse] = useState([]);
  const [reasonFilter, setReasonFilter] = useState([]);
  // Default to the current week (Monday – Sunday); the admin can still change or clear it.
  const [dateFrom, setDateFrom] = useState(() => getWeekRangeYMD().from);
  const [dateTo, setDateTo] = useState(() => getWeekRangeYMD().to);
  const [datePeriod, setDatePeriod] = useState("Week");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // The widget keeps only the first five rows, but asks the backend for the
  // selected Regular Time range instead of applying a second local date logic.
  useEffect(() => {
    logbookApi
      .list(buildLogbookQueryParams({ dateFrom, dateTo }))
      .then((res) => setEntries((res?.logbook || []).slice(0, 5).map(mapEntry)))
      .catch((err) => console.error("Failed to load logbook:", err));
  }, [dateFrom, dateTo]);

  // Options come only from logbook rows this widget actually loaded. Each
  // category ignores its own selection, so dependent filters stay useful.
  const filterFields = useMemo(
    () => ({
      department: (entry) => entry?.dept,
      course: (entry) => entry?.course,
      reason: (entry) => entry?.reason,
    }),
    []
  );
  const filterSelections = useMemo(
    () => ({ department, course, reason: reasonFilter }),
    [department, course, reasonFilter]
  );
  const options = useMemo(
    () =>
      deriveRecordFilterOptions({
        records: entries,
        fields: filterFields,
        selections: filterSelections,
        matches: (entry) =>
          matchesAppointmentSearch(entry, search, [
            entry?.reason,
            entry?.complaint,
            entry?.medicine,
          ]),
      }),
    [entries, filterFields, filterSelections, search]
  );
  const { department: departments, course: courses, reason: reasons } = options;

  useEffect(() => {
    const { next, changed } = reconcileRecordFilterSelections({
      selections: filterSelections,
      options,
    });
    if (!changed) return;
    if (next.department !== department) setDepartment(next.department);
    if (next.course !== course) setCourse(next.course);
    if (next.reason !== reasonFilter) setReasonFilter(next.reason);
  }, [options, filterSelections, department, course, reasonFilter]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchesSearch = matchesAppointmentSearch(e, search, [
        e.reason,
        e.complaint,
        e.medicine,
      ]);
      // OR within each category (isFilterSelected), AND across categories.
      const matchesDept = isFilterSelected(e.dept, department);
      const matchesCourse = isFilterSelected(e.course, course);
      const matchesReason = isFilterSelected(e.reason, reasonFilter);
      const matchesDate =
        (!dateFrom || (e.dateISO && e.dateISO >= dateFrom)) &&
        (!dateTo || (e.dateISO && e.dateISO <= dateTo));
      return matchesSearch && matchesDept && matchesCourse && matchesReason && matchesDate;
    });
  }, [entries, search, department, course, reasonFilter, dateFrom, dateTo]);

  // Summary of the active filters, shown on the printed page + PDF (mirrors
  // Reports' "period — department" metadata line). Empty selections render as
  // the classic "All …" labels; multiple picks render as "N … selected".
  const dateSummary = dateFrom || dateTo ? `${isoToMDY(dateFrom)} to ${isoToMDY(dateTo)}` : "All Dates";
  const departmentLabel = formatFilterSelectionLabel({
    selected: department,
    options: departments,
    allLabel: "All Departments",
    pluralLabel: "Departments",
  });
  const courseLabel = formatFilterSelectionLabel({
    selected: course,
    options: courses,
    allLabel: "All Course",
    pluralLabel: "Courses",
  });
  const reasonLabel = formatFilterSelectionLabel({
    selected: reasonFilter,
    options: reasons,
    allLabel: "All Reason",
    pluralLabel: "Reasons",
  });
  const printSummary = `${dateSummary} — ${departmentLabel} — ${courseLabel} — ${reasonLabel}${search ? ` — Search: "${search}"` : ""} — Total: ${filtered.length} entries`;

  const PAGE_SIZE = 5;
  const pageCount = getPageCount(filtered.length, PAGE_SIZE);
  const [page, setPage] = useState(1);
  const currentPage = clampPage(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function updateFilter(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function changeDateRange({ from, to, period }) {
    setDateFrom(from);
    setDateTo(to);
    setDatePeriod(period ?? "All Time");
    setPage(1);
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
      doc.text(`Department: ${departmentLabel}`, 14, y);
      y += 5;
      doc.text(`Course: ${courseLabel}`, 14, y);
      y += 5;
      doc.text(`Reason: ${reasonLabel}`, 14, y);
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
      setError(err.message || "Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-4 print:shadow-none print:rounded-none print:border-0 print:p-0">
      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between gap-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}
      {/* Print-only: hide every surrounding widget and dashboard chrome so that
          the printed page contains ONLY this widget's table. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #logbook-widget, #logbook-widget * { visibility: visible; }
          #logbook-widget { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="book" className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-bold text-gray-800 text-sm md:text-base leading-tight">
              Logbook
            </h2>
            <p className="text-xs text-gray-400 leading-tight">
              View history of completed clinic visits.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/admin/logbook")}
          className="text-xs font-semibold text-gc-green flex items-center gap-1 hover:underline"
        >
          View Full Logbook <span aria-hidden>›</span>
        </button>
      </div>

      {/* search + filters + export */}
      <div className="flex flex-col gap-2 mb-3 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">
            <NavIcon name="user" className="w-4 h-4 shrink-0" />
            <input
              value={search}
              onChange={updateFilter(setSearch)}
              placeholder="Search by surname, name, student ID, or course..."
              className="w-full outline-none placeholder:text-gray-400 text-gray-900"
            />
          </div>
          <FilterMultiSelect
            value={department}
            onChange={(v) => { setDepartment(v); setPage(1); }}
            options={departments}
            allLabel="All Departments"
            pluralLabel="Departments"
            ariaLabel="Filter by department"
            triggerTestId="logbook-department-filter"
          />
          <FilterMultiSelect
            value={course}
            onChange={(v) => { setCourse(v); setPage(1); }}
            options={courses}
            allLabel="All Course"
            pluralLabel="Courses"
            ariaLabel="Filter by course"
            triggerTestId="logbook-course-filter"
          />
          <FilterMultiSelect
            value={reasonFilter}
            onChange={(v) => { setReasonFilter(v); setPage(1); }}
            options={reasons}
            allLabel="All Reason"
            pluralLabel="Reasons"
            ariaLabel="Filter by reason"
            triggerTestId="logbook-reason-filter"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LogbookRangePicker
            value={{ from: dateFrom, to: dateTo, period: datePeriod }}
            onChange={changeDateRange}
            ariaLabel="Filter by date range"
            className="w-full md:flex-1"
            buttonClassName="min-w-0 md:min-w-[13rem]"
            triggerTestId="logbook-date-range"
            compact
          />
          <div className="ml-auto flex items-center gap-2">
            <PrintButton onClick={handlePrint} />
            <DownloadPdfButton
              onClick={handleDownloadPdf}
              disabled={downloading}
              loading={downloading}
            />
          </div>
        </div>
      </div>

      {/* table — scrolls horizontally on mobile only; on desktop it just fits the panel width */}
      <div id="logbook-widget" className="overflow-x-auto md:overflow-x-visible -mx-4 md:mx-0 print:overflow-visible print:mx-0">
        {/* print-only formal letterhead — shared component */}
        <Letterhead />
        <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
          CLINIC LOGBOOK
        </h2>
        <p className="hidden print:block text-sm text-gray-600 mb-4">
          {printSummary}
        </p>
        <table className="w-full text-sm min-w-[960px] md:min-w-0 border-collapse print:min-w-0 print:table-fixed print:w-full print:text-[9.5px] print:leading-tight">
          {/* Print-only column widths — keeps the table within the printable
              page width instead of letting long cell content push columns
              past the page edge (browsers clip overflow when printing,
              they don't add horizontal scroll). Text wraps at spaces only
              (no forced mid-word breaking). Ignored on screen. */}
          <colgroup>
            <col className="print:w-[12%]" />
            <col className="print:w-[11%]" />
            <col className="print:w-[15%]" />
            <col className="print:w-[5%]" />
            <col className="print:w-[16%]" />
            <col className="print:w-[5%]" />
            <col className="print:w-[14%]" />
            <col className="print:w-[12%]" />
            <col className="print:w-[10%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs text-ink-500 bg-ink-50/70">
              <th className="py-2 px-4 md:px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 print:whitespace-normal">Date / Time</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">Student ID</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Name</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">Age</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Dept. & Course</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">Sex</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Reason</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Complaint</th>
              <th className="py-2 px-2 print:px-1 print:py-1 font-semibold border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal print:whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody className="tbl-animate">
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td className="py-2.5 px-4 md:px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">
                  {row.dateTime}
                </td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 font-medium whitespace-nowrap print:whitespace-normal">{row.studentId}</td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere] print:[overflow-wrap:break-word] print:whitespace-normal">{row.name}</td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">{row.age}</td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere] print:[overflow-wrap:break-word] print:whitespace-normal">{row.deptCourse}</td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap print:whitespace-normal">
                  {row.sex}
                </td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere] print:[overflow-wrap:break-word] print:whitespace-normal">
                  {row.reason}
                </td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere] print:[overflow-wrap:break-word] print:whitespace-normal">
                  {row.complaint}
                </td>
                <td className="py-2.5 px-2 print:px-1 print:py-1 text-ink-600 border-b border-ink-100 print:border print:border-gray-300 whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere] print:[overflow-wrap:break-word] print:whitespace-normal">
                  {row.medicine}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-400 border-b border-ink-100 print:border print:border-gray-300">
                  No visits match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        onChange={setPage}
        label={`${filtered.length} search result${filtered.length === 1 ? "" : "s"}`}
        className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 print:hidden"
      />

      {/* bottom trigger — the shared full-Logbook modal keeps this widget compact. */}
      <div className="mt-4 pt-4 border-t-2 border-gray-300 flex items-center justify-end gap-2 print:hidden">
        <button
          onClick={() => walkIn.setShowWalkInForm(true)}
          className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
        >
          + Add Walk-in Visit
        </button>
      </div>

      <WalkInVisitModal
        open={walkIn.showWalkInForm}
        walkIn={walkIn}
        reasonRecords={reasonRecords}
        onClose={walkIn.handleClose}
      />
    </section>
  );
}