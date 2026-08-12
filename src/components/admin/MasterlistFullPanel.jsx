// src/components/admin/MasterlistFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import {
  masterlistStudents,
  departmentOptions,
  courseOptions,
  yearLevelOptions,
} from "../../data/masterlistSample";

const PAGE_SIZE = 14;

const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "studentNumber", label: "Student Number", sortable: true },
  { key: "deptCourse", label: "Dept. & Course", sortable: true },
  { key: "yearLevel", label: "Year Level", sortable: true },
  { key: "sex", label: "Sex", sortable: true },
  { key: "birthday", label: "Birthday", sortable: true },
  { key: "contactNumber", label: "Contact No.", sortable: false },
];

function initials(name = "") {
  // names are stored "Last, First M." — but the avatar shows First + Last
  // (e.g. "Ramos, Joseph Daniel B." -> "JR"), matching the mockup
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[0]?.[0] ?? "";
  const first = parts[1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "?";
}

function Pagination({ page, pageCount, onChange }) {
  const displayCount = Math.max(pageCount, 10);
  const pages = [];
  const window = 1;
  for (let p = 1; p <= displayCount; p++) {
    if (p === 1 || p === displayCount || (p >= page - window && p <= page + window)) {
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

function ActionMenu({ open, onToggle, onClose, student }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={onToggle}
        aria-label={`Actions for ${student.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <NavIcon name="dots" className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={onClose}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            View Profile
          </button>
          <button
            role="menuitem"
            onClick={onClose}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit Details
          </button>
          <button
            role="menuitem"
            onClick={onClose}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Archive Student
          </button>
        </div>
      )}
    </div>
  );
}

export default function MasterlistFullPanel() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [course, setCourse] = useState("All Course");
  const [yearLevel, setYearLevel] = useState("All Years");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [openMenuId, setOpenMenuId] = useState(null);

  function updateFilter(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = masterlistStudents.filter((s) => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.course.toLowerCase().includes(q);
      const matchesDept = department === "All Departments" || s.dept === department;
      const matchesCourse = course === "All Course" || s.course === course;
      const matchesYear = yearLevel === "All Years" || s.yearLevel === yearLevel;
      return matchesSearch && matchesDept && matchesCourse && matchesYear;
    });

    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey]).toLowerCase();
        const bv = String(b[sortKey]).toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [search, department, course, yearLevel, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      {/* header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name="user" className="w-4 h-4" />
        </span>
        <div>
          <h1 className="font-bold text-gc-green text-base md:text-lg leading-tight">
            Masterlist
          </h1>
          <p className="text-xs text-gray-400 leading-tight">
            View and manage the master list of students.
          </p>
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
          <option>All Departments</option>
          {departmentOptions.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          value={course}
          onChange={updateFilter(setCourse)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
        >
          <option>All Course</option>
          {courseOptions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={yearLevel}
          onChange={updateFilter(setYearLevel)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
        >
          <option>All Years</option>
          {yearLevelOptions.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="overflow-x-auto -mx-4 md:mx-0 border-y md:border border-gray-200 md:rounded-xl">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={`py-2.5 font-semibold whitespace-nowrap ${
                    i === 0 ? "px-4" : "px-3"
                  }`}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-gray-700"
                    >
                      {col.label}
                      <NavIcon
                        name="sort"
                        className={`w-3 h-3 ${
                          sortKey === col.key ? "text-gc-green" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              <th className="py-2.5 px-4 font-semibold text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60">
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gc-green text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {initials(row.name)}
                    </div>
                    <span className="text-gray-800 font-medium whitespace-nowrap">{row.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.studentNumber}</td>
                <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.deptCourse}</td>
                <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.yearLevel}</td>
                <td className="py-2.5 px-3 text-gray-700">{row.sex}</td>
                <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.birthday}</td>
                <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{row.contactNumber}</td>
                <td className="py-2.5 px-4 text-right">
                  <ActionMenu
                    student={row}
                    open={openMenuId === row.id}
                    onToggle={() => setOpenMenuId((id) => (id === row.id ? null : row.id))}
                    onClose={() => setOpenMenuId(null)}
                  />
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-8 text-center text-sm text-gray-400">
                  No students match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length === 0
            ? "0 results"
            : `${rangeStart} to ${rangeEnd} out of ${filtered.length.toLocaleString()} Students`}
        </p>
        <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
      </div>
    </section>
  );
}
