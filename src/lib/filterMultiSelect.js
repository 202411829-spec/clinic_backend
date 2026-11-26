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

function filterOptionValue(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return stringValue(value.value)
  }
  return stringValue(value)
}

function filterOptionLabel(value) {
  if (value && typeof value === "object") {
    return stringValue(value.label ?? value.name ?? filterOptionValue(value))
  }
  return stringValue(value)
}

// Builds categorical options from the records that are actually available to
// a screen. Each field getter reads one category from a record; a category's
// options honor every OTHER selected category, so dependent filters never
// suggest a value that would produce an empty result. An option may be a
// primitive or an object with `value` + `label`.
export function deriveRecordFilterOptions({
  records = [],
  fields = {},
  selections = {},
  matches = () => true,
} = {}) {
  const result = {}
  const sourceRecords = Array.isArray(records) ? records : []

  for (const [key, readValue] of Object.entries(fields)) {
    const options = new Map()
    for (const record of sourceRecords) {
      const rawValue = readValue(record)
      const value = filterOptionValue(rawValue)
      if (!value || value === "-" || !matches(record, key)) continue

      const otherCategoriesMatch = Object.entries(fields).every(([otherKey, otherReader]) => {
        if (otherKey === key) return true
        return isFilterSelected(filterOptionValue(otherReader(record)), selections[otherKey])
      })
      if (!otherCategoriesMatch) continue
      if (!options.has(value)) {
        options.set(value, { value, label: filterOptionLabel(rawValue) || value })
      }
    }
    result[key] = Array.from(options.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label))
    )
  }
  return result
}

// Drops selections that are no longer offered after another filter changed.
// Returning the original reference when nothing changed avoids needless React
// state updates.
export function reconcileRecordFilterSelections({ selections = {}, options = {} } = {}) {
  const next = {}
  let changed = false

  for (const [key, value] of Object.entries(selections)) {
    const normalized = normalizeFilterValues(value)
    const allowed = new Set(
      normalizeFilterOptions(options[key]).map((option) => stringValue(option.value))
    )
    const kept = normalized.filter((item) => allowed.has(item))
    const isSame =
      kept.length === normalized.length && kept.every((item, index) => item === normalized[index])
    next[key] = isSame ? value : kept
    if (!isSame) changed = true
  }

  return { next, changed }
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
