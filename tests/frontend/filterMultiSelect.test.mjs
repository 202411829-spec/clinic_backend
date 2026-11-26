import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  deriveRecordFilterOptions,
  formatFilterSelectionLabel,
  isFilterSelected,
  normalizeFilterValues,
  reconcileRecordFilterSelections,
  toggleFilterValue,
} from "../../src/lib/filterMultiSelect.js"
import { appendRequestParams } from "../../src/lib/requestParams.js"
import { buildLogbookQueryParams } from "../../src/lib/logbookQuery.js"
import { filterAppointmentSlots } from "../../src/lib/appointmentSlots.js"
import {
  buildReportRequests,
  normalizeReportDepartments,
} from "../../src/lib/reportAggregation.js"

const componentSource = readFileSync(
  "src/components/ui/FilterMultiSelect.jsx",
  "utf8"
)

test("categorical values normalize to an OR set and an empty set means All", () => {
  assert.deepEqual(normalizeFilterValues([]), [])
  assert.deepEqual(normalizeFilterValues("All Departments"), [])
  assert.deepEqual(normalizeFilterValues(["3", "1", "3"]), ["3", "1"])
  assert.deepEqual(toggleFilterValue([], 3), ["3"])
  assert.deepEqual(toggleFilterValue(["3"], 1), ["3", "1"])
  assert.deepEqual(toggleFilterValue(["3", "1"], "3"), ["1"])
  assert.deepEqual(toggleFilterValue(["3"], "All Departments"), [])

  assert.equal(isFilterSelected("CCS", []), true)
  assert.equal(isFilterSelected("CCS", ["CCS", "CAHS"]), true)
  assert.equal(isFilterSelected("BA", ["CCS", "CAHS"]), false)
})

test("multi-select labels show one value or a readable count", () => {
  const options = [
    { value: 1, label: "College of Computer Studies (CCS)" },
    { value: 2, label: "College of Allied Health Studies (CAHS)" },
  ]
  assert.equal(
    formatFilterSelectionLabel({
      selected: [],
      options,
      allLabel: "All Departments",
      pluralLabel: "Departments",
    }),
    "All Departments"
  )
  assert.equal(
    formatFilterSelectionLabel({
      selected: [2],
      options,
      allLabel: "All Departments",
      pluralLabel: "Departments",
    }),
    "College of Allied Health Studies (CAHS)"
  )
  assert.equal(
    formatFilterSelectionLabel({
      selected: [1, 2],
      options,
      allLabel: "All Departments",
      pluralLabel: "Departments",
    }),
    "2 Departments selected"
  )
})

test("record-backed filter options exclude empty values and cascade across categories", () => {
  const records = [
    {
      department: { value: "1", label: "CCS" },
      course: { value: "10", label: "BSIT" },
      reason: "Consultation",
    },
    {
      department: { value: "1", label: "CCS" },
      course: { value: "11", label: "BSCS" },
      reason: "Medical Certificate",
    },
    {
      department: { value: "2", label: "CAHS" },
      course: { value: "12", label: "BSN" },
      reason: "Consultation",
    },
    {
      department: "-",
      course: "",
      reason: "-",
    },
  ]
  const fields = {
    department: (record) => record.department,
    course: (record) => record.course,
    reason: (record) => record.reason,
  }

  const options = deriveRecordFilterOptions({
    records,
    fields,
    selections: { department: ["1"], course: [], reason: [] },
  })
  // A category ignores its own selection so another value can still be added.
  assert.deepEqual(options.department, [
    { value: "2", label: "CAHS" },
    { value: "1", label: "CCS" },
  ])
  assert.deepEqual(options.course, [
    { value: "11", label: "BSCS" },
    { value: "10", label: "BSIT" },
  ])
  assert.deepEqual(options.reason, [
    { value: "Consultation", label: "Consultation" },
    { value: "Medical Certificate", label: "Medical Certificate" },
  ])

  const narrowed = deriveRecordFilterOptions({
    records,
    fields,
    selections: { department: [], course: ["10"], reason: [] },
  })
  assert.deepEqual(narrowed.department, [{ value: "1", label: "CCS" }])

  const reconciled = reconcileRecordFilterSelections({
    selections: { department: ["9"], course: ["10"], reason: [] },
    options: narrowed,
  })
  assert.deepEqual(reconciled.next.department, [])
  assert.deepEqual(reconciled.next.course, ["10"])
  assert.equal(reconciled.changed, true)
})

test("record-backed panels wire the derived singular option keys into every filter", () => {
  const derived = deriveRecordFilterOptions({
    records: [{ dept: "CCS", course: "BSIT", reason: "Consultation" }],
    fields: {
      department: (row) => row.dept,
      course: (row) => row.course,
      reason: (row) => row.reason,
    },
  })

  assert.deepEqual(derived.department, [{ value: "CCS", label: "CCS" }])
  assert.equal(derived.departments, undefined)

  for (const file of [
    "src/components/admin/AppointmentsFullPanel.jsx",
    "src/components/admin/AppointmentsPanel.jsx",
    "src/components/admin/LogbookPanel.jsx",
  ]) {
    const source = readFileSync(file, "utf8")
    assert.match(
      source,
      /const \{ department: departments, course: courses, reason: reasons \} = options;/,
      `${file} should alias the singular derived keys`
    )
    assert.doesNotMatch(
      source,
      /const \{ departments, courses, reasons \} = options;/,
      `${file} should not destructure option keys that deriveRecordFilterOptions never returns`
    )
    for (const prop of ["departments", "courses", "reasons"]) {
      assert.match(source, new RegExp(`options=\\{${prop}\\}`), `${file} should pass ${prop}`)
    }
  }
})

test("OR within categories and AND across categories filter appointment slots", () => {
  const slots = [
    {
      id: "a",
      capacity: 2,
      bookings: [
        { dept: "CCS", course: "BSIT", reason: "Consultation", status: "Pending" },
      ],
    },
    {
      id: "b",
      capacity: 2,
      bookings: [
        { dept: "CAHS", course: "BSN", reason: "Medical Certificate", status: "Pending" },
      ],
    },
    {
      id: "c",
      capacity: 2,
      bookings: [
        { dept: "CBA", course: "BSA", reason: "Consultation", status: "Pending" },
      ],
    },
  ]

  assert.deepEqual(
    filterAppointmentSlots(slots, {
      department: ["CCS", "CAHS"],
      reason: ["Consultation", "Medical Certificate"],
    }).map((slot) => slot.id),
    ["a", "b"]
  )
  assert.deepEqual(
    filterAppointmentSlots(slots, {
      department: ["CCS", "CAHS"],
      course: ["BSN"],
      reason: ["Medical Certificate"],
    }).map((slot) => slot.id),
    ["b"]
  )
  assert.deepEqual(
    filterAppointmentSlots(slots, { department: [], reason: [] }).map((slot) => slot.id),
    ["a", "b", "c"]
  )
})

test("array query params use repeated sorted keys with stable cache input", () => {
  const first = appendRequestParams(new URLSearchParams(), {
    page: 1,
    department_id: ["2", "1"],
    reason_id: ["7", "7"],
    date_from: "2026-11-01",
    course_id: [],
  })
  const second = appendRequestParams(new URLSearchParams(), {
    page: 1,
    department_id: ["1", "2"],
    reason_id: ["7"],
    date_from: "2026-11-01",
    course_id: [],
  })
  assert.equal(first.toString(), second.toString())
  assert.equal(first.getAll("department_id").join(","), "1,2")
  assert.equal(first.getAll("reason_id").join(","), "7")
  assert.equal(first.get("date_from"), "2026-11-01")
  assert.equal(first.has("course_id"), false)
})

test("Logbook query builder still carries date filters while arrays become params", () => {
  const params = buildLogbookQueryParams({
    dateFrom: "2026-11-01",
    dateTo: "2026-11-30",
    reasonFilter: ["3", "4"],
    departmentFilter: ["1", "2"],
    courseFilter: [],
  })
  assert.equal(params.date_from, "2026-11-01")
  assert.equal(params.date_to, "2026-11-30")
  assert.deepEqual(params.reason_id, ["3", "4"])
  assert.deepEqual(params.department_id, ["1", "2"])
  assert.equal("course_id" in params, false)
})

test("Reports department fan-out does not alter date or academic time sets", () => {
  assert.deepEqual(normalizeReportDepartments("All Departments"), [])
  assert.deepEqual(buildReportRequests(["2026-11-01"], []), [
    { date: "2026-11-01", department_id: undefined },
  ])
  assert.deepEqual(buildReportRequests(["2026-11-01", "2026-11-02"], [3, 4]), [
    { date: "2026-11-01", department_id: 3 },
    { date: "2026-11-01", department_id: 4 },
    { date: "2026-11-02", department_id: 3 },
    { date: "2026-11-02", department_id: 4 },
  ])

  const academicDates = ["2026-08-01", "2026-08-02"]
  assert.deepEqual(buildReportRequests(academicDates, [5]), [
    { date: "2026-08-01", department_id: 5 },
    { date: "2026-08-02", department_id: 5 },
  ])
})

test("multi-select component keeps the menu open, marks selections, and clears", () => {
  assert.match(componentSource, /<PortalOverlay/)
  assert.match(componentSource, /aria-selected=\{isSelected\}/)
  assert.match(componentSource, /data-multiselect-clear/)
  assert.match(componentSource, /onChange\?\.\(\[\]\)/)
  assert.match(componentSource, /<CheckIcon/)
  assert.match(componentSource, /pluralLabel/)
  assert.doesNotMatch(componentSource, /onChange\?\.call[\s\S]*requestClose\(true\)/)
})
