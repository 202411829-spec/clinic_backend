import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (relativePath) => readFileSync(`src/${relativePath}`, "utf8")
const primitives = read("components/ui/primitives.jsx")
const reportsPanel = read("components/admin/ReportsFullPanel.jsx")
const reportsPage = read("pages/admin/Reports.jsx")
const clinicSchedulePanel = read("components/admin/ClinicScheduleFullPanel.jsx")
const clinicSchedulePage = read("pages/admin/ClinicSchedule.jsx")
const adminsPanel = read("components/admin/AdminsPanel.jsx")
const adminsPage = read("pages/admin/Admins.jsx")
const profilePage = read("pages/admin/Profile.jsx")
const dashboard = read("pages/admin/Dashboard.jsx")
const masterlist = read("pages/admin/Masterlist.jsx")

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

test("Dashboard keeps its greeting left and date right in the shared header", () => {
  assert.match(dashboard, /import \{ PageHeader \} from "\.\.\/\.\.\/components\/ui\/primitives\.jsx"/)
  const header = dashboard.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title=\{greeting\(\)\}/)
  assert.match(header, /subtitle="Overview of today's clinic activity\."/)
  assert.match(header, /actions=\{/)
  assert.match(header, /\{todayLabel\}/)
  assert.match(header, /text-right/)
  assert.doesNotMatch(header, /eyebrow=\{todayLabel\}/)
  assert.match(header, /className="animate-fade-up[^\"]*\[&>div:last-child\]:ml-auto/)
  assert.match(dashboard, /<div className="space-y-5 pt-3 sm:pt-4">/)
  assert.doesNotMatch(dashboard, /font-serif text-3xl font-semibold/)
})

test("Masterlist keeps its title, subtitle, and icon inside the table card", () => {
  assert.doesNotMatch(masterlist, /<PageHeader/)
  assert.match(masterlist, /<div className="pt-2">/)

  const card = masterlist.match(/<section[\s\S]*?<\/section>/)?.[0] ?? ""
  assert.match(card, /card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6/)
  assert.match(card, /flex items-center gap-2 mb-4/)
  assert.match(card, /w-8 h-8 rounded-md bg-gc-green\/10 text-gc-green/)
  assert.match(card, /<MasterlistIcon className="w-4 h-4" \/>/)
  assert.match(card, /font-bold text-gc-green text-base md:text-lg leading-tight/)
  assert.match(card, />\s*Masterlist\s*</)
  assert.match(card, /View and manage the master list of students\./)
  assert.match(card, /grid grid-cols-1 md:grid-cols-4 gap-2 mb-4/)
  assert.match(card, /<NavIcon name="search"/)
  assert.match(card, /triggerTestId="masterlist-department-filter"/)
  assert.match(card, /triggerTestId="masterlist-course-filter"/)
  assert.match(card, /triggerTestId="masterlist-year-filter"/)
  assert.match(card, /<table className="tbl min-w-\[900px\] md:min-w-0">/)
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

test("all four Management pages use the same outer top spacing", () => {
  assert.match(reportsPage, /<div className="pt-2">/)
  assert.match(clinicSchedulePage, /<div className="pt-2">/)
  assert.match(adminsPage, /<div className="pt-2">\s*<AdminsPanel \/>\s*<\/div>/)
  assert.match(profilePage, /<div className="pt-2">/)
})

test("Clinic Schedule uses the shared PageHeader above its content card", () => {
  assert.match(clinicSchedulePanel, /import \{ PageHeader \} from ['"]\.\.\/ui\/primitives\.jsx['"]/)
  const header = clinicSchedulePanel.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title="Clinic Schedule"/)
  assert.match(header, /subtitle="Set clinic hours, breaks, and appointment availability\."/)
  assert.match(header, /icon=\{<NavIcon name="calendar" className="h-5 w-5" \/>\}/)
  assert.match(clinicSchedulePanel, /<div className="space-y-5">\s*<PageHeader/)
  assert.doesNotMatch(clinicSchedulePanel, /<div className="flex items-center gap-2 mb-3">/)
  assert.match(clinicSchedulePanel, /<section className="card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">/)
})

test("Profile uses the shared PageHeader above its content card", () => {
  assert.match(profilePage, /import \{ PageHeader \} from ['"]\.\.\/\.\.\/components\/ui\/primitives\.jsx['"]/)
  const header = profilePage.match(/<PageHeader[\s\S]*?\n\s+\/>/)?.[0] ?? ""
  assert.match(header, /title="Profile"/)
  assert.match(header, /subtitle="Your account details and clinic license information\."/)
  assert.match(header, /icon=\{<NavIcon name="user" className="h-5 w-5" \/>\}/)
  assert.doesNotMatch(profilePage, /<h1 className="text-2xl font-bold text-gray-900">Profile<\/h1>/)
  assert.match(profilePage, /<div className="mx-auto max-w-2xl space-y-5">/)
})
