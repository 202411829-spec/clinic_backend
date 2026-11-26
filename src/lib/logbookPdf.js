// src/lib/logbookPdf.js
// Pure layout/data helpers plus jsPDF drawing for the full Logbook export.
// The PDF is a landscape document, not a screenshot of the web table: it packs
// every filtered row across pages, repeats a compact document header, keeps a
// row intact, and prints a page footer.

import { getPageCount } from "./pagination.js"

// A4 landscape: 297mm wide with 12mm margins => 273mm printable.
export const LOGBOOK_PDF_MARGIN_MM = 12
export const LOGBOOK_EXPORT_PAGE_SIZE = 100

export const LOGBOOK_PDF_COLUMNS = [
  { key: "dateTime", label: "Date & Time", width: 25 },
  { key: "patient", label: "Patient", width: 58 },
  { key: "deptCourse", label: "Dept / Course", width: 38 },
  { key: "reason", label: "Reason", width: 30 },
  { key: "complaint", label: "Complaint", width: 70 },
  { key: "medicine", label: "Medicine", width: 52 },
]

export function normalizePdfCell(value, fallback = "-") {
  const text = String(value ?? "").trim()
  return text || fallback
}

/**
 * Patient identity lives in one wide column so age no longer gets its own
 * narrow (header-breaking) cell. A type label is added only when the backend
 * explicitly supplied one — a missing student ID is never treated as proof of
 * a walk-in visit.
 */
export function buildLogbookPatientCell(row = {}) {
  const identity = []
  const cellValue = (value) => {
    const text = normalizePdfCell(value, "")
    return text && text !== "-" ? text : ""
  }
  const name = cellValue(row.name)
  const studentId = cellValue(row.studentId)
  const age = cellValue(row.age)
  const sex = cellValue(row.sex)

  if (name) identity.push(name)
  if (studentId) identity.push(`ID ${studentId}`)
  if (age) identity.push(`Age ${age}`)
  if (sex) identity.push(sex)

  let patient = identity.length ? identity.join(" | ") : "Patient details unavailable"
  const explicitType = String(row.patientType ?? "").trim()
  if (explicitType) patient = `${patient} | ${explicitType}`
  return patient
}

export function buildLogbookPdfRows(rows = []) {
  return rows.map((row) => ({
    dateTime: normalizePdfCell(row.dateTime),
    patient: buildLogbookPatientCell(row),
    deptCourse: normalizePdfCell(row.deptCourse),
    reason: normalizePdfCell(row.reason),
    complaint: normalizePdfCell(row.complaint),
    medicine: normalizePdfCell(row.medicine),
  }))
}

export function buildLogbookPdfMeta({
  dateSummary = "All Dates",
  departmentLabel = "All Departments",
  courseLabel = "All Course",
  reasonLabel = "All Reasons",
  search = "",
  total = 0,
} = {}) {
  const lines = [
    `Date Range: ${dateSummary}`,
    `Department: ${departmentLabel}`,
    `Course: ${courseLabel}`,
    `Reason: ${reasonLabel}`,
  ]
  if (search) lines.push(`Search: ${search}`)
  lines.push(`Total Records: ${Math.max(0, Number(total) || 0)}`)
  return lines
}

/**
 * Pull every page of the SAME filtered query the screen uses. The backend caps
 * page_size at 100, so larger result sets are walked page by page instead of
 * silently exporting only the visible page.
 */
export async function fetchAllLogbookRows({
  list,
  params = {},
  pageSize = LOGBOOK_EXPORT_PAGE_SIZE,
} = {}) {
  if (typeof list !== "function") throw new Error("A logbook list function is required.")

  const size = Math.max(1, Math.min(LOGBOOK_EXPORT_PAGE_SIZE, Number(pageSize) || LOGBOOK_EXPORT_PAGE_SIZE))
  const baseParams = { ...params, page_size: size }
  const first = await list({ ...baseParams, page: 1 })
  const total = Math.max(0, Number(first?.total ?? 0))
  const rows = [...(first?.logbook ?? [])]
  const pageCount = getPageCount(total, size)

  for (let page = 2; page <= pageCount; page += 1) {
    const response = await list({ ...baseParams, page })
    rows.push(...(response?.logbook ?? []))
  }

  return { rows, total }
}

export async function drawLogbookPdf(doc, { rows = [], meta = [] } = {}) {
  // Imported lazily so the pure helpers above stay importable in Node tests.
  const { pdfLetterhead } = await import("./pdf.js")

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = LOGBOOK_PDF_MARGIN_MM
  const usableWidth = pageWidth - margin * 2
  const right = margin + usableWidth
  const rawWidth = LOGBOOK_PDF_COLUMNS.reduce((sum, col) => sum + col.width, 0)
  const columns = LOGBOOK_PDF_COLUMNS.map((col) => ({
    ...col,
    width: (col.width / rawWidth) * usableWidth,
  }))

  const cellPad = 1.8
  const lineHeight = 3.6
  const headerHeight = 8
  const bottomLimit = pageHeight - margin - 5
  let y = margin

  function drawTableHeader(top) {
    doc.setFillColor("#EEF7F0")
    doc.rect(margin, top, usableWidth, headerHeight, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.3)
    doc.setTextColor("#044B0E")

    let x = margin
    columns.forEach((col) => {
      doc.text(col.label, x + cellPad, top + 3.6)
      x += col.width
    })

    doc.setDrawColor(170)
    doc.setLineWidth(0.2)
    doc.rect(margin, top, usableWidth, headerHeight)
    x = margin
    columns.slice(0, -1).forEach((col) => {
      x += col.width
      doc.line(x, top, x, top + headerHeight)
    })
  }

  async function drawPageHeader() {
    y = await pdfLetterhead(doc, y, { margin, sealSize: 12 })

    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor("#044B0E")
    doc.text("CLINIC LOGBOOK", pageWidth / 2, y, { align: "center" })
    y += 5.5

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor("#4A564E")
    meta.forEach((line) => {
      doc.text(String(line), margin, y, { maxWidth: usableWidth })
      y += 3.2
    })
    y += 2

    drawTableHeader(y)
    y += headerHeight
  }

  await drawPageHeader()

  const pdfRows = buildLogbookPdfRows(rows)
  if (pdfRows.length === 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor("#6B776F")
    doc.text("No logbook records match the selected filters.", margin, y + 6)
  }

  for (let index = 0; index < pdfRows.length; index += 1) {
    const row = pdfRows[index]
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.2)

    const lines = columns.map((col) =>
      doc.splitTextToSize(row[col.key], col.width - cellPad * 2).slice(0, 5)
    )
    const lineCount = Math.max(1, ...lines.map((cellLines) => cellLines.length))
    const rowHeight = lineCount * lineHeight + 2.4

    // Keep the whole row on one page.
    if (y + rowHeight > bottomLimit) {
      doc.addPage()
      y = margin
      await drawPageHeader()
    }

    if (index % 2 === 1) {
      doc.setFillColor("#FAFBFA")
      doc.rect(margin, y, usableWidth, rowHeight, "F")
    }

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.2)
    doc.setTextColor("#1C2620")
    let x = margin
    lines.forEach((cellLines, colIndex) => {
      let textY = y + 3.4
      cellLines.forEach((line) => {
        doc.text(line, x + cellPad, textY)
        textY += lineHeight
      })
      x += columns[colIndex].width
    })

    doc.setDrawColor(205)
    doc.setLineWidth(0.15)
    doc.line(margin, y + rowHeight, right, y + rowHeight)
    x = margin
    columns.slice(0, -1).forEach((col) => {
      x += col.width
      doc.line(x, y, x, y + rowHeight)
    })

    y += rowHeight
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor("#6B776F")
    doc.text("Gordon College Health Services Unit - Clinic Logbook", margin, pageHeight - 5)
    doc.text(`Page ${page} of ${pageCount}`, right, pageHeight - 5, { align: "right" })
  }
}

export async function downloadLogbookPdf({
  rows = [],
  meta = [],
  fileName = "logbook-report.pdf",
} = {}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  await drawLogbookPdf(doc, { rows, meta })
  doc.save(fileName)
}
