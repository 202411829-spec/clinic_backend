// Shared pagination math. Components still own their existing visuals; these
// helpers only keep page counts/clamping/ellipsis derived from real data.

export function getPageCount(totalRecords, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1)
  const total = Math.max(0, Number(totalRecords) || 0)
  return Math.max(1, Math.ceil(total / size))
}

export function clampPage(page, pageCount) {
  const count = Math.max(1, Number(pageCount) || 1)
  const current = Math.max(1, Number(page) || 1)
  return Math.min(current, count)
}

export function buildPaginationPages(page, pageCount, window = 1) {
  const count = Math.max(1, Number(pageCount) || 1)
  const current = clampPage(page, count)
  const pages = []

  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || (p >= current - window && p <= current + window)) {
      pages.push(p)
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…")
    }
  }

  return pages
}

// Compact window for pages that want a fixed number of numbered buttons
// (Appointments uses three). Unlike buildPaginationPages this never inserts
// ellipses; prev/next remain the way to move beyond the window.
export function buildWindowedPaginationPages(page, pageCount, maxButtons = 3) {
  const count = Math.max(1, Number(pageCount) || 1)
  const max = Math.max(1, Math.floor(Number(maxButtons) || 3))
  const current = clampPage(page, count)
  const width = Math.min(max, count)
  const centered = current - Math.floor(width / 2)
  const start = Math.max(1, Math.min(centered, count - width + 1))
  const pages = []

  for (let p = start; p < start + width; p++) {
    pages.push(p)
  }

  return pages
}
