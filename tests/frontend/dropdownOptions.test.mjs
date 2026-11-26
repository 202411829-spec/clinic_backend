import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { buildAppointmentDepartmentOptions } from "../../src/lib/appointmentSlots.js"

const read = (relativePath) => readFileSync(relativePath, "utf8")

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : []
  })
}

test("UniversalDropdown renders only real options", () => {
  const source = read("src/components/ui/UniversalDropdown.jsx")

  assert.match(source, /const items = opts/)
  assert.match(source, /displayLabel = selected \? selected\.label : placeholder/)
  assert.doesNotMatch(source, /value: "", label: placeholder/)
  assert.doesNotMatch(source, /showPlaceholderOption/)
  assert.doesNotMatch(source, /opt\.value === "" && \(value === "" \|\| value == null\)/)
  assert.match(source, /\{items\.map\(\(opt, index\) => \{/)
})

test("custom dropdowns do not inject generic placeholder rows", () => {
  const sources = [
    "src/components/ui/UniversalDropdown.jsx",
    "src/components/admin/PeriodDropdown.jsx",
  ].map((file) => ({ file, source: read(file) }))

  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /value:\s*["']{2}/, `${file} should not define an empty-value option`)
    assert.doesNotMatch(
      source,
      /label:\s*["'](?:Select|Choose an option|Select an option)["']/i,
      `${file} should not define a generic placeholder option`
    )
    assert.doesNotMatch(
      source,
      /\[\s*["'](?:Select|Choose an option|Select an option)["']/i,
      `${file} should not prepend a generic placeholder option`
    )
  }
})

test("no source file defines an empty-value or generic placeholder option", () => {
  const files = walk("src")
  assert.ok(files.length > 0)

  for (const file of files) {
    const source = read(file)
    assert.doesNotMatch(source, /value:\s*["']{2}/, `${file} defines an empty-value option`)
    assert.doesNotMatch(
      source,
      /label:\s*["'](?:Select|Choose an option|Select an option)["']/i,
      `${file} defines a generic placeholder option`
    )
  }
})

test("Department multi-select exposes every real department and no placeholder", () => {
  const options = buildAppointmentDepartmentOptions([
    {
      bookings: [
        { dept: "College of Computer Studies (CCS)" },
        { dept: "College of Computer Studies (CCS)" },
      ],
    },
  ])

  assert.deepEqual(options, ["College of Computer Studies (CCS)"])
  assert.equal(options.length, 1)
  assert.equal(options.includes("Choose an option"), false)
  assert.equal(options.includes("Select"), false)
})

test("Appointments panels derive Department options from their bookings", () => {
  for (const file of [
    "src/components/admin/AppointmentsPanel.jsx",
    "src/components/admin/AppointmentsFullPanel.jsx",
  ]) {
    const source = read(file)
    assert.match(source, /deriveRecordFilterOptions/)
    assert.match(source, /department: \(booking\) => booking\?\.dept/)
    assert.match(source, /const \{ department: departments, course: courses, reason: reasons \} = options;/)
    assert.doesNotMatch(source, /const \{ departments, courses, reasons \} = options;/)
  }
})

test("legitimate all-filter options remain intact", () => {
  const logbook = read("src/components/admin/LogbookPanel.jsx")
  const logbookFull = read("src/components/admin/LogbookFullPanel.jsx")
  const reports = read("src/components/admin/ReportsFullPanel.jsx")

  assert.match(logbook, /"All Departments"/)
  assert.match(logbook, /"All Course"/)
  assert.match(logbook, /"All Reason"/)
  assert.match(logbookFull, /allLabel="All Departments"/)
  assert.match(logbookFull, /allLabel="All Course"/)
  assert.match(logbookFull, /allLabel="All Reasons"/)
  assert.match(reports, /allLabel="All Departments"/)
})
