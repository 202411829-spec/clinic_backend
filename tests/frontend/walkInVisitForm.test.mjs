import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  buildMedicineTag,
  buildWalkInPayload,
  isMedicalCertificateReason,
  normalizeMedicineQuantity,
  validateWalkInPatientName,
  validateWalkInReason,
} from "../../src/lib/walkInForm.js"
import { formatPatientFormalName } from "../../src/lib/format.js"

const form = readFileSync("src/components/admin/WalkInVisitForm.jsx", "utf8")
const hook = readFileSync("src/components/admin/useWalkInForm.js", "utf8")
const widget = readFileSync("src/components/admin/LogbookPanel.jsx", "utf8")
const fullPage = readFileSync("src/components/admin/LogbookFullPanel.jsx", "utf8")
const modal = readFileSync("src/components/admin/WalkInVisitModal.jsx", "utf8")
const dashboard = readFileSync("src/pages/admin/Dashboard.jsx", "utf8")

const MEDICINES = [
  { medicine_id: 4, medicine_name: "Paracetamol" },
  { medicine_id: 9, medicine_name: "Ibuprofen" },
]
const REASONS = [
  { reason_id: 1, description: "Medical Certificate" },
  { reason_id: 7, description: "Consultation" },
]

test("patient name requires last name and first name", () => {
  assert.equal(validateWalkInPatientName({ lastName: "", firstName: "Juan" }), "Last name is required.")
  assert.equal(validateWalkInPatientName({ lastName: "Doe", firstName: "  " }), "First name is required.")
  assert.equal(validateWalkInPatientName({ lastName: "Doe", firstName: "Juan" }), null)
})

test("reason is required by the shared form", () => {
  assert.equal(validateWalkInReason(""), "Reason is required.")
  assert.equal(validateWalkInReason("  7  "), null)
})

test("reason matching uses existing reason records only", () => {
  assert.equal(isMedicalCertificateReason("1", REASONS), true)
  assert.equal(isMedicalCertificateReason("7", REASONS), false)
  assert.equal(isMedicalCertificateReason("99", REASONS), false)
  assert.equal(isMedicalCertificateReason("", REASONS), false)
})

test("walk-in payload formats structured name and keeps ID optional", () => {
  const payload = buildWalkInPayload({
    lastName: "Ramos",
    firstName: "Joseph",
    middleInitial: "d",
    suffix: "Jr.",
    reasonId: "7",
    reasonRecords: REASONS,
    now: new Date(2026, 10, 25, 9, 5),
  })

  assert.equal(payload.walk_in_name, "Ramos, Joseph D., Jr.")
  assert.equal(payload.reason_id, 7)
  assert.equal(payload.appointment_date, "2026-11-25")
  assert.equal(payload.appointment_time, "09:05:00")
  assert.equal("student_id" in payload, false)
  assert.equal("complaint" in payload, false)
  assert.equal("medicines" in payload, false)
})

test("Consultation payload keeps complaint and multiple medicine quantities together", () => {
  const payload = buildWalkInPayload({
    regId: " 202311330 ",
    reasonId: "7",
    reasonRecords: REASONS,
    lastName: "Doe",
    firstName: "Juan",
    complaint: " Headache ",
    medTags: [
      { name: "Paracetamol", quantity: 2, medicine_id: 4 },
      { name: "Ibuprofen", quantity: 1, medicine_id: 9 },
    ],
    now: new Date(2026, 0, 2, 3, 4),
  })

  assert.equal(payload.student_id, "202311330")
  assert.equal(payload.reason_id, 7)
  assert.equal(payload.walk_in_name, "Doe, Juan")
  assert.equal(payload.complaint, "Headache")
  assert.deepEqual(payload.medicines, [
    { medicine_id: 4, quantity: 2 },
    { medicine_id: 9, quantity: 1 },
  ])
})

test("Medical Certificate payload never submits complaint or medicines", () => {
  const payload = buildWalkInPayload({
    regId: "202311330",
    reasonId: "1",
    reasonRecords: REASONS,
    lastName: "Doe",
    firstName: "Juan",
    complaint: "Leftover complaint",
    medTags: [{ name: "Paracetamol", quantity: 2, medicine_id: 4 }],
    now: new Date(2026, 0, 2, 3, 4),
  })

  assert.equal(payload.reason_id, 1)
  assert.equal(payload.student_id, "202311330")
  assert.equal("complaint" in payload, false)
  assert.equal("medicines" in payload, false)
})

test("medicine quantity defaults to one and rejects zero/invalid values", () => {
  assert.equal(normalizeMedicineQuantity(""), 1)
  assert.equal(normalizeMedicineQuantity("3"), 3)
  assert.equal(normalizeMedicineQuantity("0"), null)
  assert.equal(normalizeMedicineQuantity("-1"), null)
  assert.equal(normalizeMedicineQuantity("1.5"), null)
})

test("add-medicine preserves quantity on each tag and rejects invalid entries", () => {
  assert.deepEqual(
    buildMedicineTag({ medicineInput: " Paracetamol ", quantity: "2", medicineRecords: MEDICINES }),
    { tag: { name: "Paracetamol", quantity: 2, medicine_id: 4 }, error: null }
  )
  assert.deepEqual(
    buildMedicineTag({ medicineInput: "Paracetamol", quantity: "", medicineRecords: MEDICINES }),
    { tag: { name: "Paracetamol", quantity: 1, medicine_id: 4 }, error: null }
  )
  assert.equal(
    buildMedicineTag({ medicineInput: "Paracetamol", quantity: "0", medicineRecords: MEDICINES }).error,
    "Quantity must be 1 or more."
  )
  assert.equal(
    buildMedicineTag({ medicineInput: "Unknown", quantity: "1", medicineRecords: MEDICINES }).error,
    "Medicine not found in the medicine list."
  )
  assert.deepEqual(buildMedicineTag({ medicineInput: "", medicineRecords: MEDICINES }), {
    tag: null,
    error: null,
  })
})

test("structured patient name uses the project's formal-name convention", () => {
  assert.equal(formatPatientFormalName({
    last_name: "Ramos",
    first_name: "Joseph",
    middle_initial: "D.",
    suffix: "Jr.",
  }), "Ramos, Joseph D., Jr.")
})

test("walk-in form uses generic name placeholders and restored Reason dropdown", () => {
  for (const label of [
    "ID / Registration Number",
    "Last Name",
    "First Name",
    "Middle Initial",
    "Suffix",
    "Reason",
    "Complaint",
    "Medicine",
    "Quantity",
  ]) {
    assert.ok(form.includes(label), `missing form label ${label}`)
  }

  assert.match(form, /placeholder="Last Name"/)
  assert.match(form, /placeholder="First Name"/)
  assert.doesNotMatch(form, /placeholder="Doe"/)
  assert.doesNotMatch(form, /placeholder="Juan"/)

  assert.match(form, /import UniversalDropdown/)
  assert.match(form, /<UniversalDropdown/)
  assert.match(form, /reasonRecords\.map/)
  assert.match(form, /value: String\(r\.reason_id\)/)
  assert.match(form, /label: r\.description/)
  assert.match(form, /placeholder="Select Reason"/)
  assert.match(form, /isMedicalCertificateReason\(reasonId, reasonRecords\)/)
  assert.doesNotMatch(form, /"Medical Certificate"/)
  assert.doesNotMatch(form, /"Consultation"/)
  assert.match(form, /placeholder="E\.g\. Headache"/)
  assert.match(form, /placeholder="E\.g\. Paracetamol"/)
  assert.match(form, /min="1"/)
  assert.doesNotMatch(form, /Optional/)
  assert.doesNotMatch(form, /Patient Name/)
})

test("walk-in name placeholders are generic and optional name fields start empty", () => {
  for (const placeholder of ["Last Name", "First Name", "Middle Initial", "Suffix"]) {
    assert.ok(form.includes(`placeholder="${placeholder}"`), `missing placeholder ${placeholder}`)
  }

  for (const sample of [
    'placeholder="Doe"',
    'placeholder="Juan"',
    'placeholder="B"',
    'placeholder="Jr."',
  ]) {
    assert.ok(!form.includes(sample), `sample placeholder still present: ${sample}`)
  }

  assert.match(hook, /const \[middleInitial, setMiddleInitial\] = useState\(""\)/)
  assert.match(hook, /const \[suffix, setSuffix\] = useState\(""\)/)
  assert.match(hook, /setMiddleInitial\(""\)/)
  assert.match(hook, /setSuffix\(""\)/)
})

test("Medical Certificate immediately disables clinical inputs and add button", () => {
  assert.equal((form.match(/disabled=\{clinicalFieldsDisabled\}/g) || []).length, 3)
  assert.match(form, /disabled=\{clinicalFieldsDisabled \|\| isSubmitting\}/)
  assert.match(form, /disabled:bg-gray-100/)
  assert.match(form, /disabled:cursor-not-allowed/)
})

test("switching to Medical Certificate clears stale complaint and medicine state", () => {
  assert.match(hook, /function handleReasonChange\(nextReasonId\)/)
  assert.match(hook, /isMedicalCertificateReason\(nextReasonId, reasonRecords\)/)
  assert.match(hook, /setComplaint\(""\)/)
  assert.match(hook, /setMedicineInput\(""\)/)
  assert.match(hook, /setQuantity\(""\)/)
  assert.match(hook, /setMedTags\(\[\]\)/)
  assert.match(hook, /validateWalkInReason\(reasonId\)/)
  assert.match(hook, /reasonId,\s*\n\s*reasonRecords,/)
})

test("Dashboard widget and full Logbook share the same walk-in modal implementation", () => {
  assert.match(widget, /import WalkInVisitModal from "\.\/WalkInVisitModal\.jsx"/)
  assert.match(widget, /import useWalkInForm from "\.\/useWalkInForm\.js"/)
  assert.match(widget, /<WalkInVisitModal/)
  assert.doesNotMatch(widget, /import WalkInVisitForm/)
  assert.doesNotMatch(widget, /<WalkInVisitForm/)
  assert.match(widget, /open=\{walkIn\.showWalkInForm\}/)
  assert.match(widget, /onClose=\{walkIn\.handleClose\}/)
  assert.match(widget, /reasonRecords=\{reasonRecords\}/)

  assert.match(fullPage, /import WalkInVisitModal from "\.\/WalkInVisitModal\.jsx"/)
  assert.match(fullPage, /import useWalkInForm from "\.\/useWalkInForm\.js"/)
  assert.match(fullPage, /reasonRecords,\s*\n\s*medicineRecords,/)
  assert.doesNotMatch(fullPage, /<WalkInVisitForm/)

  assert.match(modal, /import WalkInVisitForm from "\.\/WalkInVisitForm\.jsx"/)
  assert.match(modal, /<WalkInVisitForm/)
  for (const expected of [
    /handleClose=\{onClose\}/,
    /reasonId=\{walkIn\.reasonId\}/,
    /reasonRecords=\{reasonRecords\}/,
    /handleReasonChange=\{walkIn\.handleReasonChange\}/,
    /lastName=\{walkIn\.lastName\}/,
    /firstName=\{walkIn\.firstName\}/,
    /middleInitial=\{walkIn\.middleInitial\}/,
    /suffix=\{walkIn\.suffix\}/,
  ]) {
    assert.match(modal, expected)
  }
  assert.doesNotMatch(modal, /walkInName=/)

  assert.match(dashboard, /<LogbookPanel/)
  assert.match(dashboard, /reasonRecords=\{reasonRecords\}/)
  assert.match(hook, /validateWalkInPatientName/)
  assert.match(hook, /buildWalkInPayload/)
})

test("Dashboard walk-in save refreshes the Logbook and closes the modal", () => {
  assert.match(widget, /await logbookApi\.createWalkIn\(payload\)/)
  assert.match(
    widget,
    /const res = await logbookApi\.list\(buildLogbookQueryParams\(\{ dateFrom, dateTo \}\)\)/
  )
  assert.match(
    widget,
    /setEntries\(\(res\?\.logbook \|\| \[\]\)\.slice\(0, 5\)\.map\(mapEntry\)\)/
  )
  assert.match(hook, /await onSubmit\(payload\)/)
  assert.match(hook, /resetWalkInForm\(\);\s*\r?\n\s*setShowWalkInForm\(false\)/)
})

test("walk-in modal uses the project's dialog pattern and scrolls long forms", () => {
  assert.match(modal, /createPortal\(/)
  assert.match(modal, /document\.body/)
  assert.match(modal, /role="dialog"/)
  assert.match(modal, /aria-modal="true"/)
  assert.match(modal, /fixed inset-0 z-\[100\]/)
  assert.match(modal, /bg-ink-900\/40/)
  assert.match(modal, /backdrop-blur-\[3px\]/)
  assert.match(modal, /gc-modal-backdrop/)
  assert.match(modal, /gc-modal-panel/)
  assert.match(modal, /Escape/)
  assert.match(modal, /e\.target === e\.currentTarget/)
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/)
  assert.match(modal, /max-h-\[85vh\] overflow-y-auto/)
  assert.match(modal, /if \(e\.key === "Escape" && !busy\) onClose\?\.\(\)/)
})
