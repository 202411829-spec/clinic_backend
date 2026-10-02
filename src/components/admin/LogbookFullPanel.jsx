// src/components/admin/LogbookFullPanel.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import NavIcon from "./NavIcon.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import Letterhead from "./Letterhead.jsx";
import Pagination from "../Pagination.jsx";
import WalkInVisitForm from "./WalkInVisitForm.jsx";
import useWalkInForm from "./useWalkInForm.js";
import { logbookApi, referenceApi, masterlistApi } from "../../lib/api.js";
import { formatMDY, isoToMDY } from "../../lib/calendar.js";

const PAGE_SIZE = 20;

// ---- PDF export layout -----------------------------------------------------
// Column widths (% of the 190mm printable width) — shared by the on-screen
// print table and the PDF replica so they always match. "Student ID" needs
// ~11% so its 9 digits stay inside the cell (digits never wrap).
const EXPORT_COL_WIDTHS = [12, 11, 14, 5, 15, 7, 13, 10, 13];
const EXPORT_HEADERS = ["Date & Time", "Student ID", "Name", "Age", "Dept / Course", "Sex", "Reason", "Complaint", "Medicine"];
const PDF_MARGIN_MM = 10;
const PDF_CONTENT_W_MM = 210 - PDF_MARGIN_MM * 2; // 190mm
const PDF_CONTENT_H_MM = 297 - PDF_MARGIN_MM * 2; // 277mm
// Blank space captured under each page so the last row's bottom border can never be clipped.
const PDF_EXTRA_BOTTOM_PX = 16;

// One self-contained PDF page: letterhead + title + summary + column header +
// this page's rows. Every page gets its own full header, exactly like the
// printed version (where the header lives in <thead> and repeats).
function ExportPage({ rows, summary }) {
  // The 2px padding on the wrapper matters: with border-collapse the outer half
  // of the last row's bottom border (and the left/right edges) sits outside the
  // table box, so the snapshot clipped it and the table looked open at the bottom.
  return (
    <div data-pdf-page className="bg-white w-[190mm] p-[2px]">
      <Letterhead className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-300" />
      <h2 className="text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
        CLINIC LOGBOOK
      </h2>
      <p className="text-xs text-gray-600 mb-4">{summary}</p>

      <table className="w-full table-fixed border-collapse text-[9.5px] leading-snug [overflow-wrap:break-word]">
        <colgroup>
          {EXPORT_COL_WIDTHS.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-left bg-gray-50">
            {EXPORT_HEADERS.map((h) => (
              <th key={h} className="px-1.5 py-2 font-semibold border border-gray-300 whitespace-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-gray-400 border border-gray-300">
                No logbook entries found
              </td>
            </tr>
          ) : (
            rows.map((entry) => (
              <tr key={entry.id}>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.dateTime}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300 font-medium">{entry.studentId}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.name}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.age}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">
                  <div className="font-medium">{entry.dept}</div>
                  <div className="text-[9px] text-gray-500">{entry.course}</div>
                </td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.sex}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.reason}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.complaint}</td>
                <td className="px-1.5 py-2 text-gray-700 border border-gray-300">{entry.medicine}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Wait for webfonts + seal images so the snapshot never captures a half-loaded frame.
async function waitForAssets(container) {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    Array.from(container.querySelectorAll("img")).map((img) =>
      img.decode ? img.decode().catch(() => {}) : Promise.resolve()
    )
  );
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

// Map a backend /logbook row onto the shape this panel renders.
function mapEntry(r) {
  // Backend now returns separate dept and course fields.
  const dept = r.dept || "-";
  const course = r.course || "-";
  const deptCourse = r.deptCourse || (course !== "-" && dept !== "-" ? `${course} - ${dept}` : course !== "-" ? course : dept);
  return {
    id: r.id ?? r.log_id,
    dateTime: r.dateTime || "-",
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

export default function LogbookFullPanel() {
  const [entries, setEntries] = useState([]);
  const [reasonRecords, setReasonRecords] = useState([]);
  const [medicineRecords, setMedicineRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination & filters state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageSize] = useState(PAGE_SIZE);

  // Options for the new department/course filters, loaded from the masterlist.
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

  // Guards against a stale request finishing after a newer one has already
  // started (e.g. the user changes filters twice quickly) — without this,
  // whichever response lands second last would win, even if it's the older
  // one.
  const requestIdRef = useRef(0);

  // Load data with server-side filtering
  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestIdRef.current === requestId;
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        page_size: pageSize,
        ...(search && { search }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
        ...(reasonFilter && { reason_id: reasonFilter }),
        ...(departmentFilter && { department_id: departmentFilter }),
        ...(courseFilter && { course_id: courseFilter }),
      };

      const [logbookRes, reasonsRes, medicinesRes] = await Promise.all([
        logbookApi.list(params),
        referenceApi.reasons(),
        referenceApi.medicines(),
      ]);

      if (isCurrent()) {
        setEntries((logbookRes?.logbook || []).map(mapEntry));
        setTotalEntries(logbookRes?.total || 0);
        const reasonsList = (reasonsRes?.reasons || []).filter((r) => r.description && r.description !== "-");
        if (reasonsList.length) setReasonRecords(reasonsList);
        const medicinesList = (medicinesRes?.medicines || []).filter((m) => m.medicine_name);
        if (medicinesList.length) setMedicineRecords(medicinesList);
      }
    } catch (err) {
      if (isCurrent()) setError(err.message || "Failed to load logbook");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [page, search, dateFrom, dateTo, reasonFilter, departmentFilter, courseFilter, pageSize]);

  // Reload when filters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load department & course options for the filters (independent, not cascaded).
  useEffect(() => {
    masterlistApi
      .listDepartments()
      .then((res) =>
        setDepartments(
          (res?.departments || res || []).map((d) => ({
            value: d.department_id,
            label: d.department_name,
          }))
        )
      )
      .catch(() => {});
    masterlistApi
      .listCourses()
      .then((res) =>
        setCourses(
          (res?.courses || res || []).map((c) => ({
            value: c.course_id,
            label: c.course_name,
          }))
        )
      )
      .catch(() => {});
  }, []);

  // Any filter change resets the page to 1 so the user never lands out of
  // range on a smaller filtered result set.
  function changeSearch(v) { setSearch(v); setPage(1); }
  function changeDateFrom(v) { setDateFrom(v); setPage(1); }
  function changeDateTo(v) { setDateTo(v); setPage(1); }
  function changeReason(v) { setReasonFilter(v); setPage(1); }
  function changeDepartment(v) { setDepartmentFilter(v); setPage(1); }
  function changeCourse(v) { setCourseFilter(v); setPage(1); }

  // Walk-in form — shared hook encapsulates all walk-in state + handlers
  const walkIn = useWalkInForm({
    reasonRecords,
    medicineRecords,
    onSubmit: async (payload) => {
      await logbookApi.createWalkIn(payload);
      const res = await logbookApi.list({
        page: 1,
        page_size: pageSize,
        ...(search && { search }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
        ...(reasonFilter && { reason_id: reasonFilter }),
        ...(departmentFilter && { department_id: departmentFilter }),
        ...(courseFilter && { course_id: courseFilter }),
      });
      setEntries((res?.logbook || []).map(mapEntry));
      setTotalEntries(res?.total || 0);
      setPage(1);
    },
  });

  // Labels for the active filters, used for the print/PDF summary metadata line
  // (mirrors Reports' "period — department" convention).
  const departmentLabel = departments.find((d) => String(d.value) === String(departmentFilter))?.label;
  const courseLabel = courses.find((c) => String(c.value) === String(courseFilter))?.label;
  const reasonLabel = reasonRecords.find((r) => String(r.reason_id) === String(reasonFilter))?.description;
  const dateSummary = dateFrom || dateTo ? `${isoToMDY(dateFrom)} to ${isoToMDY(dateTo)}` : "All Dates";
  const printSummary = `${dateSummary} — ${departmentLabel || "All Departments"} — ${courseLabel || "All Course"} — ${reasonLabel || "All Reasons"}${search ? ` — Search: "${search}"` : ""} — Total: ${totalEntries} entries`;

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  function handlePrint() {
    window.print();
  }

  // The PDF is built page by page from an off-screen replica of the print
  // layout. Rows are measured first and packed into A4 pages so a row is never
  // sliced in half, and every page is rendered with its own full header
  // (letterhead + title + column header) — same as the printed version.
  // `exportPages` is null normally (nothing rendered); during a download it
  // holds the rows for each page.
  const [exportPages, setExportPages] = useState(null);
  const exportRef = useRef(null);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const [{ jsPDF }, { nodeToPng }] = await Promise.all([
        import("jspdf"),
        import("../../lib/pdf.js"),
      ]);

      // 1) Measure: render every row on a single tall page.
      flushSync(() => setExportPages([entries]));
      const container = exportRef.current;
      if (!container) return;
      await waitForAssets(container);

      const measurePage = container.querySelector("[data-pdf-page]");
      const tbody = measurePage.querySelector("tbody");
      const headerH = tbody.getBoundingClientRect().top - measurePage.getBoundingClientRect().top;
      const rowHeights = entries.length
        ? Array.from(tbody.querySelectorAll("tr")).map((tr) => tr.getBoundingClientRect().height)
        : [];

      // 2) Pack rows into pages (CSS px @96dpi; small safety margin).
      const capacity = (PDF_CONTENT_H_MM / 25.4) * 96 - 6 - PDF_EXTRA_BOTTOM_PX - 4;
      const chunks = [];
      let current = [];
      let used = headerH;
      rowHeights.forEach((h, i) => {
        if (current.length && used + h > capacity) {
          chunks.push(current);
          current = [];
          used = headerH;
        }
        current.push(entries[i]);
        used += h;
      });
      if (current.length || chunks.length === 0) chunks.push(current);

      // 3) Render the real pages, one canvas per page.
      flushSync(() => setExportPages(chunks));
      await waitForAssets(container);
      const pageNodes = Array.from(container.querySelectorAll("[data-pdf-page]"));

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < pageNodes.length; i += 1) {
        const { dataUrl, width, height } = await nodeToPng(pageNodes[i], { pixelRatio: 2, extraBottom: PDF_EXTRA_BOTTOM_PX });
        const imgH = (height / width) * PDF_CONTENT_W_MM;
        if (i > 0) doc.addPage();
        doc.addImage(dataUrl, "PNG", PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_CONTENT_W_MM, imgH);
      }

      doc.save(`logbook-report-${formatMDY(new Date()).replaceAll("/", "-")}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      setError(err.message || "Couldn't generate the PDF. Please try again.");
    } finally {
      setExportPages(null);
      setDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gc-green-700 font-semibold">Loading logbook…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
        <p className="font-semibold">Failed to load logbook</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5 print:shadow-none print:border-none print-a4-portrait">
      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between gap-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}
      {/* header + Print/PDF toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 print:hidden">
        {/* header — matches the dashboard Logbook widget's card header */}
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
            <NavIcon name="book" className="w-4 h-4" />
          </span>
          <div>
            <h1 className="font-bold text-gc-green text-base md:text-lg leading-tight">
              Logbook
            </h1>
            <p className="text-xs text-gray-400 leading-tight">
              View history of completed clinic visits.
            </p>
          </div>
        </div>
      </div>

      {/* search + filters + export — matches the dashboard Logbook widget toolbar */}
      <div className="flex flex-col gap-2 mb-3 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">
            <NavIcon name="search" className="w-4 h-4 shrink-0" />
            <input
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Search student ID, name, complaint, medicine…"
              className="w-full outline-none placeholder:text-gray-400 text-gray-900"
            />
          </div>
          <UniversalDropdown value={departmentFilter} onChange={changeDepartment} options={departments} placeholder="All Departments" />
          <UniversalDropdown value={courseFilter} onChange={changeCourse} options={courses} placeholder="All Course" />
          <UniversalDropdown
            value={reasonFilter}
            onChange={changeReason}
            options={reasonRecords.map((r) => ({ value: String(r.reason_id), label: r.description }))}
            placeholder="All Reasons"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => changeDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => changeDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <NavIcon name="printer" className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gc-green text-white px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <NavIcon name="download" className="w-4 h-4" />
              {downloadingPdf ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>


      {/* Table — same boxed/grid look as the dashboard widget: bordered
          cells + gray-50 header, instead of a borderless divide-only table.
          In print this is preceded by the letterhead/title/summary block
          above; the toolbar/filters up top, the pagination below, and the
          walk-in form are all print:hidden, and the layout's sidebar/topbar
          already carry print:hidden. */}
      <div className="overflow-x-auto -mx-4 md:mx-0 print:overflow-visible print:mx-0">
        <table className="w-full text-sm min-w-[900px] md:min-w-0 border-collapse print:min-w-0 print:w-full print:table-fixed print:text-[9.5px] print:leading-snug print:[overflow-wrap:break-word]">
          {/* Print-only column widths — forces the table to stay within the
              190mm printable width (see .print-a4-portrait in index.css)
              instead of letting long content push columns off the page.
              Widths are sized to fit each column's typical content on one
              line; text only wraps at a space (never mid-word — see the
              whitespace-normal-without-break-words note below). Ignored on
              screen since table-layout stays "auto" there. */}
          <colgroup>
            <col className="print:w-[12%]" />
            <col className="print:w-[11%]" />
            <col className="print:w-[13%]" />
            <col className="print:w-[5%]" />
            <col className="print:w-[15%]" />
            <col className="print:w-[7%]" />
            <col className="print:w-[14%]" />
            <col className="print:w-[10%]" />
            <col className="print:w-[13%]" />
          </colgroup>
          <thead>
            {/* Print-only page header. It lives inside <thead> so the browser
                repeats it (letterhead + title + summary + column header) at
                the top of every printed page. Hidden on screen. */}
            <tr className="hidden print:table-row">
              <td colSpan={9} className="p-0 border-0 bg-white font-normal text-left align-top">
                <Letterhead />
                <h2 className="text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
                  CLINIC LOGBOOK
                </h2>
                <p className="text-xs text-gray-600 mb-4">{printSummary}</p>
              </td>
            </tr>
            <tr className="text-left text-xs text-gray-500 bg-gray-50">
              <th className="py-2 px-4 md:px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Date & Time</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Student ID</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Name</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Age</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Dept / Course</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Sex</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Reason</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Complaint</th>
              <th className="py-2 px-2 print:px-1.5 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody className="tbl-animate">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-400 border border-gray-300">
                  No logbook entries found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="row-hover transition-colors duration-150 hover:bg-gray-50">
                  <td className="py-2.5 px-4 md:px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.dateTime}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 font-medium whitespace-nowrap print:whitespace-normal">{entry.studentId}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.name}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.age}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300">
                    <div className="font-medium whitespace-nowrap print:whitespace-normal">{entry.dept}</div>
                    <div className="text-xs print:text-[9px] text-gray-500 whitespace-nowrap print:whitespace-normal">{entry.course}</div>
                  </td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.sex}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.reason}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 max-w-xs truncate print:max-w-none print:overflow-visible print:text-clip print:whitespace-normal">{entry.complaint}</td>
                  <td className="py-2.5 px-2 print:px-1.5 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.medicine}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalEntries > pageSize && (
        <div className="mt-3 flex items-center justify-between print:hidden">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalEntries)} of{" "}
            {totalEntries} entries
          </p>
          <Pagination page={page} pageCount={Math.ceil(totalEntries / pageSize)} onChange={setPage} />
        </div>
      )}

      {/* bottom trigger — hidden once the form is open, same as the dashboard widget */}
      {!walkIn.showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300 flex items-center justify-end gap-2 print:hidden">
          <button
            onClick={() => walkIn.setShowWalkInForm(true)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            + Add Walk-in Visit
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
          isSubmitting={walkIn.isSubmitting}
          handleAddMedicine={walkIn.handleAddMedicine}
          handleAddWalkIn={walkIn.handleAddWalkIn}
          handleClose={walkIn.handleClose}
          reasonRecords={reasonRecords}
        />
      )}

      {/* PDF-export-only replica (rendered only while "Download PDF" runs).
          Off-screen but not display:none so it can be snapshotted. */}
      {exportPages && (
        <div ref={exportRef} className="fixed top-0 -left-[9999px] w-[190mm] flex flex-col">
          {exportPages.map((rows, i) => (
            <ExportPage key={i} rows={rows} summary={printSummary} />
          ))}
        </div>
      )}
    </section>
  );
}