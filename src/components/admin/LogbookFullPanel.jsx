// src/components/admin/LogbookFullPanel.jsx
import { useMemo, useState } from "react";
import NavIcon from "./NavIcon";
import { logbookEntries as initialEntries, reasonOptions } from "../../data/dashboardSample";

const PAGE_SIZE = 20;

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
  const [entries, setEntries] = useState(initialEntries);

  // search + filters
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [course, setCourse] = useState("All Course");
  const [reason, setReason] = useState("All Reason");
  const [page, setPage] = useState(1);

  // walk-in form visibility
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  // walk-in visit form
  const [regId, setRegId] = useState("");
  const [walkInReason, setWalkInReason] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicine, setMedicine] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);

  const departments = useMemo(() => {
    const set = new Set(entries.map((e) => e.dept));
    return ["All Departments", ...Array.from(set)];
  }, [entries]);

  const courses = useMemo(() => {
    const set = new Set(entries.map((e) => e.course));
    return ["All Course", ...Array.from(set)];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.studentId.toLowerCase().includes(q) ||
        e.course.toLowerCase().includes(q);
      const matchesDept = department === "All Departments" || e.dept === department;
      const matchesCourse = course === "All Course" || e.course === course;
      const matchesReason = reason === "All Reason" || e.reason === reason;
      return matchesSearch && matchesDept && matchesCourse && matchesReason;
    });
  }, [entries, search, department, course, reason]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
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

  function handleAddMedicine() {
    if (!medicine.trim()) return;
    const qty = quantity ? `x${quantity}` : "";
    setMedTags((tags) => [...tags, `${medicine.trim()} ${qty}`.trim()]);
    setMedicine("");
    setQuantity("");
  }

  function handleAddWalkIn() {
    if (!regId.trim()) return;
    const now = new Date();
    const dateTime = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(
      now.getDate()
    ).padStart(2, "0")}/${now.getFullYear()} ${now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const newEntry = {
      id: `lb-new-${Date.now()}`,
      dateTime,
      studentId: regId.trim(),
      name: regId.trim(),
      age: "-",
      dept: "-",
      course: "-",
      deptCourse: "-",
      sex: "-",
      reason: walkInReason || "-",
      complaint: complaint.trim() || "-",
      medicine: medTags.length ? medTags.join(", ") : "-",
    };
    setEntries((prev) => [newEntry, ...prev]);
    setRegId("");
    setWalkInReason("");
    setComplaint("");
    setMedTags([]);
    setPage(1);
    setShowWalkInForm(false);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
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

      {/* search + filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <div className="md:col-span-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus-within:ring-2 focus-within:ring-gc-accent/40 focus-within:border-gc-accent">
          <NavIcon name="search" className="w-4 h-4 shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder="Search by surname, name, student ID, or course..."
            className="w-full outline-none placeholder:text-gray-400 text-gray-700"
          />
        </div>
        <select
          value={department}
          onChange={updateFilter(setDepartment)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
        >
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          value={course}
          onChange={updateFilter(setCourse)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
        >
          {courses.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={reason}
          onChange={updateFilter(setReason)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
        >
          <option>All Reason</option>
          {reasonOptions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="overflow-x-auto -mx-4 md:mx-0 border-y md:border border-gray-200 md:rounded-xl">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="py-2.5 px-4 font-semibold whitespace-nowrap">Date / Time</th>
              <th className="py-2.5 px-3 font-semibold">Name</th>
              <th className="py-2.5 px-3 font-semibold">Age</th>
              <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Dept &amp; Course</th>
              <th className="py-2.5 px-3 font-semibold">Sex</th>
              <th className="py-2.5 px-3 font-semibold">Reason</th>
              <th className="py-2.5 px-3 font-semibold">Complaint</th>
              <th className="py-2.5 px-4 font-semibold">Medicine</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60">
                <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{row.dateTime}</td>
                <td className="py-3 px-3 text-gray-800 font-medium">{row.name}</td>
                <td className="py-3 px-3 text-gray-700">{row.age}</td>
                <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{row.deptCourse}</td>
                <td className="py-3 px-3 text-gray-700">{row.sex}</td>
                <td className="py-3 px-3 text-gray-700">{row.reason}</td>
                <td className="py-3 px-3 text-gray-700">{row.complaint}</td>
                <td className="py-3 px-4 text-gray-700">{row.medicine}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-gray-400">
                  No visits match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} search result{filtered.length === 1 ? "" : "s"}
        </p>
        <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
      </div>

      {/* bottom trigger — the single Add Walk-in Visit entry point (Add Medicine only lives on the Dashboard widget) */}
      {!showWalkInForm && (
        <div className="mt-6 pt-5 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowWalkInForm(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            + Add Walk-in Visit
          </button>
        </div>
      )}

      {/* walk-in visit form — expands directly below the button, closes back into it */}
      {showWalkInForm && (
        <div className="mt-6 pt-5 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800">Add Walk-in Visit</h2>
            <button
              onClick={() => setShowWalkInForm(false)}
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
                onChange={(e) => setRegId(e.target.value)}
                placeholder="Student ID"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Reason</label>
              <select
                value={walkInReason}
                onChange={(e) => setWalkInReason(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none focus:border-gc-accent"
              >
                <option value="">Select Reason</option>
                {reasonOptions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
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
                  value={medicine}
                  onChange={(e) => setMedicine(e.target.value)}
                  placeholder="E.g. Paracetamol"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
                />
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

          {medTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {medTags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs font-medium bg-gc-accent/10 text-gc-accent px-3 py-1.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <button
              onClick={() => setShowWalkInForm(false)}
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
