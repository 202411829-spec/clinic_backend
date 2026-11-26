// src/lib/logbookQuery.js
// Shared query-parameter builder for the full Logbook list. The backend owns
// filtering/pagination; this just keeps every caller (screen refresh and PDF
// export) asking for the same filtered set.

// Categorical filters arrive as arrays (empty = All). Keep scalar strings
// working for older callers, and drop blank/duplicate entries so the api
// layer's sort/dedupe always sees a stable value set.
function normalizeFilterParam(value) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (item === null || item === undefined ? "" : String(item).trim()))
      .filter(Boolean)
    return items.length ? [...new Set(items)] : ""
  }
  return value
}

export function buildLogbookQueryParams({
  page = 1,
  pageSize = 20,
  search = "",
  dateFrom = "",
  dateTo = "",
  reasonFilter = "",
  departmentFilter = "",
  courseFilter = "",
} = {}) {
  const params = {
    page: Math.max(1, Number(page) || 1),
    page_size: Math.max(1, Number(pageSize) || 20),
  }

  if (search) params.search = search
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo

  // Empty arrays (or blank scalars) are omitted — the backend treats an
  // absent filter as "All", and api.js emits arrays as repeated keys
  // (reason_id=1&reason_id=2) for OR-within-category.
  const reasonId = normalizeFilterParam(reasonFilter)
  if (reasonId) params.reason_id = reasonId
  const departmentId = normalizeFilterParam(departmentFilter)
  if (departmentId) params.department_id = departmentId
  const courseId = normalizeFilterParam(courseFilter)
  if (courseId) params.course_id = courseId

  return params
}
