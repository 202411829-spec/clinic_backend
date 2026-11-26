import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const reportsPanel = readFileSync(
  "src/components/admin/ReportsFullPanel.jsx",
  "utf8"
)
const clinicSchedulePanel = readFileSync(
  "src/components/admin/ClinicScheduleFullPanel.jsx",
  "utf8"
)
const apiSource = readFileSync("src/lib/api.js", "utf8")

test("Reports clears stale data and surfaces report request failures", () => {
  assert.ok(reportsPanel.includes("if (!cancelled) setError(null);"))
  assert.ok(
    reportsPanel.includes(
      "setError(err?.message || \"Couldn't load report data. Please try again.\");"
    )
  )
  assert.ok(reportsPanel.includes("setData(EMPTY_DATA);"))
  assert.ok(reportsPanel.includes('{error && ('))
  assert.ok(reportsPanel.includes('role="alert"'))
})

test("Clinic Schedule uses the collection endpoint for date override lookups", () => {
  assert.ok(
    clinicSchedulePanel.includes(
      "clinicScheduleApi.list({ start: ymd, end: ymd })"
    )
  )
  assert.ok(
    clinicSchedulePanel.includes(
      "Array.isArray(res?.schedule) ? res.schedule[0] : null"
    )
  )
  assert.ok(!clinicSchedulePanel.includes("clinicScheduleApi.byDate(ymd)"))
  assert.ok(
    apiSource.includes(
      "list: (params) => api.get('/clinic-schedule', params),"
    )
  )
})
