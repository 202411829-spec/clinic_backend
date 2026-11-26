// src/lib/responsivePageSize.js
// Pure math for the full Logbook page's viewport-aware row count. Components
// still own measuring/resize wiring; this helper stays dependency-free so the
// clamping rules can be tested in Node.

export const DEFAULT_MIN_PAGE_SIZE = 5
export const DEFAULT_MAX_PAGE_SIZE = 100
export const DEFAULT_ROW_HEIGHT_PX = 44
export const DEFAULT_HEADER_HEIGHT_PX = 36
export const DEFAULT_BOTTOM_RESERVE_PX = 180

export function clampResponsivePageSize(
  size,
  minRows = DEFAULT_MIN_PAGE_SIZE,
  maxRows = DEFAULT_MAX_PAGE_SIZE
) {
  const min = Math.max(1, Math.floor(Number(minRows) || DEFAULT_MIN_PAGE_SIZE))
  const max = Math.max(min, Math.floor(Number(maxRows) || DEFAULT_MAX_PAGE_SIZE))
  const requested = Math.floor(Number(size) || min)
  return Math.min(max, Math.max(min, requested))
}

/**
 * Rows that fit beneath the table's top edge with room left for pagination and
 * the bottom trigger. Inputs are CSS pixels.
 */
export function getResponsivePageSize({
  viewportHeight,
  tableTop,
  rowHeight = DEFAULT_ROW_HEIGHT_PX,
  minRows = DEFAULT_MIN_PAGE_SIZE,
  maxRows = DEFAULT_MAX_PAGE_SIZE,
  headerHeight = DEFAULT_HEADER_HEIGHT_PX,
  bottomReserve = DEFAULT_BOTTOM_RESERVE_PX,
} = {}) {
  const viewport = Math.max(0, Number(viewportHeight) || 0)
  const top = Math.max(0, Number(tableTop) || 0)
  const row = Math.max(1, Number(rowHeight) || DEFAULT_ROW_HEIGHT_PX)
  const header = Math.max(0, Number(headerHeight) || 0)
  const reserve = Math.max(0, Number(bottomReserve) || 0)

  const available = viewport - top - reserve - header
  if (available <= 0) return clampResponsivePageSize(minRows, minRows, maxRows)

  return clampResponsivePageSize(Math.floor(available / row), minRows, maxRows)
}
