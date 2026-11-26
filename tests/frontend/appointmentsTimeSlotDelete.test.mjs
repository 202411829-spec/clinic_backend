import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (relativePath) => readFileSync(relativePath, "utf8")

const api = read("src/lib/api.js")
const appointmentSlots = read("src/lib/appointmentSlots.js")
const confirmDialog = read("src/components/ui/ConfirmDialog.jsx")
const fullPanel = read("src/components/admin/AppointmentsFullPanel.jsx")
const widgetPanel = read("src/components/admin/AppointmentsPanel.jsx")
const backendRoute = read("routers/appointment.py")
const clinicSchedule = read("routers/clinic_schedule.py")
const migration = read("migrations/2026-11-27_time_slot_deletions.sql")

test("frontend calls a persisted delete endpoint with date/time scope", () => {
  assert.match(api, /deleteTimeSlot: \(slotId, body/)
  assert.ok(api.includes("api.del(`/appointments/time-slots/${slotId}`"))
  assert.match(appointmentSlots, /export function timeSlotDeletePayload\(slot, date\)/)
  assert.match(appointmentSlots, /slot_start: slot\?\.slot_start \|\| timeStart/)
  assert.match(appointmentSlots, /reason_id: slot\?\.reason_id \?\? null/)
})

test("both appointment panels confirm, await, then reconcile the delete", () => {
  for (const [name, source] of [["full panel", fullPanel], ["dashboard widget", widgetPanel]]) {
    assert.doesNotMatch(source, /window\.confirm/, `${name} must use the shared dialog`)

    const deleteCall = source.indexOf("await appointmentsApi.deleteTimeSlot(")
    const refreshCall = source.indexOf("await appointmentsApi.slots(date)")
    const localFilter = source.indexOf("setSlots((prev) => prev.filter((slot) => slot.id !== target.id))")

    assert.ok(deleteCall >= 0, `${name} must call the backend before changing state`)
    assert.ok(refreshCall > deleteCall, `${name} must re-fetch after a confirmed delete`)
    assert.ok(localFilter > deleteCall, `${name} must not hide the block before success`)

    assert.match(source, /title="Delete this time block\?"/)
    assert.match(source, /busyLabel="Deleting…"/)
    assert.match(source, /role="alert"/)
    assert.match(source, /setDeleteError\(err\?\.message \|\| "Failed to delete the time block/)
  }
})

test("shared confirmation modal supports a deletion busy label", () => {
  assert.match(confirmDialog, /busyLabel = "Cancelling…"/)
  assert.match(confirmDialog, /\{busy \? busyLabel : confirmLabel\}/)
})

test("backend persists deletions and blocks destructive booking loss", () => {
  assert.match(backendRoute, /"\/appointments\/time-slots\/<slot_id>"/)
  assert.match(backendRoute, /methods=\["DELETE"\]/)
  assert.match(backendRoute, /@require_admin/)
  assert.match(backendRoute, /existing appointments/)
  assert.match(backendRoute, /record_time_slot_deletion\(/)
  assert.match(backendRoute, /materialize_time_slots\(override\)/)
  assert.match(clinicSchedule, /get_deleted_slot_starts\(/)
  assert.match(clinicSchedule, /blocks = \[block for block in blocks if block\["start"\] not in deleted_starts\]/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "time_slot_deletions"/)
})
