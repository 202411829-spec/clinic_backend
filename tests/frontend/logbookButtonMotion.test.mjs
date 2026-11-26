import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(path, "utf8")

const buttons = read("src/components/ui/PrintDownloadButtons.jsx")
const styles = read("src/assets/styles/gc-rfb-ui.css")

const actionSources = [
  ["Dashboard Logbook", read("src/components/admin/LogbookPanel.jsx")],
  ["Full Logbook", read("src/components/admin/LogbookFullPanel.jsx")],
  ["Reports", read("src/components/admin/ReportsFullPanel.jsx")],
  ["Medical Certificate", read("src/components/admin/MedicalCertificatePanel.jsx")],
  ["Medical Summary", read("src/components/admin/MedicalSummaryPanel.jsx")],
]

test("every Print and Download PDF action uses the shared compact buttons", () => {
  for (const [name, source] of actionSources) {
    assert.match(
      source,
      /import \{ DownloadPdfButton, PrintButton \} from "\.\.\/ui\/PrintDownloadButtons\.jsx"/,
      name
    )
    assert.match(source, /<PrintButton\b/, name)
    assert.match(source, /<DownloadPdfButton\b/, name)
    assert.doesNotMatch(source, /<NavIcon name="printer"/, name)
    assert.doesNotMatch(source, /<NavIcon name="download"/, name)
    assert.doesNotMatch(source, /Preparing…/, name)
  }

  const reports = actionSources.find(([name]) => name === "Reports")[1]
  assert.doesNotMatch(reports, /btn-secondary btn-press/)
  assert.doesNotMatch(reports, /btn-primary btn-press btn-shine/)
})

test("Print and Download PDF share the exact compact base sizing and states", () => {
  assert.match(buttons, /const ACTION_BASE =/)
  assert.match(buttons, /const PRINT_ACTION = `\$\{ACTION_BASE\}/)
  assert.match(buttons, /const PDF_ACTION = `\$\{ACTION_BASE\}/)
  assert.match(
    buttons,
    /inline-flex items-center justify-center gap-1\.5 rounded-lg px-3 py-2 text-xs font-semibold/
  )
  assert.match(buttons, /disabled:cursor-not-allowed disabled:opacity-60/)
  assert.match(buttons, /transition-colors duration-200/)
  assert.match(buttons, /gc-uiverse-print-btn border border-ink-200 bg-white text-ink-700/)
  assert.match(buttons, /gc-pdf-sweep bg-gc-green text-white/)
  assert.match(buttons, /<NavIcon name="download" className="h-4 w-4" \/>/)
  assert.match(buttons, /loading \? "Preparing…" : label/)
  assert.doesNotMatch(styles, /width: 100px;/)
  assert.doesNotMatch(styles, /height: 45px;/)
  assert.match(styles, /\.gc-uiverse-printer-wrapper \{[\s\S]*?width: 16px;[\s\S]*?height: 16px;/)
})

test("Print keeps the Uiverse glyph motion and PDF keeps the scoped sweep animation", () => {
  assert.match(buttons, /viewBox="0 0 92 75"/)
  assert.match(buttons, /maskId\s*=/)
  assert.match(buttons, /gc-uiverse-printer-page-wrapper/)
  assert.match(styles, /\.gc-uiverse-print-btn\s*\{/)
  assert.match(styles, /\.gc-uiverse-printer-page\s*\{[\s\S]*?height: 6px;/)
  assert.match(
    styles,
    /\.gc-uiverse-print-btn:hover:not\(:disabled\) \.gc-uiverse-printer-page\s*\{\s*height: 12px;/
  )
  assert.match(styles, /\.gc-pdf-sweep::before\s*\{[\s\S]*?width: 0;/)
  assert.match(styles, /\.gc-pdf-sweep:hover:not\(:disabled\)::before\s*\{\s*width: 100%;/)
  assert.match(
    styles,
    /\.gc-pdf-sweep:hover:not\(:disabled\) \.gc-pdf-sweep__label\s*\{\s*color: transparent;\s*transform: translateX\(22px\);/
  )
  assert.match(styles, /\.gc-pdf-sweep:active:not\(:disabled\)::before\s*\{\s*background-color: #146c54;/)
})

test("button motion is disabled under prefers-reduced-motion", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styles, /\.gc-uiverse-print-btn,\s*\.gc-uiverse-printer-page,\s*\.gc-pdf-sweep/)
  assert.match(styles, /\.gc-pdf-sweep:hover:not\(:disabled\)::before \{ width: 0; \}/)
  assert.match(styles, /color: inherit;\s*transform: none;/)
})
