import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8")
const primitives = read("components/ui/primitives.jsx")
const reportsPanel = read("components/admin/ReportsFullPanel.jsx")
const dashboard = read("pages/admin/Dashboard.jsx")
const masterlist = read("pages/admin/Masterlist.jsx")
const adminsPanel = read("components/admin/AdminsPanel.jsx")

const sharedHeader = primitives.match(/export function PageHeader[\s\S]*?\r?\n\}/)?.[0] ?? ""

test("shared PageHeader uses the Reports header design", () => {
  assert.match(sharedHeader, /flex flex-wrap items-center justify-between gap-3/)
  assert.match(sharedHeader, /<div className="flex items-center gap-3">/)
  assert.match(sharedHeader, /flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-brand-900 text-white shadow-e2/)
  assert.match(sharedHeader, /font-serif text-2xl font-semibold leading-tight text-ink-900/)
  assert.match(sharedHeader, /text-xs text-ink-500/)
})

test("Reports uses the shared PageHeader with its existing icon and actions", () => {
  assert.match(reportsPanel, /import \{ PageHeader \} from "\.\.\/ui\/primitives\.jsx"/)
  const header = reportsPanel.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title="Reports"/)
  assert.match(header, /subtitle="Clinic analytics &amp; statistics"/)
  assert.match(header, /icon=\{<NavIcon name="chart" className="h-5 w-5" \/>\}/)
  assert.match(header, /handlePrint/)
  assert.match(header, /handleDownloadPdf/)
})

test("Dashboard keeps its date, greeting, and subtitle in the shared header", () => {
  assert.match(dashboard, /import \{ PageHeader \} from "\.\.\/\.\.\/components\/ui\/primitives\.jsx"/)
  const header = dashboard.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /eyebrow=\{todayLabel\}/)
  assert.match(header, /title=\{greeting\(\)\}/)
  assert.match(header, /subtitle="Overview of today's clinic activity\."/)
  assert.match(header, /className="animate-fade-up"/)
  assert.doesNotMatch(dashboard, /font-serif text-3xl font-semibold/)
})

test("Masterlist keeps its title, subtitle, and icon meaning in the shared header", () => {
  assert.match(masterlist, /import \{ PageHeader \} from ['"]\.\.\/\.\.\/components\/ui\/primitives\.jsx['"]/)
  const header = masterlist.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title="Masterlist"/)
  assert.doesNotMatch(header, /title="MASTERLIST"/)
  assert.match(header, /subtitle="View and manage the master list of students\."/)
  assert.match(header, /icon=\{<MasterlistIcon className="h-5 w-5" \/>\}/)
  assert.doesNotMatch(header, /text-gc-accent/)
})

test("Admins uses the shared header with icon, title, subtitle, and actions", () => {
  assert.match(adminsPanel, /import \{ PageHeader \} from ['"]\.\.\/ui\/primitives\.jsx['"]/)
  const header = adminsPanel.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title="Admins"/)
  assert.match(header, /icon=\{<ShieldIcon className="h-5 w-5" \/>\}/)
  assert.match(header, /subtitle="Admin and super-admin accounts for the Health Services portal\."/)
  assert.match(header, /setShowRequests\(true\)/)
  assert.match(header, /setShowAdd\(true\)/)
  assert.doesNotMatch(header, /title="Admins &amp; staff"/)
  assert.doesNotMatch(adminsPanel, /font-serif text-3xl font-semibold text-ink-900/)
})
