import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  clearLogbookMonthDraft,
  createLogbookMonthDraft,
  createMonthApplyGate,
  pickLogbookMonthDraft,
  resolveLogbookDraftRange,
} from "../../src/lib/logbookRangeDraft.js"

const read = (path) => readFileSync(path, "utf8")
const control = read("src/components/admin/LogbookRangePicker.jsx")
const widget = read("src/components/admin/LogbookPanel.jsx")
const fullPage = read("src/components/admin/LogbookFullPanel.jsx")
const calendar = read("src/components/ui/DateRangePicker.jsx")
const draftLib = read("src/lib/logbookRangeDraft.js")

const NOW = new Date(2026, 0, 1)

function fnSource(source, name) {
  return source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  \\}`))?.[0] || ""
}

test("opening the month picker drafts from the applied range; first click never applies", () => {
  const applied = { from: "2026-03-01", to: "2026-05-31", period: "Month" }
  const calls = []
  const gate = createMonthApplyGate(applied, (range) => calls.push(range))

  let draft = createLogbookMonthDraft(applied, NOW)
  assert.deepEqual(draft.monthRange, { from: "2026-03-01", to: "2026-05-01" })

  draft = pickLogbookMonthDraft(draft, "2026-04-01")
  gate.markMonthDraftDirty()

  assert.deepEqual(draft.monthRange, { from: "2026-04-01", to: "" })
  assert.equal(gate.monthDraftDirty, true)

  const preview = resolveLogbookDraftRange(draft)
  assert.equal(preview.period, "Month")
  assert.equal(preview.from, "2026-04-01")
  assert.equal(preview.to, "2026-04-30")
  assert.equal(gate.maybeApply(preview), false)
  assert.deepEqual(calls, [])
})

test("second month stays in the draft and Done applies the complete range once", () => {
  const applied = { from: "", to: "", period: "Month" }
  const calls = []
  const gate = createMonthApplyGate(applied, (range) => calls.push(range))

  let draft = createLogbookMonthDraft(applied, NOW)
  assert.equal(draft.period, "Month")

  draft = pickLogbookMonthDraft(draft, "2026-04-01")
  gate.markMonthDraftDirty()
  assert.equal(gate.maybeApply(resolveLogbookDraftRange(draft)), false)
  assert.deepEqual(calls, [])

  draft = pickLogbookMonthDraft(draft, "2026-06-01")
  assert.deepEqual(draft.monthRange, { from: "2026-04-01", to: "2026-06-01" })
  assert.equal(gate.maybeApply(resolveLogbookDraftRange(draft)), false)
  assert.deepEqual(calls, [])

  const complete = resolveLogbookDraftRange(draft)
  assert.equal(complete.period, "Month")
  assert.equal(complete.from, "2026-04-01")
  assert.equal(complete.to, "2026-06-30")
  assert.equal(complete.dates.length, 91)

  assert.equal(gate.applyMonthDraft(complete), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], complete)

  // Done twice, or the parent mirroring the range back, cannot refresh twice.
  assert.equal(gate.applyMonthDraft(complete), false)
  assert.equal(calls.length, 1)
  gate.resetToApplied({ from: complete.from, to: complete.to, period: complete.period })
  assert.equal(gate.maybeApply(complete), false)
  assert.equal(calls.length, 1)
})

test("Clear and cancel stay draft-only and reopen from the applied range", () => {
  const applied = { from: "2026-01-01", to: "2026-02-28", period: "Month" }
  const calls = []
  const gate = createMonthApplyGate(applied, (range) => calls.push(range))

  let draft = createLogbookMonthDraft(applied, NOW)
  gate.markMonthDraftDirty()
  draft = clearLogbookMonthDraft(draft, NOW)

  assert.deepEqual(draft.monthRange, { from: "", to: "" })
  assert.equal(gate.maybeApply(resolveLogbookDraftRange(draft)), false)
  assert.deepEqual(calls, [], "Clear must not apply before Done")

  gate.resetToApplied(applied)
  assert.equal(gate.monthDraftDirty, false)

  const reopened = createLogbookMonthDraft(applied, NOW)
  assert.deepEqual(reopened.monthRange, { from: "2026-01-01", to: "2026-02-01" })
  assert.equal(gate.applyMonthDraft(resolveLogbookDraftRange(reopened)), false)
  assert.deepEqual(calls, [], "Cancel/discard must not apply an incomplete range")
})

test("shared picker keeps month picks in draft and applies only from Done", () => {
  const pickMonth = fnSource(control, "handlePickMonth")
  const finish = fnSource(control, "finishPicker")
  const close = fnSource(control, "closePicker")

  assert.match(pickMonth, /pickLogbookMonthDraft/)
  assert.match(pickMonth, /markMonthDraftDirty/)
  assert.doesNotMatch(pickMonth, /setOpen/, "first/second month must keep the picker open")
  assert.doesNotMatch(pickMonth, /resetToApplied/, "draft selection must survive both clicks")

  assert.match(finish, /applyMonthDraft/)
  assert.match(finish, /setOpen\(false\)/)
  assert.match(close, /resetToApplied/)
  assert.match(control, /onDone=\{finishPicker\}/)
  assert.match(control, /onOutside=\{closePicker\}/)
  assert.match(control, /onEscape=\{closePicker\}/)
  assert.match(control, /applyGateRef\.current\?\.maybeApply\(range\)/)
  assert.match(control, /createLogbookMonthDraft\(value\)/)

  assert.match(draftLib, /monthRange: EMPTY_RANGE/)
  for (const name of [
    "createLogbookMonthDraft",
    "pickLogbookMonthDraft",
    "clearLogbookMonthDraft",
  ]) {
    assert.doesNotMatch(fnSource(draftLib, name), /onChange/, `${name} must stay side-effect free`)
  }
})

test("non-Month periods keep their existing immediate apply behavior", () => {
  const calls = []
  const gate = createMonthApplyGate({ period: "Day", from: "", to: "" }, (range) => calls.push(range))

  const day = {
    period: "Day",
    from: "2026-04-01",
    to: "2026-04-03",
    dates: ["2026-04-01", "2026-04-02", "2026-04-03"],
  }
  assert.equal(gate.maybeApply(day), true)
  assert.equal(calls.length, 1)
  assert.equal(gate.maybeApply(day), false)
  assert.equal(calls.length, 1, "unchanged ranges must not trigger duplicate fetches")
})

test("full Logbook keeps its controls mounted during background refreshes", () => {
  assert.match(fullPage, /const \[hasLoadedOnce, setHasLoadedOnce\] = useState\(false\)/)
  assert.match(fullPage, /setHasLoadedOnce\(true\)/)
  assert.match(fullPage, /if \(loading && !hasLoadedOnce\)/)
  assert.match(fullPage, /if \(error && !hasLoadedOnce\)/)
  assert.match(fullPage, /aria-busy=\{loading\}/)
  assert.doesNotMatch(fullPage, /if \(loading\) \{\s*return \(/, "later fetches must not replace the whole panel")
  assert.doesNotMatch(fullPage, /window\.location|location\.reload/, "no document navigation on filter changes")

  const pickDay = fnSource(control, "handlePickDay")
  assert.match(pickDay, /setDayRange\(next\)/)
  assert.doesNotMatch(pickDay, /setOpen/, "start/end day picks must not close the calendar")
  assert.match(control, /onPick=\{handlePickDay\}/)
  assert.match(calendar, /getRangePreview\(value, hoverISO\)/)
  assert.match(calendar, /onMouseEnter=\{\(\) => setHoverISO\(iso\)\}/)
})

test("both Logbook parents keep one picker instance with no key-driven remount", () => {
  for (const [name, source] of [
    ["Dashboard Logbook", widget],
    ["Full Logbook", fullPage],
  ]) {
    const tag = source.match(/<LogbookRangePicker\b[\s\S]*?\/>/)?.[0] || ""
    assert.ok(tag, name)
    assert.doesNotMatch(tag, /\bkey=/, `${name} must not remount the picker on applied range changes`)
    assert.match(tag, /onChange=\{changeDateRange\}/, name)
    assert.match(tag, /triggerTestId="logbook-date-range"/, name)
  }
})
