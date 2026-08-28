// src/components/admin/LogbookFullPanel.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import NavIcon from "./NavIcon.jsx";
import {
  logbookEntries as sampleEntries,
} from "../../data/dashboardSample.js";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { logbookApi, referenceApi } from "../../lib/api.js";

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

function Pagination({ page, pageCount, onChange }) {
  // Show up to 10 page numbers to match the design, even if there isn't
  // enough data yet to actually fill them all — those extra numbers are
  // just visual placeholders and stay inactive until real data reaches them.
  const displayCount = Math.max(pageCount, 10);
  const pages = [];
  const window = 1;
  for (let p = 1; p <= displayCount; p++) {
    if (
      p === 1 ||
      p === displayCount ||
      (p >= page - window && p <= page + window)
    ) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => p <= pageCount && onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
              p === page
                ? "bg-gc-green text-white"
                : "text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        aria-label="Next page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default function LogbookFullPanel() {
  const [entries, setEntries] = useState([]);
  const [reasonRecords, setReasonRecords] = useState([]);
  const [medicineRecords, setMedicineRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Derived for dropdowns
  const reasons = useMemo(() => reasonRecords.map((r) => r.description), [reasonRecords]);
  const medicines = useMemo(() => medicineRecords.map((m) => m.medicine_name), [medicineRecords]);

  // Pagination & filters state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageSize] = useState(PAGE_SIZE);

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
  }, [page, search, dateFrom, dateTo, reasonFilter, pageSize]);

  // Reload when filters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Walk-in visit form — hidden by default, opened by the "+ Add Walk-in
  // Visit" button, same pattern as the dashboard Logbook widget.
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [regId, setRegId] = useState("");
  const [walkInReasonId, setWalkInReasonId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicineInput, setMedicineInput] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);
  const [walkInError, setWalkInError] = useState(null);

  function resetWalkInForm() {
    setRegId("");
    setWalkInReasonId("");
    setComplaint("");
    setMedicineInput("");
    setQuantity("");
    setMedTags([]);
    setWalkInError(null);
  }

  function handleAddMedicine() {
    if (!medicineInput.trim()) return;
    const qty = quantity ? Number(quantity) : 1;
    const match = medicineRecords.find(
      (m) => m.medicine_name.toLowerCase() === medicineInput.trim().toLowerCase()
    );
    const medId = match?.medicine_id;
    setMedTags((tags) => [
      ...tags,
      { name: medicineInput.trim(), quantity: qty, medicine_id: medId },
    ]);
    setMedicineInput("");
    setQuantity("");
  }

  async function handleAddWalkIn() {
    if (!regId.trim() || !walkInReasonId) return;
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
      setWalkInError(null);
      await logbookApi.createWalkIn({
        student_id: regId.trim(),
        appointment_date: `${y}-${m}-${d}`,
        appointment_time: time,
        reason_id: Number(walkInReasonId),
        complaint: complaint.trim() || undefined,
        medicines: medicinesPayload.length > 0 ? medicinesPayload : undefined,
      });
      // Refresh straight from the API with explicit page=1 params (rather
      // than going through loadData(), which would otherwise close over
      // whatever page the admin was on before this async call resolves).
      const res = await logbookApi.list({
        page: 1,
        page_size: pageSize,
        ...(search && { search }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
        ...(reasonFilter && { reason_id: reasonFilter }),
      });
      setEntries((res?.logbook || []).map(mapEntry));
      setTotalEntries(res?.total || 0);
      setPage(1);
    } catch (err) {
      console.error("Walk-in failed:", err);
      setWalkInError(err.message || "Couldn't save the walk-in visit.");
      return;
    }

    resetWalkInForm();
    setShowWalkInForm(false);
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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      {/* header — matches the dashboard Logbook widget's card header */}
      <div className="flex items-center gap-2 mb-4">
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

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-3">
        <div className="relative flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 focus-within:ring-2 focus-within:ring-gc-green focus-within:border-transparent transition">
          <NavIcon name="user" className="w-4 h-4 shrink-0" />
          <input
            type="text"
            placeholder="Search student ID, name, complaint, medicine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full outline-none placeholder:text-gray-400 text-gray-900 bg-transparent"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:w-[500px]">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green focus:border-transparent transition"
            placeholder="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green focus:border-transparent transition"
            placeholder="To date"
          />
          <UniversalDropdown
            value={reasonFilter}
            onChange={setReasonFilter}
            options={reasons}
            placeholder="All Reasons"
            className="min-w-[180px]"
          />
        </div>
      </div>

      {/* Table — same boxed/grid look as the dashboard widget: bordered
          cells + gray-50 header, instead of a borderless divide-only table */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-sm min-w-[900px] md:min-w-0 border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50">
              <th className="py-2 px-4 md:px-2 font-semibold border border-gray-300 whitespace-nowrap">Date & Time</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Student ID</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Name</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Age</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Dept / Course</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Sex</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Reason</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Complaint</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 whitespace-nowrap">Medicine</th>
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
                  <td className="py-2.5 px-4 md:px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.dateTime}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 font-medium whitespace-nowrap">{entry.studentId}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.name}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.age}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300">
                    <div className="font-medium whitespace-nowrap">{entry.dept}</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">{entry.course}</div>
                  </td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.sex}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.reason}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 max-w-xs truncate">{entry.complaint}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 whitespace-nowrap">{entry.medicine}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalEntries > pageSize && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalEntries)} of{" "}
            {totalEntries} entries
          </p>
          <Pagination page={page} pageCount={Math.ceil(totalEntries / pageSize)} onChange={setPage} />
        </div>
      )}

      {/* bottom trigger — hidden once the form is open, same as the dashboard widget */}
      {!showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300 flex items-center justify-end gap-2">
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
        <div className="mt-4 pt-4 border-t-2 border-gray-300">
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

          {walkInError && (
            <p className="mb-3 text-sm font-semibold text-red-600">{walkInError}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                ID / Registration Number
              </label>
              <input
                value={regId}
                onChange={(e) => setRegId(e.target.value)}
                placeholder="Student ID"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
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