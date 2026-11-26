import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { buildLogbookQueryParams } from "../../src/lib/logbookQuery.js"
import {
  LOGBOOK_PDF_COLUMNS,
  LOGBOOK_PDF_MARGIN_MM,
  buildLogbookPdfMeta,
  buildLogbookPdfRows,
  fetchAllLogbookRows,
  normalizePdfCell,
} from "../../src/lib/logbookPdf.js"

const fullPage = readFileSync("src/components/admin/LogbookFullPanel.jsx", "utf8")
const widget = readFileSync("src/components/admin/LogbookPanel.jsx", "utf8")
const logbookRouter = readFileSync("routers/logbook.py", "utf8")
const pdfLib = readFileSync("src/lib/logbookPdf.js", "utf8")
const pdfHelper = readFileSync("src/lib/pdf.js", "utf8")

test("screen refresh and PDF export build the same filtered query", () => {
  assert.deepEqual(buildLogbookQueryParams({
    page: 3,
    pageSize: 25,
    search: "juan",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-25",
    reasonFilter: "7",
    departmentFilter: "2",
    courseFilter: "4",
  }), {
    page: 3,
    page_size: 25,
    search: "juan",
    date_from: "2026-11-01",
    date_to: "2026-11-25",
    reason_id: "7",
    department_id: "2",
    course_id: "4",
  })

  assert.deepEqual(buildLogbookQueryParams({ page: 1, pageSize: 20 }), {
    page: 1,
    page_size: 20,
  })
})

test("PDF export walks every filtered page using the backend cap", async () => {
  const calls = []
  const list = async (params) => {
    calls.push(params)
    if (params.page === 1) return { total: 3, logbook: [{ id: 1 }] }
    return { total: 3, logbook: [{ id: 2 }, { id: 3 }] }
  }

  const result = await fetchAllLogbookRows({
    list,
    params: { page: 1, page_size: 20, search: "juan" },
    pageSize: 2,
  })

  assert.deepEqual(result.rows.map((row) => row.id), [1, 2, 3])
  assert.equal(result.total, 3)
  assert.deepEqual(calls.map((call) => call.page), [1, 2])
  assert.deepEqual(calls.map((call) => call.page_size), [2, 2])
  assert.ok(calls.every((call) => call.search === "juan"))
})

test("landscape columns keep patient and complaint wide and remove the narrow Age header", () => {
  const totalWidth = LOGBOOK_PDF_COLUMNS.reduce((sum, col) => sum + col.width, 0)
  assert.equal(totalWidth, 297 - LOGBOOK_PDF_MARGIN_MM * 2)
  assert.deepEqual(LOGBOOK_PDF_COLUMNS.map((col) => col.label), [
    "Date & Time",
    "Patient",
    "Dept / Course",
    "Reason",
    "Complaint",
    "Medicine",
  ])

  const patientWidth = LOGBOOK_PDF_COLUMNS.find((col) => col.key === "patient").width
  const complaintWidth = LOGBOOK_PDF_COLUMNS.find((col) => col.key === "complaint").width
  assert.ok(patientWidth >= 58)
  assert.ok(complaintWidth >= 70)
  assert.doesNotMatch(JSON.stringify(LOGBOOK_PDF_COLUMNS), /"Age"/)
})

test("PDF rows show dashes for blanks and never infer a walk-in patient", () => {
  assert.equal(normalizePdfCell(""), "-")
  assert.equal(normalizePdfCell("  Headache  "), "Headache")

  const [missing] = buildLogbookPdfRows([{
    dateTime: "",
    studentId: "-",
    name: "-",
    age: "-",
    sex: "-",
    deptCourse: "",
    reason: "",
    complaint: "",
    medicine: "",
  }])
  assert.equal(missing.dateTime, "-")
  assert.equal(missing.patient, "Patient details unavailable")
  assert.equal(missing.complaint, "-")
  assert.doesNotMatch(missing.patient, /Walk-in/)

  const [explicit] = buildLogbookPdfRows([{
    name: "Doe, Juan",
    studentId: "202311330",
    age: 20,
    sex: "M",
    patientType: "Walk-in",
  }])
  assert.match(explicit.patient, /Doe, Juan/)
  assert.match(explicit.patient, /ID 202311330/)
  assert.match(explicit.patient, /Age 20/)
  assert.match(explicit.patient, /Walk-in/)
})

test("PDF meta is compact and reports the number of exported records", () => {
  assert.deepEqual(buildLogbookPdfMeta({
    dateSummary: "All Dates",
    departmentLabel: "All Departments",
    courseLabel: "All Course",
    reasonLabel: "All Reasons",
    search: "",
    total: 12,
  }), [
    "Date Range: All Dates",
    "Department: All Departments",
    "Course: All Course",
    "Reason: All Reasons",
    "Total Records: 12",
  ])

  const withSearch = buildLogbookPdfMeta({ search: "juan", total: 3 })
  assert.match(withSearch.join("\n"), /Search: juan/)
  assert.match(withSearch.join("\n"), /Total Records: 3/)
})

test("full Logbook draws a paged landscape document and repeats its header", () => {
  assert.match(fullPage, /fetchAllLogbookRows\(\{/)
  assert.match(fullPage, /downloadLogbookPdf\(\{/)
  assert.match(fullPage, /pageSize: MAX_PAGE_SIZE/)
  assert.match(fullPage, /total: rows\.length/)
  assert.doesNotMatch(fullPage, /nodeToPng/)
  assert.doesNotMatch(fullPage, /flushSync/)

  assert.match(pdfLib, /orientation: "landscape"/)
  assert.match(pdfLib, /await drawPageHeader\(\)/)
  assert.match(pdfLib, /doc\.addPage\(\)/)
  assert.match(pdfLib, /if \(y \+ rowHeight > bottomLimit\)/)
  assert.match(pdfLib, /Page \$\{page\} of \$\{pageCount\}/)
  assert.match(pdfLib, /await pdfLetterhead\(doc, y, \{ margin, sealSize: 12 \}\)/)

  assert.match(pdfHelper, /const pageWidth = doc\.internal\.pageSize\.getWidth\(\)/)
  assert.match(pdfHelper, /const center = pageWidth \/ 2/)
  assert.match(pdfHelper, /const rightEdge = pageWidth - margin/)
})

test("both Logbook tables show the real student ID", () => {
  assert.match(fullPage, /studentId: r\.student_id \?\? "-"/)
  assert.match(fullPage, /<th[^>]*>Student ID<\/th>/)
  assert.match(fullPage, /\{entry\.studentId\}/)

  assert.match(widget, /studentId: r\.student_id \?\? "-"/)
  assert.match(widget, /<th[^>]*>Student ID<\/th>/)
  assert.match(widget, /\{row\.studentId\}/)
  assert.match(widget, /colSpan=\{9\}/)
})

test("Logbook search reuses the Appointments rule and the backend already searches student IDs", () => {
  assert.match(widget, /import \{ matchesAppointmentSearch \} from "\.\.\/\.\.\/lib\/appointmentSlots\.js"/)
  assert.match(widget, /matchesAppointmentSearch\(entry, search, \[/)
  assert.match(widget, /matchesAppointmentSearch\(e, search, \[/)
  assert.doesNotMatch(widget, /const q = search\.trim\(\)\.toLowerCase\(\)/)

  assert.match(logbookRouter, /student_id\.ilike\.\{like\}/)
  assert.match(logbookRouter, /full_name\.ilike\.\{like\}/)
})
