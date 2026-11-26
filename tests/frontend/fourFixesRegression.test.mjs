import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { resolveRegularTimeRange } from "../../src/lib/regularTimeRange.js"

const read = (path) => readFileSync(path, "utf8")

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : []
  })
}

test("portaled overlays clamp, flip, and escape overflow ancestors", () => {
  const overlay = read("src/components/ui/PortalOverlay.jsx")
  const css = read("src/assets/styles/gc-rfb-ui.css")

  assert.match(overlay, /createPortal/)
  assert.match(overlay, /document\.body/)
  assert.match(overlay, /getOverlayPosition/)
  assert.match(overlay, /GC_OVERLAY_Z\.dropdown/)
  assert.match(overlay, /width: position\.width/)
  assert.match(overlay, /maxHeight: position\.maxHeight/)
  assert.match(overlay, /visibility: position\.hidden \? "hidden" : "visible"/)
  assert.match(overlay, /position\.placeAbove \? flipClassName : ""/)
  assert.match(css, /\.gc-overlay-portal \{[\s\S]*?position: fixed/)
  assert.match(css, /\.gc-overlay-portal \{[\s\S]*?overflow-y: auto/)
})

test("shared dropdowns and row menus no longer render clipped inline panels", () => {
  const sources = [
    "src/components/ui/UniversalDropdown.jsx",
    "src/components/admin/PeriodDropdown.jsx",
    "src/components/admin/AdminsPanel.jsx",
    "src/components/admin/AppointmentsPanel.jsx",
    "src/components/admin/AppointmentsFullPanel.jsx",
    "src/components/admin/ClinicScheduleFullPanel.jsx",
    "src/components/admin/StudentRecordPanel.jsx",
    "src/components/student/UpcomingAppointmentPanel.jsx",
  ].map((file) => ({ file, source: read(file) }))

  for (const { file, source } of sources) {
    assert.match(source, /PortalOverlay|useOverlayPosition/, file)
    assert.doesNotMatch(source, /absolute right-0 top-full.*z-20/, file)
  }

  const universal = read("src/components/ui/UniversalDropdown.jsx")
  assert.match(universal, /preferredWidth=\{240\}/)
  assert.match(universal, /break-words whitespace-normal/)
  assert.match(universal, /title=\{opt\.label\}/)

  for (const file of ["src/components/admin/StatusMenu.jsx", "src/pages/admin/Masterlist.jsx"]) {
    const source = read(file)
    assert.match(source, /useOverlayPosition/, file)
    assert.match(source, /GC_OVERLAY_Z\.dropdown/, file)
    assert.doesNotMatch(source, /const \[coords, setCoords\]/, file)
  }
})

test("every useTriggerOrigin caller imports the hook", () => {
  const files = walk("src")
  assert.ok(files.length > 0)

  for (const file of files) {
    const source = read(file)
    if (!/useTriggerOrigin\s*\(/.test(source)) continue
    assert.match(source, /import[^;]*\buseTriggerOrigin\b/, `${file} calls useTriggerOrigin without importing it`)
  }
})

test("Add Annual Exam and Requests buttons keep their modal flows", () => {
  const record = read("src/components/admin/StudentRecordPanel.jsx")
  const examModal = read("src/components/admin/AddAnnualExamModal.jsx")
  const admins = read("src/components/admin/AdminsPanel.jsx")

  assert.match(record, /handleAddAnnualExamination/)
  assert.match(record, /setAddModalOpen\(true\)/)
  assert.match(record, /<AddAnnualExamModal/)
  assert.match(examModal, /useSelfClosingPresence, useTriggerOrigin/)
  assert.match(examModal, /useTriggerOrigin\(\{ enabled: mounted, panelRef \}\)/)

  assert.match(admins, /useSelfClosingPresence, useTriggerOrigin/)
  assert.match(admins, /useTriggerOrigin\(\{ enabled: mounted, panelRef \}\)/)
  assert.match(admins, /onClick=\{\(\) => setShowRequests\(true\)\}/)
  assert.match(admins, /<ModalShell onClose=\{\(\) => setShowRequests\(false\)\}/)
})

test("Appointments date is selected from a real calendar popup", () => {
  const picker = read("src/components/admin/AppointmentDatePicker.jsx")
  const page = read("src/pages/admin/Appointments.jsx")
  const panel = read("src/components/admin/AppointmentsFullPanel.jsx")

  assert.match(picker, /<CalendarTriggerButton/)
  assert.match(picker, /aria-label="Select appointment date"/)
  assert.match(picker, /aria-haspopup="dialog"/)
  assert.match(picker, /<PortalOverlay/)
  assert.match(picker, /role="dialog"/)
  assert.match(picker, /<SelectDateCalendar/)
  assert.match(picker, /navigationMode="month"/)
  assert.match(picker, /onSelectDate\?\.\(nextDate\)/)
  assert.match(picker, /setOpen\(false\)/)

  assert.doesNotMatch(page, /SelectDateCalendar/)
  assert.match(page, /onSelectDate=\{setSelectedDate\}/)
  assert.match(panel, /AppointmentsFullPanel\(\{ selectedDate, onSelectDate \}\)/)
  assert.match(panel, /<AppointmentDatePicker/)
  assert.match(panel, /appointmentsApi\s*\.slots\(toYMD\(selectedDate\)\)/)
  assert.match(panel, /\[selectedDate\]/)
})

test("Logbook Day range uses the shared continuous range calendar", () => {
  const control = read("src/components/admin/LogbookRangePicker.jsx")

  assert.doesNotMatch(control, /Tap multiple days/)
  assert.doesNotMatch(control, /onToggleDate=/)
  assert.match(control, /<PeriodDropdown/)
  assert.match(control, /<RegularTimePeriodPicker/)
  assert.match(control, /<RangeCalendarPanel/)
  assert.match(control, /pickRangeDate/)
  assert.doesNotMatch(control, /toggleRegularDay/)
  assert.match(control, /<PortalOverlay/)
  assert.match(control, /preferredWidth=\{336\}/)
  assert.match(control, /gc-cal-pop gc-cal-pop-portal/)
  assert.match(control, /\.\.\.resolveRegularTimeRange\(selection\)/)
  assert.match(control, /applyGateRef\.current\?\.maybeApply\(range\)/)

  const range = resolveRegularTimeRange({
    period: "Day",
    date: new Date(2026, 10, 24),
    dayRange: { from: "2026-11-24", to: "2026-11-26" },
    yearInput: "2026",
    month: 10,
  })
  assert.deepEqual(range.dates, ["2026-11-24", "2026-11-25", "2026-11-26"])
})
