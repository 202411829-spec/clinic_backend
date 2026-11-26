import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

const css = read('src/assets/styles/gc-rfb-ui.css')
const motion = read('src/lib/gcMotion.js')
const universalDropdown = read('src/components/ui/UniversalDropdown.jsx')
const periodDropdown = read('src/components/admin/PeriodDropdown.jsx')
const calendar = read('src/components/admin/SelectDateCalendar.jsx')
const confirmDialog = read('src/components/ui/ConfirmDialog.jsx')
const animatedCheckbox = read('src/components/ui/AnimatedCheckbox.jsx')

test('GC-RFB CSS layer carries the documented dropdown, checkbox, calendar, and modal timings', () => {
  assert.match(css, /gc-select-menu-in 300ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/)
  assert.match(css, /gc-select-menu-out 220ms cubic-bezier\(0\.4, 0, 1, 1\)/)
  assert.match(css, /gc-origin-in 180ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/)
  assert.match(css, /\.gc-cal-pop\.gc-origin-panel \{[\s\S]*?gc-origin-in 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /\.gc-cal-pop\.gc-origin-panel\.is-close \{[\s\S]*?gc-origin-out 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /stroke-dashoffset 0\.3s linear/)
  assert.match(css, /stroke-dashoffset 0\.2s linear/)
  assert.match(css, /transition-delay: 0\.15s/)
  assert.match(css, /gcCalPopIn 0\.32s cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /gcCalPopOut 0\.26s cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /opacity 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /opacity 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /transform 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /transform 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('trigger-origin utility clamps scale and preserves origin while closing', () => {
  assert.match(motion, /MIN_SCALE = 0\.12/)
  assert.match(motion, /MAX_SCALE = 0\.55/)
  assert.match(motion, /'--gc-origin-x'/)
  assert.match(motion, /'--gc-origin-y'/)
  assert.match(motion, /'--gc-origin-scale'/)
  assert.match(motion, /Keep the last computed origin while closing/)
  assert.match(motion, /useModalPresence/)
})

test('both dropdowns use the GC-RFB menu chrome and close animation', () => {
  for (const [name, source] of [
    ['UniversalDropdown', universalDropdown],
    ['PeriodDropdown', periodDropdown],
  ]) {
    assert.match(source, /useTriggerOrigin/, `${name} should compute a trigger origin`)
    assert.match(source, /gc-uiverse-select-menu/, `${name} should use the GC menu chrome`)
    assert.match(source, /gc-uiverse-select-item/, `${name} should use GC option styling`)
    assert.match(source, /is-closing/, `${name} should play the closing animation`)
    assert.match(source, /aria-haspopup="listbox"/, `${name} keeps listbox semantics`)
  }
  assert.match(periodDropdown, /import \{ REGULAR_TIME_PERIODS \} from "\.\.\/\.\.\/lib\/reportPeriods\.js"/)
  assert.match(periodDropdown, /REGULAR_TIME_PERIODS\.map/)
})

test('calendar uses the GC-RFB day grid without inventing a month transition', () => {
  assert.match(calendar, /gc-cal-navbtn/)
  assert.match(calendar, /gc-cal-dow/)
  assert.match(calendar, /gc-cal-grid/)
  assert.match(calendar, /gc-cal-day/)
  assert.match(calendar, /gc-cal-today/)
  assert.doesNotMatch(calendar, /animate-fade-in/)
  assert.doesNotMatch(calendar, /slide|monthIn|monthOut/i)
})

test('confirm dialog uses modal presence and origin-based panel motion', () => {
  assert.match(confirmDialog, /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/)
  assert.match(confirmDialog, /useTriggerOrigin/)
  assert.match(confirmDialog, /gc-modal-backdrop/)
  assert.match(confirmDialog, /gc-modal-panel/)
  assert.match(confirmDialog, /role="alertdialog"/)
  assert.match(confirmDialog, /aria-modal="true"/)
  assert.match(confirmDialog, /if \(e\.key === "Escape" && !busy\) onCancel\?\.\(\)/)
})

test('AnimatedCheckbox preserves native checkbox semantics', () => {
  assert.match(animatedCheckbox, /<input[^>]*type="checkbox"/)
  assert.match(animatedCheckbox, /gc-checkbox-input/)
  assert.match(animatedCheckbox, /aria-hidden="true"/)
  assert.match(animatedCheckbox, /points="1 9 7 14 15 4"/)
})
