import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  formatDisplayName,
  formatMiddleInitial,
  formatStudentNaturalName,
} from "../../src/lib/format.js"
import { adaptStudent } from "../../src/lib/studentProfileAdapter.js"
import { adaptStudentProfile } from "../../src/lib/studentAdapter.js"

const PROFILE = {
  student_id: "202311330",
  first_name: "Juan",
  middle_initial: "B",
  last_name: "Doe",
  suffix: null,
  birth_date: "2003-07-15",
  gender: "Male",
  civil_status: "Single",
  contact_number: "09171234567",
  present_address: "Campus",
  year_level: "IV",
  course_name: "BSIT",
  department_name: "CCS",
  department_id: 3,
  course_id: 9,
  photo: null,
}

test("middle initial formatting is idempotent and preserves full middle names", () => {
  assert.equal(formatMiddleInitial("B"), "B.")
  assert.equal(formatMiddleInitial("B."), "B.")
  assert.equal(formatMiddleInitial("B......"), "B.")
  assert.equal(formatMiddleInitial("Daniel"), "Daniel.")
  assert.equal(formatMiddleInitial("Daniel."), "Daniel.")
  assert.equal(formatMiddleInitial(""), "")
  assert.equal(formatMiddleInitial(null), "")
})

test("student record display collapses legacy dotted middle initials", () => {
  const profile = { ...PROFILE, middle_initial: "B......" }

  const student = adaptStudent(profile, null)
  assert.equal(student.name, "Doe, Juan B.")
  assert.equal(formatDisplayName(student.name), "Juan B. Doe")

  const adminStudent = adaptStudentProfile(profile, null)
  assert.equal(adminStudent.name, "Doe, Juan B.")

  assert.equal(formatDisplayName("Doe, Juan B......"), "Juan B. Doe")
})

test("profile header and student record use the normalized display helpers", () => {
  assert.equal(formatStudentNaturalName("Juan", "B......", "Doe"), "Juan B. Doe")

  const layout = readFileSync("src/layouts/StudentLayout.jsx", "utf8")
  const studentRecord = readFileSync("src/components/student/StudentRecordPanel.jsx", "utf8")

  assert.match(layout, /formatStudentNaturalName\(/)
  assert.match(studentRecord, /formatDisplayName\(student\.name\)/)
})

test("student identity moves into the sidebar above MAIN and leaves the topbar", () => {
  const sidebar = readFileSync("src/components/navigation/StudentSidebarContent.jsx", "utf8")
  const desktopSidebar = readFileSync("src/components/navigation/StudentSidebar.jsx", "utf8")
  const mobileSidebar = readFileSync("src/components/navigation/StudentMobileSidebarOverlay.jsx", "utf8")
  const layout = readFileSync("src/layouts/StudentLayout.jsx", "utf8")
  const header = readFileSync("src/components/navigation/HeaderBar.jsx", "utf8")

  assert.match(desktopSidebar, /w-64 shrink-0/)
  assert.match(sidebar, /<StudentSidebarProfile user=\{user\} onNavigate=\{onNavigate\} \/>/)
  assert.match(sidebar, /truncate whitespace-nowrap/)
  assert.match(sidebar, /min-w-0 flex-1 leading-tight/)
  assert.match(sidebar, /title=\{identityTooltip\}/)
  assert.match(sidebar, /title=\{program\}/)
  assert.match(sidebar, /to="\/student\/record"/)

  const profileIndex = sidebar.indexOf("<StudentSidebarProfile")
  const mainIndex = sidebar.indexOf("text-white/60 uppercase mb-2")
  assert.ok(profileIndex !== -1 && mainIndex !== -1 && profileIndex < mainIndex)

  assert.match(layout, /<StudentSidebar profileComplete=\{profileComplete\} user=\{currentUser\} \/>/)
  assert.match(mobileSidebar, /open, onClose, profileComplete, user/)
  assert.match(layout, /showProfile=\{false\}/)
  assert.match(header, /showProfile = true/)
  assert.match(header, /\{showProfile \? \(/)
})

test("admin and student sidebar profiles keep identity text on one line", () => {
  const admin = readFileSync("src/components/navigation/AdminSidebarProfile.jsx", "utf8")
  const sidebar = readFileSync("src/components/navigation/StudentSidebarContent.jsx", "utf8")
  const layout = readFileSync("src/layouts/StudentLayout.jsx", "utf8")

  assert.match(admin, /flex min-w-0 items-center gap-3/)
  assert.match(admin, /min-w-0 flex-1 leading-tight/)
  assert.match(admin, /h-10 w-10 shrink-0/)
  assert.match(admin, /truncate whitespace-nowrap text-xs font-semibold text-white" title=\{email\}/)
  assert.match(admin, /title=\{displayRole\}/)
  assert.doesNotMatch(admin, /break-all|break-words|line-clamp/)

  assert.match(sidebar, /const identityTooltip = user\?\.email \|\| displayName/)
  assert.match(sidebar, /truncate whitespace-nowrap text-xs font-semibold text-white" title=\{identityTooltip\}/)
  assert.match(sidebar, /min-w-0 flex-1 leading-tight/)
  assert.match(sidebar, /h-10 w-10 shrink-0/)
  assert.doesNotMatch(sidebar, /break-all|break-words|line-clamp/)

  assert.match(layout, /const \{ studentId, email \} = useAuth\(\)/)
  assert.match(layout, /email: email \|\| ""/)
})
