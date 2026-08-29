// src/components/admin/LogbookPanel.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { logbookApi } from "../../lib/api.js";

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

  // walk-in form visibility — hidden by default, opened by the
  // "+ Add Walk-in Visit" button, same pattern as the full Logbook page.
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  const [regId, setRegId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInReasonId, setWalkInReasonId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicineInput, setMedicineInput] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);
  const [walkInError, setWalkInError] = useState("");

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
      const margin = 12;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const colWidths = [26, 30, 12, 32, 12, 23, 30, 23].map((w) => (w / 188) * usableWidth);
      const cellPad = 2;
      const lineHeight = 3.6;
      const headerHeight = 7;
      const bottomLimit = pageHeight - margin;

      let rowTop;

      const drawTableHeader = () => {
        doc.setFontSize(7.5);
        doc.setFont(undefined, "bold");
        doc.setFillColor(238, 240, 242);
        doc.rect(margin, rowTop, usableWidth, headerHeight, "F");
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

      doc.setDrawColor(190);
      doc.setLineWidth(0.15);
      drawTableHeader();

      if (pageRows.length === 0) {
        doc.setFontSize(9);
        doc.setFont(undefined, "normal");
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
          doc.addPage();
          rowTop = margin;
          doc.setDrawColor(190);
          doc.setLineWidth(0.15);
          drawTableHeader();
        }

        doc.setFontSize(7.5);
        doc.setFont(undefined, "normal");
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

      doc.save("logbook-report.pdf");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function handleAddMedicine() {
    if (!medicineInput.trim()) return;
    const qty = quantity ? Number(quantity) : 1;
    const match = medicineRecords.find((m) => m.medicine_name.toLowerCase() === medicineInput.trim().toLowerCase());
    const medId = match?.medicine_id;
    setMedTags((tags) => [
      ...tags,
      { name: medicineInput.trim(), quantity: qty, medicine_id: medId },
    ]);
    setMedicineInput("");
    setQuantity("");
  }

  function resetWalkInForm() {
    setRegId("");
    setWalkInName("");
    setWalkInReasonId("");
    setComplaint("");
    setMedicineInput("");
    setQuantity("");
    setMedTags([]);
    setWalkInError("");
  }

  async function handleAddWalkIn() {
    if ((!regId.trim() && !walkInName.trim()) || !walkInReasonId) {
      if (!regId.trim() && !walkInName.trim()) {
        setWalkInError("Enter Student ID or Patient Name");
      }
      return;
    }
    setWalkInError("");
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}:00`;

    const medicinesPayload = medTags
      .filter((t) => t.medicine_id)
      .map((t) => ({ medicine_id: t.medicine_id, quantity: t.quantity }));

    try {
      await logbookApi.createWalkIn({
        student_id: regId.trim() || undefined,
        walk_in_name: walkInName.trim() || undefined,
        appointment_date: `${y}-${m}-${d}`,
        appointment_time: time,
        reason_id: Number(walkInReasonId),
        complaint: complaint.trim() || undefined,
        medicines: medicinesPayload.length > 0 ? medicinesPayload : undefined,
      });
      // Refresh the recent-visits list from the backend.
      const res = await logbookApi.list();
      setEntries((res?.logbook || []).slice(0, 5).map(mapEntry));
    } catch (err) {
      console.error("Walk-in failed:", err);
      alert(`Couldn't save the walk-in visit: ${err.message}`);
      return;
    }

    resetWalkInForm();
    setShowWalkInForm(false);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-4 print:shadow-none print:rounded-none print:border-0 print:p-0">
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
          <UniversalDropdown value={department} onChange={(v) => { setDepartment(v); setPage(1); }} options={departments} />
          <UniversalDropdown value={course} onChange={(v) => { setCourse(v); setPage(1); }} options={courses} />
          <UniversalDropdown value={reasonFilter} onChange={(v) => { setReasonFilter(v); setPage(1); }} options={["All Reason", ...reasons]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={updateFilter(setDateFrom)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={updateFilter(setDateTo)}
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
              disabled={downloading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gc-green text-white px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <NavIcon name="download" className="w-4 h-4" />
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* table — scrolls horizontally on mobile only; on desktop it just fits the panel width */}
      <div id="logbook-widget" className="overflow-x-auto md:overflow-x-visible -mx-4 md:mx-0 print:overflow-visible print:-mx-0 print:mx-0">
        <table className="w-full text-sm min-w-[860px] md:min-w-0 border-collapse print:min-w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50">
              <th className="py-2 px-4 md:px-2 font-semibold border border-gray-300">Date / Time</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap md:whitespace-normal">Name</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Age</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap md:whitespace-normal">Dept. & Course</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Sex</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap md:whitespace-normal">Reason</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap md:whitespace-normal">Complaint</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap md:whitespace-normal">Medicine</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td className="py-2.5 px-4 md:px-2 text-gray-700 border border-gray-300 whitespace-nowrap">
                  {row.dateTime}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap md:whitespace-normal">{row.name}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{row.age}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap md:whitespace-normal">{row.deptCourse}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">
                  {row.sex}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap md:whitespace-normal">
                  {row.reason}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap md:whitespace-normal">
                  {row.complaint}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap md:whitespace-normal">
                  {row.medicine}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-gray-400 border border-gray-300">
                  No visits match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 print:hidden">
        <p className="text-xs text-gray-400">
          {filtered.length} search result{filtered.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Previous page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 w-8 text-center">
            {page} / {pageCount}
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
            aria-label="Next page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* bottom trigger — hidden once the form is open */}
      {!showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300 flex items-center justify-end gap-2 print:hidden">
          <button
            onClick={() => setShowWalkInForm(true)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            + Add Walk-in Visit
          </button>
        </div>
      )}

      {/* walk-in visit form — expands directly below the button, closes back into it */}
      {showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800">Add Walk-in Visit</h2>
            <button
              onClick={() => {
                setShowWalkInForm(false);
                resetWalkInForm();
              }}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <span aria-hidden className="text-base leading-none">×</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                ID / Registration Number
              </label>
              <input
                value={regId}
                onChange={(e) => {
                  setRegId(e.target.value);
                  if (walkInError) setWalkInError("");
                }}
                placeholder="Student ID"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
              <label className="mt-2 block text-xs font-semibold text-gray-500">
                Patient Name
              </label>
              <input
                value={walkInName}
                onChange={(e) => {
                  setWalkInName(e.target.value);
                  if (walkInError) setWalkInError("");
                }}
                placeholder="Full name (required if not registered)"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
              {walkInError && (
                <p className="mt-1 text-xs text-red-500">{walkInError}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Reason</label>
              <UniversalDropdown
                value={walkInReasonId}
                onChange={setWalkInReasonId}
                options={reasonRecords.map((r) => ({ value: String(r.reason_id), label: r.description }))}
                placeholder="Select Reason"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Complaint</label>
              <input
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="E.g. Headache"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-500">Medicine</label>
                <input
                  value={medicineInput}
                  onChange={(e) => setMedicineInput(e.target.value)}
                  placeholder="E.g. Paracetamol"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
                />
                {medTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {medTags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs font-medium bg-gc-accent/10 text-gc-accent px-3 py-1.5 rounded-full"
                      >
                        {tag.name} x{tag.quantity}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Quantity</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    type="number"
                    min="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
                  />
                  <button
                    onClick={handleAddMedicine}
                    className="shrink-0 text-xs font-semibold bg-gc-accent text-white px-3 py-2 rounded-lg hover:opacity-90 whitespace-nowrap"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <button
              onClick={() => {
                setShowWalkInForm(false);
                resetWalkInForm();
              }}
              className="text-sm font-semibold text-gray-600 border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddWalkIn}
              className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
            >
              + Add Walk-in Visit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}