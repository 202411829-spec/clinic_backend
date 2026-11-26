import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { filterAppointmentSlots } from "../../src/lib/appointmentSlots.js"

const panelSource = readFileSync(
  "src/components/admin/AppointmentsFullPanel.jsx",
  "utf8"
)
const widgetSource = readFileSync(
  "src/components/admin/AppointmentsPanel.jsx",
  "utf8"
)
const routerSource = readFileSync("src/router/index.jsx", "utf8")
const studentRecordSource = readFileSync(
  "src/pages/admin/StudentRecord.jsx",
  "utf8"
)

const SLOTS = [
  {
    id: "morning",
    time: "08:00-09:00",
    capacity: 11,
    booked: 5,
    bookings: [
      {
        id: "a1",
        name: "Alice",
        dept: "Nursing",
        reason: "Consultation",
        status: "pending",
      },
    ],
  },
  {
    id: "empty",
    time: "09:00-10:00",
    capacity: 11,
    booked: 0,
    bookings: [],
  },
  {
    id: "cancelled-only",
    time: "10:00-11:00",
    capacity: 11,
    booked: 2,
    bookings: [
      {
        id: "a2",
        name: "Cancelled Patient",
        dept: "Nursing",
        reason: "Consultation",
        status: "cancelled",
      },
    ],
  },
  {
    id: "afternoon",
    time: "11:00-12:00",
    capacity: 11,
    booked: 0,
    bookings: [
      {
        id: "a3",
        name: "Bob",
        dept: "Dentistry",
        reason: "Follow-up",
        status: "completed",
      },
    ],
  },
]

test("only blocks with actual appointment records are visible", () => {
  const visible = filterAppointmentSlots(SLOTS)

  assert.deepEqual(
    visible.map((slot) => slot.id),
    ["morning", "afternoon"]
  )
  assert.equal(visible[0].bookings.length, 1)
  assert.equal(visible[0].booked, 1)
  assert.equal(visible[0].slotsLeft, 10)
  assert.equal(visible[0].full, false)
})

test("a date with no appointments produces no visible blocks", () => {
  assert.deepEqual(filterAppointmentSlots([]), [])
  assert.deepEqual(
    filterAppointmentSlots([
      { id: "empty", capacity: 11, bookings: [] },
      {
        id: "cancelled",
        capacity: 11,
        bookings: [{ id: "a", status: "cancelled" }],
      },
    ]),
    []
  )
})

test("search, department, and reason filters hide blocks without matches", () => {
  assert.deepEqual(
    filterAppointmentSlots(SLOTS, { search: "bob" }).map((s) => s.id),
    ["afternoon"]
  )
  assert.deepEqual(
    filterAppointmentSlots(SLOTS, { department: "Nursing" }).map((s) => s.id),
    ["morning"]
  )
  assert.deepEqual(
    filterAppointmentSlots(SLOTS, { reason: "Follow-up" }).map((s) => s.id),
    ["afternoon"]
  )
  assert.deepEqual(
    filterAppointmentSlots(SLOTS, {
      department: "Nursing",
      reason: "Follow-up",
    }),
    []
  )
})

test("Appointments page renders the final filtered blocks and exact empty state", () => {
  assert.match(panelSource, /filterAppointmentSlots\(slots, \{/)
  assert.match(panelSource, /const hasAppointments = filteredSlots\.length > 0/)
  assert.match(panelSource, /No appointments today\./)
  assert.doesNotMatch(panelSource, /No appointment today\./)
  assert.match(panelSource, /filteredSlots\.map\(\(slot\) =>/)
  assert.match(panelSource, /appointmentsApi\s*\.slots\(toYMD\(selectedDate\)\)/)
  assert.match(panelSource, /\}, \[selectedDate\]\);/)
})

test("Dashboard Appointment widget renders only real appointment blocks", () => {
  assert.match(widgetSource, /deriveRecordFilterOptions/)
  assert.match(widgetSource, /reconcileRecordFilterSelections/)
  assert.doesNotMatch(widgetSource, /buildAppointment(Department|Course|Reason)Options/)
  assert.match(widgetSource, /filterAppointmentSlots/)
  assert.match(
    widgetSource,
    /filterAppointmentSlots\(slots, \{ search, department, course, reason: reasonFilter \}\)/
  )
  assert.match(widgetSource, /const hasAppointments = filteredSlots\.length > 0/)
  assert.match(widgetSource, /filteredSlots\.map\(\(slot\) =>/)
  assert.match(widgetSource, /No appointments today\./)
  assert.doesNotMatch(widgetSource, /No appointment today\./)
  assert.doesNotMatch(widgetSource, /AppointmentsSummary/)
  assert.doesNotMatch(widgetSource, /summaryCounts/)
  assert.match(widgetSource, /appointmentsApi\s*\.slots\(toYMD\(new Date\(\)\)\)/)
  assert.match(widgetSource, /<StatusMenu/)
  assert.match(widgetSource, /<StatusBadge/)
  assert.match(widgetSource, /<SlotActionMenu/)
  assert.match(widgetSource, /<FilterMultiSelect/)
})

test("Dashboard appointment blocks start collapsed but stay manually toggleable", () => {
  assert.match(
    widgetSource,
    /const \[expanded, setExpanded\] = useState\(false\);/
  )
  assert.doesNotMatch(
    widgetSource,
    /const \[expanded, setExpanded\] = useState\(slot\.bookings\.length > 0\);/
  )
  assert.match(
    widgetSource,
    /onClick=\{\(\) => setExpanded\(\(v\) => !v\)\}/
  )
  assert.match(
    widgetSource,
    /className=\{`expand \$\{expanded \? "is-open" : ""\}`\}/
  )
})

test("Full-page appointment blocks start collapsed and reset only for view changes", () => {
  assert.match(
    panelSource,
    /const \[expanded, setExpanded\] = useState\(false\);/
  )
  assert.doesNotMatch(
    panelSource,
    /const \[expanded, setExpanded\] = useState\(slot\.bookings\.length > 0\);/
  )

  const viewKey = panelSource.match(
    /const expansionViewKey = JSON\.stringify\(\{[\s\S]*?\}\);/
  )?.[0] || ""
  assert.match(viewKey, /date: toYMD\(selectedDate\)/)
  assert.match(viewKey, /search,/)
  assert.match(viewKey, /department,/)
  assert.match(viewKey, /course,/)
  assert.match(viewKey, /reason: reasonFilter/)
  assert.doesNotMatch(viewKey, /slots|openEditId|cancelTarget/)
  assert.match(panelSource, /key=\{`\$\{slot\.id\}:\$\{expansionViewKey\}`\}/)

  assert.match(
    panelSource,
    /onClick=\{\(\) => setExpanded\(\(v\) => !v\)\}/
  )
  assert.match(
    panelSource,
    /className=\{`expand \$\{expanded \? "is-open" : ""\}`\}/
  )
})

test("Dashboard View Record opens the existing student record route for the appointment student", () => {
  assert.match(widgetSource, /import \{ useNavigate \} from "react-router-dom";/)
  assert.match(widgetSource, /const navigate = useNavigate\(\);/)
  assert.match(widgetSource, /String\(b\.student_id \?\? ""\)\.trim\(\)/)
  assert.match(
    widgetSource,
    /navigate\(`\/admin\/masterlist\/\$\{encodeURIComponent\(studentId\)\}`\)/
  )
  assert.match(widgetSource, /onViewRecord=\{handleViewRecord\}/)
  assert.doesNotMatch(widgetSource, /Viewing record for/)

  assert.match(routerSource, /masterlist\/:studentId/)
  assert.match(studentRecordSource, /const \{ studentId \} = useParams\(\);/)
  assert.match(studentRecordSource, /masterlistApi\.getStudent\(studentId\)/)
  assert.match(studentRecordSource, /recordsApi\.medicalSummary\(studentId\)/)
  assert.match(studentRecordSource, /<StudentRecordPanel student=\{student\} \/>/)
})

test("Appointments page View Record opens the selected student's record", () => {
  assert.match(panelSource, /import \{ useNavigate \} from "react-router-dom";/)
  assert.match(panelSource, /const navigate = useNavigate\(\);/)
  assert.match(panelSource, /function handleViewRecord\(studentId\)/)
  assert.match(panelSource, /String\(studentId \?\? ""\)\.trim\(\)/)
  assert.match(
    panelSource,
    /navigate\(`\/admin\/masterlist\/\$\{encodeURIComponent\(normalized\)\}`\)/
  )
  assert.match(
    panelSource,
    /onViewRecord=\{\(\) => handleViewRecord\(b\.student_id\)\}/
  )
  assert.doesNotMatch(panelSource, /Viewing record for/)
})
