import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8")
const panel = read("components/student/UpcomingAppointmentPanel.jsx")
const dashboard = read("pages/student/Dashboard.jsx")
const context = read("context/AppointmentContext.jsx")
const notifications = read("components/student/NotificationsPanel.jsx")

const handler = panel.slice(
  panel.indexOf("async function doCancel()"),
  panel.indexOf("\n  return (")
)

test("cancellation waits for the backend response before showing success feedback", () => {
  assert.match(handler, /const result = await appointmentsApi\.delete\(appt\.id\)/)
  assert.match(handler, /if \(result && result\.success === false\)/)
  assert.match(handler, /throw new Error\(result\.error \|\| "Failed to cancel appointment\. Please try again\."\)/)
  assert.match(handler, /cancelAppointment\(\);/)
  assert.ok(
    handler.indexOf("appointmentsApi.delete") < handler.indexOf("cancelAppointment()"),
    "context success notification must only run after the DELETE resolves"
  )
  assert.match(handler, /setError\(err\?\.message \|\| "Failed to cancel appointment\. Please try again\."\)/)
})

test("successful cancellation refreshes both the card and the dashboard data", () => {
  assert.match(panel, /function pickUpcomingAppointment\(res, studentId, today = toYMD\(new Date\(\)\)\)/)
  assert.match(handler, /onAppointmentChange\?\.\(\)/)
  assert.match(handler, /const res = await appointmentsApi\.list\(\{ student_id: studentId \}\)/)
  assert.match(handler, /setUpcoming\(pickUpcomingAppointment\(res, studentId\)\)/)
  assert.match(dashboard, /const \[appointmentRevision, setAppointmentRevision\] = useState\(0\)/)
  assert.match(dashboard, /\}, \[studentId, appointmentRevision\]\);/)
  assert.match(
    dashboard,
    /<UpcomingAppointmentPanel onAppointmentChange=\{\(\) => setAppointmentRevision\(\(n\) => n \+ 1\)\} \/>/
  )
})

test("existing GCAS cancellation notification pattern is reused", () => {
  assert.match(context, /pushNotification\("Your appointment has been cancelled\."\)/)
  assert.match(notifications, /const notifications = \[\.\.\.liveNotifications, \.\.\.history\]/)
  assert.match(handler, /cancelAppointment\(\);/)
})
