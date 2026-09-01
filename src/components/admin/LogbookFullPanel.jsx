// src/components/admin/LogbookFullPanel.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import NavIcon from "./NavIcon.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import Letterhead from "./Letterhead.jsx";
import Pagination from "../Pagination.jsx";
import WalkInVisitForm from "./WalkInVisitForm.jsx";
import useWalkInForm from "./useWalkInForm.js";
import { logbookApi, referenceApi, masterlistApi } from "../../lib/api.js";
import { formatMDY, isoToMDY } from "../../lib/calendar.js";

const PAGE_SIZE = 20;

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

  // Off-screen node holding an exact replica of the print layout (see
  // printRef below) — snapshotted with html2canvas so the download is
  // pixel-for-pixel what "Print" produces, instead of a hand-drawn jsPDF
  // table. The old approach drew every row at a fixed 7mm height and let
  // jsPDF's own text-wrapping kick in independently of that height, so any
  // cell whose text wrapped to 2+ lines (long complaint/medicine text,
  // narrow columns) overlapped the row below it — that's the "siksikan"
  // (cramped/overlapping) look. Snapshotting real, wrapped DOM/CSS avoids
  // that entirely: each row is exactly as tall as its content needs.
  const printRef = useRef(null);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const node = printRef.current;
      if (!node) return;

      // Wait for the Inter webfont + seal images to finish loading/decoding
      // before snapshotting — otherwise html2canvas can capture a frame
      // that's still on a fallback font or a blank image, which is the
      // other common cause of the download not matching the real print.
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await Promise.all(
        Array.from(node.querySelectorAll("img")).map((img) =>
          img.decode ? img.decode().catch(() => {}) : Promise.resolve()
        )
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 10; // matches the .print-a4-portrait / @page margin
      const imgWidth = 210 - margin * 2; // 190mm
      const pageHeightMm = 297 - margin * 2; // 277mm
      const pxPerMm = canvas.width / imgWidth;
      const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);

      // The table can run longer than one A4 page (up to 20 rows per
      // logbook page) — slice the tall canvas into page-height chunks and
      // add one image per PDF page, instead of squashing everything onto a
      // single sheet.
      let renderedPx = 0;
      let pageNum = 0;
      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        sliceCanvas
          .getContext("2d")
          .drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

        if (pageNum > 0) doc.addPage();
        doc.addImage(
          sliceCanvas.toDataURL("image/png"),
          "PNG",
          margin,
          margin,
          imgWidth,
          sliceHeightPx / pxPerMm
        );

        renderedPx += sliceHeightPx;
        pageNum += 1;
      }

      doc.save(`logbook-report-${formatMDY(new Date()).replaceAll("/", "-")}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
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
      <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
        <p className="font-semibold">Failed to load logbook</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5 print:shadow-none print:border-none print-a4-portrait">
      {/* print-only formal letterhead — shared component */}
      <Letterhead />
      <h2 className="hidden print:block text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
        CLINIC LOGBOOK
      </h2>
      <p className="hidden print:block print:text-xs text-gray-600 mb-4">
        {printSummary}
      </p>

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
        <table className="w-full text-sm min-w-[900px] md:min-w-0 border-collapse print:min-w-0 print:w-full print:table-fixed print:text-[9.5px] print:leading-snug">
          {/* Print-only column widths — forces the table to stay within the
              190mm printable width (see .print-a4-portrait in index.css)
              instead of letting long content push columns off the page.
              Widths are sized to fit each column's typical content on one
              line; text only wraps at a space (never mid-word — see the
              whitespace-normal-without-break-words note below). Ignored on
              screen since table-layout stays "auto" there. */}
          <colgroup>
            <col className="print:w-[13%]" />
            <col className="print:w-[9%]" />
            <col className="print:w-[14%]" />
            <col className="print:w-[6%]" />
            <col className="print:w-[15%]" />
            <col className="print:w-[6%]" />
            <col className="print:w-[14%]" />
            <col className="print:w-[10%]" />
            <col className="print:w-[13%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50">
              <th className="py-2 px-4 md:px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Date & Time</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Student ID</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Name</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Age</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Dept / Course</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Sex</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Reason</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Complaint</th>
              <th className="py-2 px-2 print:px-2 print:py-2 font-semibold border border-gray-300 whitespace-nowrap print:whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-400 border border-gray-300">
                  No logbook entries found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2.5 px-4 md:px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.dateTime}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 font-medium whitespace-nowrap print:whitespace-normal">{entry.studentId}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.name}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.age}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300">
                    <div className="font-medium whitespace-nowrap print:whitespace-normal">{entry.dept}</div>
                    <div className="text-xs print:text-[9px] text-gray-500 whitespace-nowrap print:whitespace-normal">{entry.course}</div>
                  </td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.sex}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.reason}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 max-w-xs truncate print:max-w-none print:overflow-visible print:text-clip print:whitespace-normal">{entry.complaint}</td>
                  <td className="py-2.5 px-2 print:px-2 print:py-2 text-gray-700 border border-gray-300 whitespace-nowrap print:whitespace-normal">{entry.medicine}</td>
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
          handleAddMedicine={walkIn.handleAddMedicine}
          handleAddWalkIn={walkIn.handleAddWalkIn}
          handleClose={walkIn.handleClose}
          reasonRecords={reasonRecords}
        />
      )}

      {/* ---------- PDF-export-only: exact replica of the print layout ----------
          Kept off-screen (not display:none) so html2canvas can still capture
          it for the "Download PDF" button — display:none elements have no
          layout box to snapshot. Uses the *same* plain (non print:-prefixed)
          classes the real print output resolves to, so what gets downloaded
          is identical to what "Print" produces, row heights included. */}
      <div
        ref={printRef}
        className="flex flex-col bg-white fixed top-0 -left-[9999px] w-[190mm] p-0"
      >
        <Letterhead className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-300" />
        <h2 className="text-center font-bold text-gc-green text-base tracking-[0.2em] underline underline-offset-4 mb-4">
          CLINIC LOGBOOK
        </h2>
        <p className="text-xs text-gray-600 mb-4">{printSummary}</p>

        <table className="w-full table-fixed border-collapse text-[9.5px] leading-snug">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr className="text-left bg-gray-50">
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Date & Time</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Student ID</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Name</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Age</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Dept / Course</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Sex</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Reason</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Complaint</th>
              <th className="px-2 py-2 font-semibold border border-gray-300 whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400 border border-gray-300">
                  No logbook entries found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.dateTime}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 font-medium whitespace-normal">{entry.studentId}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.name}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.age}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300">
                    <div className="font-medium whitespace-normal">{entry.dept}</div>
                    <div className="text-[9px] text-gray-500 whitespace-normal">{entry.course}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.sex}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.reason}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.complaint}</td>
                  <td className="px-2 py-2 text-gray-700 border border-gray-300 whitespace-normal">{entry.medicine}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}