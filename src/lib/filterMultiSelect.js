// src/lib/filterMultiSelect.js
// Pure helpers for categorical search filters. An empty array always means
// "All"; any non-empty array is an OR set for that one category.

const ALL_FILTER_LABELS = new Set([
  "All",
  "All Course",
  "All Courses",
  "All Department",
  "All Departments",
  "All Reason",
  "All Reasons",
  "All Year",
  "All Years",
  "All Status",
  "All Statuses",
])

const ALL_EXHIBITS = new Set(["All Reports", "All Types"])

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value)
}

export function normalizeFilterValues(value) {
  const raw = Array.isArray(value) ? value : [value]
  const seen = new Set()
  const result = []
  for (const item of raw) {
    const normalized = stringValue(item).trim()
    if (
      !normalized ||
      ALL_FILTER_LABELS.has(normalized) ||
      ALL_EXHIBITS.has(normalized) ||
      seen.has(normalized)
    ) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export function isFilterSelected(value, selected) {
  const values = normalizeFilterValues(selected)
  return values.length === 0 || values.includes(stringValue(value))
}

export function toggleFilterValue(selected, value) {
  const values = normalizeFilterValues(selected)
  const normalized = stringValue(value).trim()
  if (!normalized || ALL_FILTER_LABELS.has(normalized) || ALL_EXHIBITS.has(normalized)) {
    return []
  }
  const index = values.findIndex((item) => item === normalized)
  if (index >= 0) return values.filter((_, i) => i !== index)

  // Append in click order. Query serialization and backend parsing both
  // dedupe/sort before building cache keys or database filters.
  return [...values, normalized]
}

export function normalizeFilterOptions(options) {
  if (!options) return []
  return options.map((option) => {
    if (typeof option === "string") return { value: option, label: option }
    return { ...option, label: option.label ?? stringValue(option.value) }
  })
}

export function getSelectedLabels(selected, options) {
  const values = normalizeFilterValues(selected)
  const labels = new Map(
    normalizeFilterOptions(options).map((option) => [stringValue(option.value), option.label])
  )
  return values.map((value) => labels.get(value) ?? value)
}

export function formatFilterSelectionLabel({
  selected,
  options = [],
  allLabel = "All",
  pluralLabel = "options",
} = {}) {
  const values = normalizeFilterValues(selected)
  if (values.length === 0) return allLabel
  if (values.length === 1) return getSelectedLabels(values, options)[0] ?? allLabel
  return `${values.length} ${pluralLabel} selected`
}
