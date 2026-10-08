# Component Conversion & Design-System Consolidation — Design Spec

**Date:** 2026-10-05
**Branch:** `refactor/component-conversion`
**Status:** Pass 1 proof slice complete — 3 of 7 components adopted, 4 deferred to Pass 2
(§4.1.1). Pass 2 (color system) still deferred.
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

#### 4.1.1 Adoption results and the four deferred components (recorded 2026-10-06)

Status after the first proof slice — six commits on this branch (`45d6bed` spec, `2f2869d`,
`d164f42`, `2b95196`, `76e4f6f`, `364875c`):

| Component | Call sites | Status |
|---|---|---|
| `Panel` | 3 — `AppointmentsPanel`, `LogbookPanel`, `Masterlist` (`76e4f6f`, `2b95196`) | ADOPTED |
| `PageHeader` | 2 — `Dashboard`, `Masterlist` (`d164f42`, `2b95196`) | ADOPTED |
| `ErrorBanner` | 1 — `Masterlist` (`2b95196`) | ADOPTED |
| `Button` | 0 | DEFERRED |
| `Badge` | 0 | DEFERRED |
| `Field` | 0 | DEFERRED |
| `EmptyState` | 0 | DEFERRED |

**Why these four are deferred: §2 and §4.1 cannot both hold for them.**

§2 requires Pass 1 to change zero pixels. §4.1 requires delivering all seven components
against the markup that already exists. For `Button`, `Badge`, `Field` and `EmptyState`
those two requirements are mutually exclusive, because the markup they would replace is
**not consistent to begin with** — §1 counts 67 distinct button class strings, each slightly
different. A shared component necessarily renders ONE canonical look; absorbing 67
variations would need a prop per call site. That is a pass-through with extra steps, not an
abstraction. So the choice is: change pixels (break §2) or reproduce every variation via
props (no reuse). Neither is Pass 1 work.

Evidence from the code review of this slice:

- **`Button`** — the base alone contributes `btn-press … justify-center … rounded-control
  font-medium transition-colors duration-150 disabled:*` (`primitives.jsx:112-114`). No
  button in the migrated files carries that set (none uses `rounded-control` at all), so the
  class union can only grow — adoption necessarily changes pixels.
  - Logbook "Print" (`LogbookPanel.jsx:397`): `border-gray-300` / `font-semibold` / `py-2`
    vs `secondary`+`sm`'s `border-gray-200` / `font-medium` / `py-1.5`.
  - Logbook "+ Add Walk-in Visit" (`LogbookPanel.jsx:500`): `text-sm … rounded-lg`; nearest
    fit is `size="lg"`, which injects `text-base` over its `text-sm`.
- **`Badge`** — the "X / Y Booked" pill (`AppointmentsPanel.jsx:110`) is
  `px-2.5 py-1 text-xs font-semibold`, solid pastel, no ring, no dot. `Badge` adds
  `ring-1 ring-inset`, a `text-2xs` size and a child dot (`primitives.jsx:151-155`).
- **`EmptyState`** — the three empty states live inside `<td>` cells (`Masterlist.jsx:234`,
  `LogbookPanel.jsx:477`, `LogbookFullPanel.jsx:490`) or a `py-12` div
  (`AppointmentsPanel.jsx:405`). `EmptyState` renders a `py-14` flex block with a
  `text-base font-medium text-gray-900` title (`primitives.jsx:226-227`) → pixel change.
- **`Field`** — the Masterlist search input (`Masterlist.jsx:168`) is `rounded-xl` +
  `pl-10` icon slot; `Field` is `rounded-control` / `px-3 py-2` with no icon slot
  (`primitives.jsx:202`).

**The principle.** An abstraction only pays when the things being unified are actually the
same. Unifying things that merely look similar yields either a canonical look that moves
every call site, or a prop per call site — a pass-through, not reuse.

**Disposition — Pass 2 (visual normalization).** These four are deferred to a deliberate
second pass that *accepts* a pixel change: screenshot review before/after, and explicit user
approval. Not a silent change, and not something to squeeze into Pass 1 under the
zero-visual-change rule.

**Also in this slice:** the reported defect — Dashboard's serif header vs Masterlist's —
*is* resolved. Both render the §4.2 reference header via `PageHeader` (`d164f42`,
`2b95196`).

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
3. **Visual diff — judged by intent, not by consequence.** Checked with a
   DOM/bounding-box diff plus a pixel diff before/after:
   - **Masterlist:** the visual diff must be empty. (Verified — see §6.2.)
   - **Dashboard:** the ONLY permitted differences are (a) the §4.2 header block
     itself, and (b) the normal-flow reflow that the header's height change
     mechanically causes. Content below the header shifting by a single uniform
     `dy` with `dx = dw = dh = 0` is **reflow, not drift** — a physical
     consequence of the conversion §4.2 mandates, not a defect. There is no
     implementation of §4.2 that avoids it.
   - **Fails — a real regression:** any element with `dx ≠ 0`, `dw ≠ 0`,
     `dh ≠ 0`, or a *non-uniform* `dy` (some elements moved while others did
     not, or they moved by different amounts).

   **The principle — why this criterion is phrased this way.** A verification
   criterion must be satisfiable by the correct implementation. If the only
   correct implementation cannot pass the check, the check is broken — it will
   train the team to wave it through rather than fix the code. This criterion
   was written wrong twice (the original wording, then the `364875c` rewrite),
   both times demanding a result the correct implementation cannot produce.
4. Authenticated smoke test still passes: admin login → `/api/admins/me` 200; student login →
   own record 200 and `/api/admins/me` 403.
5. No new occurrences of the anti-pattern: a repo-wide grep for
   `bg-white rounded-2xl` must not increase.

### 6.1 Proof-slice verification record (2026-10-06)

Re-run against the working tree while writing this record:

| Check | Result |
|---|---|
| 1. `npm run build` | **exit 0** (7.2s; PWA precache 50 entries) |
| 2. `/admin/dashboard`, `/admin/masterlist` | **HTTP 200** (Vite dev server, `:5173`) |
| Backend reachable | `/api/masterlist/students` **200** on `:5000` |
| 4 (admin side). admin login → `/api/masterlist/students` | **200**, `total=6`, 6 rows |
| 5. `bg-white rounded-2xl` — Dashboard / Masterlist / LogbookPanel / AppointmentsPanel | **0 / 0 / 0 / 0** |
| 5 (repo-wide) | `main` 47 → `HEAD` 45 — did not increase |

**Criterion 3 (visual diff) — NOW captured and complete.** Both migrated pages were
diffed at `30613ec` (DOM/bounding-box + pixel) and the results are recorded in §6.2.
This supersedes the "not captured" note that previously stood in its place below.

Not captured for this slice — recorded as not-done rather than assumed:

- Criterion 3 (before/after screenshot diff): superseded — now captured and complete,
  see §6.2.
- Criterion 4 student half (student login → own record 200, `/api/admins/me` 403): not run
  for this record.
- Only the 2 SPA routes this slice touches were re-checked, not all 24.

### 6.2 Visual-diff record at `30613ec` (2026-10-06)

DOM/bounding-box diff of both migrated pages, with head-vs-head captures to establish the
noise floor:

| Page | Result | Evidence |
|---|---|---|
| Masterlist | **PASS** | 277 → 279 elements; the +2 is exactly the two wrapper `<div>`s `PageHeader` introduces. Every element bounding box Δ=0 except the transparent header root (h32 → h54); the description `<p>` is at x=296 y=106 w=1104 h=20 before and after. Pixel diff vs the post-refactor capture = **6px**, below the head-vs-head control of 10px — i.e. noise. |
| Dashboard | **PASS under §6 criterion 3** | 305 → 312 elements (+7, all inside the header block, exactly as §4.2 intends). The header shrank 66px → 46px (old `h1 40 + mt-1 4 + p 22`; new `row 24 + mt-0.5 2 + p 20`), so the 188 in-flow elements below it all moved `dy = −20` with `dx = dw = dh = 0` (first card y=158 → 138; stats toolbar y=175 → 155; logbook table y=322 → 302; appointments section y=818 → 798). Sizes and shapes unchanged. Pixel diff = 201,782px against a head-vs-head control of 0px — the pixels really did move, uniformly, because the header got shorter. Reflow, not drift. |

**Defect found and fixed during this verification — the most useful result of the slice.**

- `30613ec` fixed a `ReferenceError: icon is not defined` in `PageHeader`
  (`src/components/primitives.jsx:82` referenced the pre-rename name after line 77
  destructured `icon: Icon`). The guard threw at render time and sent `/admin/dashboard`
  and `/admin/masterlist` to the error boundary.
- It was introduced by `76e4f6f`, whose message claimed the guard existed so that a
  forgotten icon "must not white-screen" the admin pages.
- **Why it shipped:** four checks passed and all four were blind to it. `npm run build`
  succeeded; both routes returned HTTP 200 (Vite serves `index.html` for any SPA route,
  so 200 ≠ rendered); the auth smoke test passed; a class-string diff passed (an
  out-of-scope identifier changes no `className`). Only actually rendering the page
  caught it — which is precisely what criterion 3 exists for.

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

- Pass 2 adoption of `Button`, `Badge`, `Field`, `EmptyState` — 0 call sites after the proof
  slice; §2 and §4.1 conflict for these four, see §4.1.1. Needs screenshot review + user
  approval, not a silent change.
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