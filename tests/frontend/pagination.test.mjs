import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { buildPaginationPages, clampPage, getPageCount } from "../../src/lib/pagination.js"
import { buildWindowedPaginationPages } from "../../src/lib/pagination.js"

const shared = readFileSync("src/components/ui/Pagination.jsx", "utf8")
const masterlist = readFileSync("src/pages/admin/Masterlist.jsx", "utf8")
const widget = readFileSync("src/components/admin/LogbookPanel.jsx", "utf8")
const fullPage = readFileSync("src/components/admin/LogbookFullPanel.jsx", "utf8")
const admins = readFileSync("src/components/admin/AdminsPanel.jsx", "utf8")

test("page counts come from real totals and never invent extra pages", () => {
  assert.equal(getPageCount(0, 20), 1)
  assert.equal(getPageCount(1, 20), 1)
  assert.equal(getPageCount(20, 20), 1)
  assert.equal(getPageCount(21, 20), 2)
  assert.equal(getPageCount(201, 20), 11)

  assert.deepEqual(buildPaginationPages(1, getPageCount(0, 20)), [1])
  assert.deepEqual(buildPaginationPages(1, getPageCount(1, 20)), [1])
  assert.deepEqual(buildPaginationPages(1, getPageCount(21, 20)), [1, 2])
  assert.deepEqual(buildPaginationPages(1, 10), [1, 2, "…", 10])
  assert.deepEqual(buildPaginationPages(13, 25), [1, "…", 12, 13, 14, "…", 25])
})

test("shared Pagination uses real pageCount and hides controls below two pages", () => {
  assert.doesNotMatch(shared, /Math\.max\(pageCount, 10\)/)
  assert.match(shared, /import \{ buildPaginationPages, clampPage \} from "\.\.\/\.\.\/lib\/pagination\.js"/)
  assert.match(shared, /const currentPage = clampPage\(page, pageCount\)/)
  assert.match(shared, /const pages = buildPaginationPages\(currentPage, pageCount\)/)
  assert.match(shared, /\{pageCount > 1 && \(\s*<div className="flex items-center gap-1\.5">/)
  assert.match(shared, /disabled=\{currentPage === 1\}/)
  assert.match(shared, /disabled=\{currentPage === pageCount\}/)
})

test("Masterlist derives pages from backend total and hides single-page controls", () => {
  assert.match(masterlist, /const totalPages = getPageCount\(total, PAGE_SIZE\)/)
  assert.match(masterlist, /const currentPage = clampPage\(page, totalPages\)/)
  assert.match(masterlist, /buildPageList\(currentPage, totalPages\)/)
  assert.match(masterlist, /\{totalPages > 1 && \(\s*<div className="flex items-center gap-1\.5">/)
  assert.match(masterlist, /\{p === currentPage\}/)
  assert.match(masterlist, /if \(page > totalPages\) setPage\(totalPages\)/)
})

test("Dashboard logbook widget uses filtered count and keeps page rows in sync", () => {
  assert.match(widget, /const pageCount = getPageCount\(filtered\.length, PAGE_SIZE\)/)
  assert.match(widget, /const currentPage = clampPage\(page, pageCount\)/)
  assert.match(
    widget,
    /pageRows = filtered\.slice\(\s*\(currentPage - 1\) \* PAGE_SIZE,\s*currentPage \* PAGE_SIZE\s*\)/
  )
  assert.match(widget, /<Pagination\s+page=\{currentPage\}\s+pageCount=\{pageCount\}/)
  assert.match(widget, /if \(page > pageCount\) setPage\(pageCount\)/)
})

test("full Logbook page uses backend total metadata", () => {
  assert.match(fullPage, /const totalPages = getPageCount\(totalEntries, pageSize\)/)
  assert.match(fullPage, /const currentPage = clampPage\(page, totalPages\)/)
  assert.match(fullPage, /<Pagination page=\{currentPage\} pageCount=\{totalPages\}/)
  assert.match(fullPage, /if \(page > totalPages\) setPage\(totalPages\)/)
})

test("admin roster pages come from backend total and reset on search", () => {
  assert.match(admins, /const totalPages = getPageCount\(total, pageSize\)/)
  assert.match(admins, /const currentPage = clampPage\(page, totalPages\)/)
  assert.match(admins, /\{totalPages > 1 && \(\s*<div className="flex items-center gap-1\.5">/)
  assert.match(admins, /useEffect\(\(\) => \{\s*setPage\(1\)\s*\}, \[debouncedSearch\]\)/)
  assert.match(admins, /if \(page > totalPages\) setPage\(totalPages\)/)
})

test("search and filter changes reset pagination", () => {
  assert.match(
    masterlist,
    /useEffect\(\(\) => \{\s*setPage\(1\)\s*\}, \[debouncedSearch, departmentId, courseId, yearLevel\]\)/
  )
  assert.match(
    widget,
    /function updateFilter\(setter\) \{\s*return \(e\) => \{\s*setter\(e\.target\.value\);\s*setPage\(1\);/
  )
  assert.match(fullPage, /function changeSearch\(v\) \{ setSearch\(v\); setPage\(1\); \}/)
  assert.match(fullPage, /function changeDateRange\(\{ from, to, period \}\)\s*\{[\s\S]*?setDateFrom\(from\);[\s\S]*?setDateTo\(to\);[\s\S]*?setPage\(1\);/)
  assert.match(fullPage, /function changeReason\(v\) \{ setReasonFilter\(v\); setPage\(1\); \}/)
})

test("moving to the last page and then filtering clamps back to page one", () => {
  const beforeFilter = getPageCount(200, 20)
  const afterFilter = getPageCount(2, 20)

  assert.equal(beforeFilter, 10)
  assert.equal(afterFilter, 1)
  assert.equal(clampPage(beforeFilter, afterFilter), 1)
  assert.deepEqual(buildPaginationPages(clampPage(beforeFilter, afterFilter), afterFilter), [1])
})

test("compact window keeps three numbered buttons from real page counts", () => {
  assert.deepEqual(buildWindowedPaginationPages(1, 1, 3), [1])
  assert.deepEqual(buildWindowedPaginationPages(1, 2, 3), [1, 2])
  assert.deepEqual(buildWindowedPaginationPages(1, 10, 3), [1, 2, 3])
  assert.deepEqual(buildWindowedPaginationPages(5, 10, 3), [4, 5, 6])
  assert.deepEqual(buildWindowedPaginationPages(10, 10, 3), [8, 9, 10])

  assert.match(shared, /const displayedPages = maxPageButtons/)
  assert.match(shared, /\{displayedPages\.map\(\(p, i\) =>/)
  assert.match(shared, /disabled=\{currentPage === 1\}/)
  assert.match(shared, /disabled=\{currentPage === pageCount\}/)
})
