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
    <div className="flex flex-col gap-4">
      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search student ID, name, complaint, medicine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gc-green focus:border-transparent transition"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:w-[500px]">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gc-green focus:border-transparent transition"
            placeholder="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline:none focus:ring-2 focus:ring-gc-green focus:border-transparent transition"
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

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Date & Time</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Student ID</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Age</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Dept / Course</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Sex</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Reason</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Complaint</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Medicine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  No logbook entries found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{entry.dateTime}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{entry.studentId}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.name}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.age}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="font-medium">{entry.dept}</div>
                    <div className="text-xs text-gray-500">{entry.course}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.sex}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.reason}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{entry.complaint}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.medicine}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalEntries > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalEntries)} of{" "}
            {totalEntries} entries
          </p>
          <Pagination page={page} pageCount={Math.ceil(totalEntries / pageSize)} onChange={setPage} />
        </div>
      )}
    </div>
  );
}