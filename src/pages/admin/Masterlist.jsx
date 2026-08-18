import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { masterlistApi } from '../../lib/api.js'
import {
  MasterlistIcon,
  SearchIcon,
  ChevronDownIcon,
  SortIcon,
  DotsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/icons.jsx'

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'student_number', label: 'Student Number', sortable: true },
  { key: 'department', label: 'Dept / Course', sortable: true },
  { key: 'year_level', label: 'Year Level', sortable: true },
  { key: 'sex', label: 'Sex', sortable: true },
  { key: 'birthday', label: 'Birthday', sortable: false },
  { key: 'contact', label: 'Contact No.', sortable: false },
  { key: 'action', label: 'Action', sortable: false },
]

const PAGE_SIZE = 15

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function initialsOf(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
}

function formatDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function buildPageList(current, total) {
  // Mirrors the mockup: 1 2 3 4 5 ... last, with current page always visible.
  const pages = new Set([1, 2, 3, 4, 5, total, current, current - 1, current + 1])
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
}

export default function Masterlist() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [departments, setDepartments] = useState([])
  const [courses, setCourses] = useState([])
  const [years, setYears] = useState([])

  const [departmentId, setDepartmentId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [yearLevel, setYearLevel] = useState('')

  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)

  // Filter dropdown data — fetched once.
  useEffect(() => {
    masterlistApi.listDepartments().then(setDepartments).catch(() => {})
    masterlistApi.listYears().then(setYears).catch(() => {})
  }, [])

  // Courses cascade off the selected department.
  useEffect(() => {
    masterlistApi
      .listCourses(departmentId || undefined)
      .then(setCourses)
      .catch(() => {})
  }, [departmentId])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, departmentId, courseId, yearLevel])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    masterlistApi
      .listStudents({
        search: debouncedSearch || undefined,
        department_id: departmentId || undefined,
        course_id: courseId || undefined,
        year_level: yearLevel || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: PAGE_SIZE,
      })
      .then((data) => {
        if (cancelled) return
        setRows(data.data)
        setTotal(data.total)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSearch, departmentId, courseId, yearLevel, sortBy, sortDir, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages])
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  function toggleSort(key) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 pt-2">
        <MasterlistIcon className="h-5 w-5 text-gc-accent" />
        <h1 className="text-lg font-extrabold tracking-wide text-gray-900">MASTERLIST</h1>
      </div>
      <p className="mt-0.5 text-sm text-gray-500">View and manage the master list of students.</p>

      <div className="mt-6 rounded-2xl border border-gray-100 p-5 shadow-sm">
        {/* Search + filters */}
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by surname, name, student ID, or course..."
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20"
            />
          </div>

          <FilterSelect
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v)
              setCourseId('')
            }}
            placeholder="All Departments"
            options={departments.map((d) => ({ value: d.department_id, label: d.department_name }))}
          />
          <FilterSelect
            value={courseId}
            onChange={setCourseId}
            placeholder="All Course"
            options={courses.map((c) => ({ value: c.course_id, label: c.course_name }))}
          />
          <FilterSelect
            value={yearLevel}
            onChange={setYearLevel}
            placeholder="All Years"
            options={years.map((y) => ({ value: y, label: y }))}
          />
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

        {/* Table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#F6F6F6] text-xs uppercase tracking-wide text-gray-500">
                {COLUMNS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                    <button
                      disabled={!col.sortable}
                      onClick={() => col.sortable && toggleSort(col.key)}
                      className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {col.label}
                      {col.sortable && (
                        <SortIcon
                          className={`h-3 w-3 ${sortBy === col.key ? 'text-gc-green-700' : 'text-gray-300'}`}
                        />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-400">
                    Loading students…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-400">
                    No students found.
                  </td>
                </tr>
              ) : (
                rows.map((student) => (
                  <tr key={student.student_id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gc-green-700 text-xs font-bold text-white">
                          {initialsOf(student.first_name, student.last_name)}
                        </div>
                        <span className="font-medium text-gray-900">{student.full_name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{student.student_id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {student.department_id ? `${student.department_name} / ${student.course_name}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{student.year_level || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{student.gender || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(student.birth_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{student.contact_number || '—'}</td>
                    <td className="relative whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === student.student_id ? null : student.student_id)}
                        className="text-gc-green-700"
                      >
                        <DotsIcon className="h-5 w-5" />
                      </button>
                      {openMenuId === student.student_id && (
                        <div className="absolute right-4 top-10 z-10 w-40 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                          <button
                            onClick={() => navigate(`/admin/masterlist/${student.student_id}`)}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            View Record
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-gray-500 lg:flex-row">
          <p>
            {total === 0 ? '0 results' : `${rangeStart} to ${rangeEnd} out of ${total.toLocaleString()} Students`}
          </p>
          <div className="flex items-center gap-1.5">
            <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeftIcon className="h-4 w-4" />
            </PageButton>
            {pageList.map((p, i) => {
              const prev = pageList[i - 1]
              const showEllipsis = prev !== undefined && p - prev > 1
              return (
                <span key={p} className="flex items-center gap-1.5">
                  {showEllipsis && <span className="px-1 text-gray-400">…</span>}
                  <PageButton active={p === page} onClick={() => setPage(p)}>
                    {p}
                  </PageButton>
                </span>
              )
            })}
            <PageButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, placeholder, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-gray-200 py-2.5 pl-4 pr-9 text-sm text-gray-700 focus:border-gc-green-700 focus:outline-none focus:ring-2 focus:ring-gc-green-700/20"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

function PageButton({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
        active
          ? 'border-gc-green-700 bg-gc-green-700 text-white'
          : 'border-gray-200 text-gray-600 hover:border-gc-green-700 disabled:cursor-not-allowed disabled:opacity-40'
      }`}
    >
      {children}
    </button>
  )
}
