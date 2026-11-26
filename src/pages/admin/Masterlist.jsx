import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayPosition } from '../../components/ui/PortalOverlay.jsx'
import { GC_OVERLAY_Z } from '../../lib/gcMotion.js'
import { useNavigate } from 'react-router-dom'
import { masterlistApi } from '../../lib/api.js'
import { useDebouncedValue } from '../../lib/hooks.js'
import { clampPage, getPageCount } from '../../lib/pagination.js'
import {
  MasterlistIcon,
  SearchIcon,
  SortIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/ui/icons.jsx'
import NavIcon from '../../components/ui/NavIcon.jsx'
import FilterMultiSelect from '../../components/ui/FilterMultiSelect.jsx'
import {
  deriveRecordFilterOptions,
  reconcileRecordFilterSelections,
} from '../../lib/filterMultiSelect.js'
import SkeletonRows from '../../components/ui/SkeletonRows.jsx'
import { PageHeader } from '../../components/ui/primitives.jsx'

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

  // Category-free rows used only to derive filter options. The table below
  // still uses server-side filtering/pagination over the selected values.
  const [optionRows, setOptionRows] = useState([])

  // Categorical search filters are OR sets; empty arrays mean "All".
  const [departmentId, setDepartmentId] = useState([])
  const [courseId, setCourseId] = useState([])
  const [yearLevel, setYearLevel] = useState([])

  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)

  // Fetch the search-matched superset once per search change. Categories are
  // derived from these rows while ignoring their own selection, which keeps
  // every option backed by a real student without contradicting other filters.
  useEffect(() => {
    const OPTION_PAGE_SIZE = 1000
    let cancelled = false

    async function loadOptions() {
      const first = await masterlistApi.listStudents({
        search: debouncedSearch || undefined,
        sort_by: 'name',
        sort_dir: 'asc',
        page: 1,
        page_size: OPTION_PAGE_SIZE,
      })
      const rows = [...(first?.data || [])]
      const total = Number(first?.total || 0)
      for (let pageNumber = 2; pageNumber <= getPageCount(total, OPTION_PAGE_SIZE); pageNumber += 1) {
        const response = await masterlistApi.listStudents({
          search: debouncedSearch || undefined,
          sort_by: 'name',
          sort_dir: 'asc',
          page: pageNumber,
          page_size: OPTION_PAGE_SIZE,
        })
        rows.push(...(response?.data || []))
      }
      if (!cancelled) setOptionRows(rows)
    }

    loadOptions().catch(() => {
      if (!cancelled) setOptionRows([])
    })
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, departmentId, courseId, yearLevel])

  // Abort controller for the list fetch — a new search/page/filter change
  // cancels the previous in-flight request so responses can't land out of order
  // (debounce already gates how often it fires, but doesn't stop the pile-up).
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let cancelled = false
    setLoading(true)
    setError('')

    masterlistApi
      .listStudents(
        {
          search: debouncedSearch || undefined,
          department_id: departmentId.length ? departmentId : undefined,
          course_id: courseId.length ? courseId : undefined,
          year_level: yearLevel.length ? yearLevel : undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: PAGE_SIZE,
        },
        { signal: controller.signal }
      )
      .then((data) => {
        if (cancelled) return
        setRows(data.data)
        setTotal(data.total)
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [debouncedSearch, departmentId, courseId, yearLevel, sortBy, sortDir, page])

  const totalPages = getPageCount(total, PAGE_SIZE)
  const currentPage = clampPage(page, totalPages)
  const pageList = useMemo(() => buildPageList(currentPage, totalPages), [currentPage, totalPages])
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total)

  const filterFields = useMemo(
    () => ({
      department: (row) => ({ value: row.department_id, label: row.department_name }),
      course: (row) => ({ value: row.course_id, label: row.course_name }),
      year: (row) => row.year_level,
    }),
    []
  )
  const filterSelections = useMemo(
    () => ({ department: departmentId, course: courseId, year: yearLevel }),
    [departmentId, courseId, yearLevel]
  )
  const derivedOptions = useMemo(
    () =>
      deriveRecordFilterOptions({
        records: optionRows,
        fields: filterFields,
        selections: filterSelections,
      }),
    [optionRows, filterFields, filterSelections]
  )
  const departmentOptions = derivedOptions.department || []
  const courseOptions = derivedOptions.course || []
  const yearOptions = derivedOptions.year || []

  useEffect(() => {
    const { next, changed } = reconcileRecordFilterSelections({
      selections: filterSelections,
      options: derivedOptions,
    })
    if (!changed) return
    if (next.department !== departmentId) setDepartmentId(next.department)
    if (next.course !== courseId) setCourseId(next.course)
    if (next.year !== yearLevel) setYearLevel(next.year)
  }, [derivedOptions, filterSelections, departmentId, courseId, yearLevel])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

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
      <PageHeader
        className="pt-2"
        title="Masterlist"
        subtitle="View and manage the master list of students."
        icon={<MasterlistIcon className="h-5 w-5" />}
      />

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

          <FilterMultiSelect
            value={departmentId}
            onChange={setDepartmentId}
            allLabel="All Departments"
            pluralLabel="Departments"
            ariaLabel="Filter by department"
            triggerTestId="masterlist-department-filter"
            options={departmentOptions}
          />
          <FilterMultiSelect
            value={courseId}
            onChange={setCourseId}
            allLabel="All Course"
            pluralLabel="Courses"
            ariaLabel="Filter by course"
            triggerTestId="masterlist-course-filter"
            options={courseOptions}
          />
          <FilterMultiSelect
            value={yearLevel}
            onChange={setYearLevel}
            allLabel="All Years"
            pluralLabel="Years"
            ariaLabel="Filter by year level"
            triggerTestId="masterlist-year-filter"
            options={yearOptions}
          />
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

        {/* Table: only scrolls horizontally on small screens (below md),
            where the min-width kicks in. On desktop the min-width is
            removed and the table fits the panel width with no side
            scroll — columns share the available space instead. */}
        <div className="tbl-scroll mt-5">
          <table className="tbl min-w-[900px] md:min-w-0">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap">
                    <button
                      disabled={!col.sortable}
                      onClick={() => col.sortable && toggleSort(col.key)}
                      className={`btn-press flex items-center gap-1 transition-colors duration-150 ${
                        col.sortable ? 'cursor-pointer hover:text-brand-700' : 'cursor-default'
                      }`}
                    >
                      {col.label}
                      {col.sortable && (
                        <SortIcon
                          className={`h-3 w-3 transition-transform duration-200 ${
                            sortBy === col.key
                              ? `text-gc-green-700 ${sortDir === 'desc' ? 'rotate-180' : ''}`
                              : 'text-gray-300'
                          }`}
                        />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody key={`${page}-${debouncedSearch}-${departmentId}-${courseId}-${yearLevel}-${sortBy}-${sortDir}`} className="tbl-animate">
              {loading ? (
                <SkeletonRows rows={5} cells={COLUMNS.length} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center text-ink-400">
                    No students found.
                  </td>
                </tr>
              ) : (
                rows.map((student) => (
                  <tr key={student.student_id} className="row-hover">
                    <td className="min-w-[200px]">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white">
                          {initialsOf(student.first_name, student.last_name)}
                        </div>
                        <span className="cell-wrap font-medium text-ink-900">{student.full_name}</span>
                      </div>
                    </td>
                    <td className="tnum whitespace-nowrap">{student.student_id}</td>
                    {/* Longest cell in the row — lets text wrap on desktop
                        (where the table no longer scrolls) so it doesn't
                        force the whole table wider than the panel; mobile
                        keeps it on one line since that view scrolls anyway. */}
                    <td className="cell-wrap min-w-[200px]">
                      {student.department_id ? `${student.department_name} / ${student.course_name}` : '—'}
                    </td>
                    <td className="whitespace-nowrap">{student.year_level || '—'}</td>
                    <td className="whitespace-nowrap">{student.gender || '—'}</td>
                    <td className="whitespace-nowrap">{formatDate(student.birth_date)}</td>
                    <td className="whitespace-nowrap">{student.contact_number || '—'}</td>
                    <td className="whitespace-nowrap">
                      <RowActionsMenu
                        open={openMenuId === student.student_id}
                        onToggle={() =>
                          setOpenMenuId(openMenuId === student.student_id ? null : student.student_id)
                        }
                        onClose={() => setOpenMenuId(null)}
                        onViewRecord={() => navigate(`/admin/masterlist/${student.student_id}`)}
                      />
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
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeftIcon className="h-4 w-4" />
              </PageButton>
              {pageList.map((p, i) => {
                const prev = pageList[i - 1]
                const showEllipsis = prev !== undefined && p - prev > 1
                return (
                  <span key={p} className="flex items-center gap-1.5">
                    {showEllipsis && <span className="px-1 text-gray-400">…</span>}
                    <PageButton active={p === currentPage} onClick={() => setPage(p)}>
                      {p}
                    </PageButton>
                  </span>
                )
              })}
              <PageButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <ChevronRightIcon className="h-4 w-4" />
              </PageButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const MENU_WIDTH = 160 // matches w-40

// Renders the row's "..." action menu in a portal at document.body, positioned
// with `fixed` coordinates computed from the button's location. This avoids the
// menu being clipped by the table wrapper's `overflow-x-auto`, which forces
// `overflow-y: auto` on that container too (a CSS quirk) and was cutting the
// "View Record" option off, requiring a scroll to reach it.
function RowActionsMenu({ open, onToggle, onClose, onViewRecord }) {
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const position = useOverlayPosition({
    triggerRef: buttonRef,
    panelRef: menuRef,
    enabled: open,
    align: 'right',
    preferredWidth: MENU_WIDTH,
    estimatedHeight: 120,
  })

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="icon-btn h-8 w-8 rounded-full text-gc-green-700 hover:bg-gc-green-700/10"
        aria-label="Row actions"
      >
        <NavIcon name="dots" className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              zIndex: GC_OVERLAY_Z.dropdown,
              visibility: position.hidden ? 'hidden' : 'visible',
            }}
            className="gc-overlay-portal overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg origin-top animate-pop-in motion-reduce:animate-none"
          >
            <button
              onClick={() => {
                onViewRecord()
                onClose()
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 hover:pl-5"
            >
              View Record
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}

function PageButton({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-press flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${
        active
          ? 'border-gc-green-700 bg-gc-green-700 text-white'
          : 'border-gray-200 text-gray-600 hover:border-gc-green-700 disabled:cursor-not-allowed disabled:opacity-40'
      }`}
    >
      {children}
    </button>
  )
}
