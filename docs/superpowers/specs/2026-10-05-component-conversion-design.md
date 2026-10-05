# Component Conversion & Design-System Consolidation — Design Spec

**Date:** 2026-10-05
**Branch:** `refactor/component-conversion`
**Status:** Approved for Pass 1 (reuse). Pass 2 (color system) deferred.
**Deadline context:** Presentation 2026-10-08. Main branch stays demo-ready.

---

## 1. Problem

An audit of `src/` (56 components, 23 pages, 201 exports) found that visual reuse is
effectively **zero**:

| Layer | Reuse level |
|---|---|
| `src/lib/` (data/logic) | **Good** — `api.js` used by 30 files; no component bypasses it for HTTP |
| Components imported by 2+ consumers | 14 / 56 (25%) |
| Visual primitives via a shared component | **0 of 46** card wrappers, 67 button styles, 61 form labels, 15 tables, 25 error banners, 12 spinners, 8 badge implementations |

Three prior attempts to fix this were built and **never adopted**:

- `src/components/primitives.jsx` (189 lines) — zero importers
- `index.css` component layer `.panel/.btn-*/.t-*` (69 lines) — zero usages
- Three local `SectionHeader` copies that drifted (one lost `subtitle`, one lost `right`)

The root cause is that nothing *enforces* reuse. `primitives.jsx` line 3-6 admits it was
written because "the old build had ~40 copies of `bg-white rounded-2xl shadow-sm`" — the
problem was diagnosed and solved, then the solution was never rolled out, so duplication
regrew.

### 1.1 Bugs already caused by divergence

These are latent defects from duplicated code having drifted apart:

1. **HIGH — "No-show" silently fails to save.** `StatusMenu` offers `"No-show"`
   (`data/dashboardSample.js:4`); backend `_normalize_status` (`routers/appointment.py:120-128`)
   only accepts `"No-Show"`, so it returns **400**. The frontend writes the new status
   optimistically and only `console.error`s — the table shows "No-show" while the database
   still says `pending`.
2. **HIGH — divergent `mapEntry`/`mapLogEntry`.** `LogbookPanel.jsx:42` parses
   `deptCourse` and produces `dateISO`; `LogbookFullPanel.jsx:98` does neither. The
   dashboard widget and the Logbook page render different Dept/Course text for the same visit.
3. **MEDIUM — three `initials()` implementations** with three different input contracts
   (`AdminsPanel.jsx:15`, `admin/StudentRecordPanel.jsx:79`, `Topbar.jsx:5`). Input
   `"Dela Cruz, Juan"` yields `DC` in one and `JD` in another.
4. **MEDIUM — two sources of truth for departments/courses.** `Masterlist.jsx` fetches from
   the API; `EditStudentInfoModal.jsx:11` hardcodes 36 entries from `data/masterlistSample.js`.
   A course added to the DB will not appear in the student edit dropdown.
5. **LOW — locale drift.** `Feedback.jsx:192` uses `en-PH`; 7 other files use `en-US`.

> These are tracked as separate fixes and are **not** in scope for Pass 1. They are listed
> so the refactor's regression tests cover them.

---

## 2. Scope and sequencing — the central constraint

**A component refactor must change zero visuals. A color migration changes visuals on
purpose. These are different kinds of change and must not share a commit.**

If they are mixed, no reviewer can tell whether a visual difference came from the refactor
or from the palette change. That is how regressions hide.

### Pass 1 — this branch. Reuse, zero visual change.

Build shared components using the tokens the majority of files already use
(`gc-green` for primary, `gray-*` for chrome). Every rendered pixel must stay identical.

### Pass 2 — separate branch, after the presentation. Color system.

`brand.*` becomes canonical, `ink.*` replaces `gray-*`, `signal.*` replaces `red-*`.
Every step is a separate commit with a screenshot.

---

## 3. Color system findings (informs Pass 2, constrains Pass 1)

Verified from `tailwind.config.js` and all 174 `<button>` elements in `src/`.

### 3.1 The primary green is already unified

`bg-gc-green`, `bg-gc-green-700`, and `bg-brand-900` all render **the identical `#044B0E`**.
Three names, one color. Nothing to fix.

### 3.2 The `gc` → `brand` step numbers are OFFSET — aliasing naively breaks the UI

| Legacy token | Actual hex | Naive same-step alias | Effect if wrong |
|---|---|---|---|
| `gc-green-600` | `#0A5A16` | `brand-600` `#1F8B32` | hovers lighten |
| `gc-green-700` | `#044B0E` | `brand-700` `#12712A` | **every primary button lightens** |
| `gc-green-800` | `#052C0B` | `brand-800` `#0A5A16` | hovers lighten |

A value-preserving remap **must** respect the offset:

| Legacy | Canonical (Pass 2) |
|---|---|
| `gc.green.DEFAULT` | `brand.900` |
| `gc.green.50` | `brand.50` |
| `gc.green.100` | `brand.100` |
| `gc.green.600` | `brand.800` |
| `gc.green.700` | `brand.900` |
| `gc.green.800` | `brand.950` |
| `gc.accent` | `brand.700` |
| `gc.student` | `brand.600` |

`gc.green.900` = `#041F07` has **no** `brand` counterpart and needs a new token
(e.g. `brand.975`). Only 2 usages, both hovers in `StudentSidebarContent.jsx:99,110`.

The deliberate admin/student distinction is preserved as `brand.900` (admin) vs
`brand.700` (student) — see the comment at `StudentLoginForm.jsx:9-10`.

### 3.3 The real drift: `AdminsPanel.jsx` alone adopted the new palette

| Role | `AdminsPanel.jsx` | The other 60+ files |
|---|---|---|
| Danger / delete | `signal-rose` `#B42318` | `red-600` `#DC2626` |
| Secondary button | `border-ink-200` / `text-ink-700` | `border-gray-200` / `text-gray-700` |

**The Admins page therefore has visibly different buttons from every other page.** This is
the inconsistency a human actually notices. It is a Pass 2 fix.

### 3.4 Scale of the eventual migration

Core Tailwind color classes: **1,460 occurrences across 68 files** (`gray` 958, `white` 312,
`red` 109, `amber` 43) vs custom palettes: 627. Migrating `gray-*` → `ink-*` shifts every
hairline (`border-gray-200` `#E5E7EB` → `ink-200` `#D6DBD7`) and label
(`text-gray-700` `#374151` → `ink-700` `#2C3730`). Hence Pass 2, not Pass 1.

---

## 4. Pass 1 architecture

### 4.1 Revive `primitives.jsx` rather than inventing a new library

The file already exists and is ~80% correct. Retoken it to the tokens the majority of files
use. Do **not** create a parallel `ui/` library — that is how the last three attempts failed.

Components to deliver:

| Component | Purpose | Replaces |
|---|---|---|
| `Panel` | Card wrapper | ~40-46 inline `bg-white rounded-2xl border-gray-200` |
| `Button` | `primary` / `secondary` / `danger` / `ghost` variants | 67 ad-hoc class strings |
| `Badge` | Status pill | 8 separate implementations |
| `EmptyState` | Empty/zero-result message | 5+ unique-worded inline versions |
| `Field` | Label + input + error | 61 `<label>` wrappers, 6 label styles |
| `PageHeader` | Admin page header, **single style** | 3 competing designs across ~15 sites |
| `ErrorBanner` | Inline error message | 25 renderings, 3 shapes |

### 4.2 Single admin header style

Decision: **one** admin header style — the Masterlist pattern the product owner selected as
the reference:

```
[ICON] TITLE
Description sentence.
```

- Icon: `h-5 w-5 text-gc-accent`, from the existing `src/components/icons.jsx`
- Title: `text-lg font-extrabold tracking-wide text-gray-900`, uppercase text
- Description: `mt-0.5 text-sm text-gray-500`

Applied to every admin page. The two competing styles are converted:

| Current | File | Action |
|---|---|---|
| Serif 34px editorial | `Dashboard.jsx:38-39`, `AdminsPanel.jsx:294` | Convert |
| Masterlist uppercase | `Masterlist.jsx:151-155` | **Reference — keep** |
| Tinted tile + green title | `LogbookFullPanel:360-371`, `ReportsFullPanel:482`, `ClinicScheduleFullPanel:355` | Convert |

`DashboardIcon` already exists and is exported but unused — no new artwork needed.

**Not in scope:** student-side page headers. Only the admin surface is unified in Pass 1.

### 4.3 Migration order — each step leaves the app working and is separately committed

1. Extend `primitives.jsx` with the components above (no call sites changed yet).
2. Migrate **Dashboard** header + its cards/buttons.
3. Migrate **Masterlist** header + table + buttons (the proof slice).
4. Convert the remaining admin headers (Logbook, Reports, ClinicSchedule, Admins, Profile).
5. Delete the dead `index.css` component layer (`.panel/.btn-*/.t-*`) so the old way is
   unavailable.
6. Add `docs/COMPONENT_CONVENTIONS.md`.

Rollback is trivial at every step: `git checkout main` returns to the demo-ready state.

### 4.4 Enforcement — the part that stops it regrowing

Reuse collapsed last time because nothing prevented a copy-paste. Deliver:

- `docs/COMPONENT_CONVENTIONS.md` — the rules, with the correct/incorrect examples
- Deletion of the dead CSS layer (removes the tempting alternative)
- `primitives.jsx` header comment stating it is the required import path for visual elements

---

## 5. Non-goals for Pass 1

- **No color/palette changes.** No visible pixel may change.
- **No routing changes.** Confirmed unnecessary: all 27 routes in `App.jsx` are prop-less
  (`element={<X />}`), and each "duplicate" panel has exactly one consumer
  (`AppointmentsPanel`/`LogbookPanel` → `Dashboard.jsx` only). `App.jsx` stays untouched.
- **No deduplication of the page-clone pairs** (`AppointmentsPanel` ↔ `AppointmentsFullPanel`
  at 79.8% overlap; `LogbookPanel` ↔ `LogbookFullPanel` at 45.2%). ~900 duplicated lines.
  Sequenced separately — it is a behavior-affecting merge, not a visual one.
- **No student-side header changes.**
- **No fixes to the 5 drift bugs in §1.1** — separate commits, separate verification.

---

## 6. Verification

Each step must satisfy all of:

1. `npm run build` succeeds with no new warnings.
2. Backend reachable; the 24 SPA routes return 200.
3. **Visual diff on the two migrated pages is empty** — this is the Pass 1 acceptance
   criterion, checked by screenshot before/after.
4. Authenticated smoke test still passes: admin login → `/api/admins/me` 200; student login →
   own record 200 and `/api/admins/me` 403.
5. No new occurrences of the anti-pattern: a repo-wide grep for
   `bg-white rounded-2xl` must not increase.

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Visual regression slips in | Medium | Acceptance criterion is a byte-comparable screenshot; revert that commit |
| Scope creep into Pass 2 | High | Non-goals §5; any color change is rejected in review |
| Refactor stalls mid-way | Medium | Every step is committed and independently working; abandon branch at any time |
| Reviewer cannot tell what changed | Low | Pure-markup commits, no logic changes in Pass 1 |

---

## 8. Deferred work register

Tracked, not started:

- Pass 2 color migration (`brand`/`ink`/`signal` canonical, offset-safe aliasing, AdminsPanel
  unification)
- Page-clone deduplication (~900 lines)
- `No-show` 400 + optimistic-UI silent failure
- Divergent `mapEntry` between the Logbook pair
- Three `initials()` implementations → one
- Dept/course dual source of truth → API only
- `en-PH` vs `en-US` locale drift
- `/admin/about` dead link (desktop button has no `onClick`; mobile link → 404)
- `ProtectedRoute` has no role gate — students can reach `/admin/*` URLs
- Single app-wide `<Suspense>`/error boundary — one bad chunk unmounts the whole SPA
- Delete `primitives.jsx`'s dead exports, `lib/timeSlots.js` mock generator, and
  `data/studentRecordSample.js` re-export shim
- `SUPABASE_SERVICE_ROLE_KEY` rotation (in `.env` git history)