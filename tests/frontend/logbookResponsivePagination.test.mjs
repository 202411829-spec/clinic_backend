import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  clampResponsivePageSize,
  getResponsivePageSize,
} from "../../src/lib/responsivePageSize.js"

const fullPage = readFileSync("src/components/admin/LogbookFullPanel.jsx", "utf8")

test("responsive page size fits the visible table and clamps to sane bounds", () => {
  assert.equal(getResponsivePageSize({
    viewportHeight: 900,
    tableTop: 220,
    rowHeight: 44,
  }), 10)

  assert.equal(getResponsivePageSize({
    viewportHeight: 700,
    tableTop: 260,
    rowHeight: 44,
  }), 5)

  assert.equal(getResponsivePageSize({
    viewportHeight: 600,
    tableTop: 400,
    rowHeight: 44,
  }), 5)

  assert.equal(getResponsivePageSize({
    viewportHeight: 3000,
    tableTop: 100,
    rowHeight: 44,
  }), 61)

  assert.equal(getResponsivePageSize({
    viewportHeight: 3000,
    tableTop: 100,
    rowHeight: 44,
    maxRows: 20,
  }), 20)
})

test("responsive page size never accepts zero or inverted bounds", () => {
  assert.equal(clampResponsivePageSize(0), 5)
  assert.equal(clampResponsivePageSize(999), 100)
  assert.equal(clampResponsivePageSize(50, 8, 12), 12)
  assert.equal(getResponsivePageSize({}), 5)
})

test("full Logbook measures the panel instead of using a fixed 20-row page", () => {
  assert.match(fullPage, /import \{ getResponsivePageSize \} from "\.\.\/\.\.\/lib\/responsivePageSize\.js"/)
  assert.match(fullPage, /const \[pageSize, setPageSize\] = useState\(FALLBACK_PAGE_SIZE\)/)
  assert.match(fullPage, /window\.addEventListener\("resize", recalculate\)/)
  assert.match(fullPage, /new ResizeObserver\(recalculate\)/)
  assert.match(fullPage, /tableTop: Math\.max\(0, wrapper\.getBoundingClientRect\(\)\.top\)/)
  assert.match(fullPage, /rowHeightRef\.current = measuredHeight/)
  assert.match(fullPage, /const totalPages = getPageCount\(totalEntries, pageSize\)/)
  assert.match(fullPage, /if \(page > totalPages\) setPage\(totalPages\)/)
})
