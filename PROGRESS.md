# Project Progress
Updated: 2026-10-06

## Current Goal
Land the component-conversion proof slice (3 of 7 components adopted) on `refactor/component-conversion` and keep the demo ready for the 2026-10-08 pitch.

## Steps
| # | Step | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Audit Vercel readiness | explore | DONE | main.py import-safe; mixed /api + root routes found |
| 2 | Choose topology | user | DONE | Monorepo confirmed by user |
| 3 | Frontend /api normalizer | general | DONE | b2e1e6e - toApiUrl(), local dev unchanged |
| 4 | Backend scaffolding | general | DONE | 3f32caa - api/index.py, api/requirements.txt, vercel.json, .vercelignore |
| 5 | Fix /api double-prefix 404 | team-lead | DONE | 3b2e7bd - all /api/* routes verified 200 with real admin token |
| 6 | Push commits to origin | team-lead | DONE | 2026-10-06: `refactor/component-conversion` pushed and now tracks `origin/refactor/component-conversion` (17 commits, 45d6bed..5e5a39e). `main` NOT merged, NOT deployed |
| 7 | Set Vercel env vars | user | PENDING | Dashboard step, see below |
| 8 | First Vercel deploy | user | PENDING | After push + env vars |
| 9 | Fix backend proxy env-var issue | user | DONE | 2b9d32f - verified 2026-10-06: with HTTP_PROXY/HTTPS_PROXY/ALL_PROXY = http://127.0.0.1:9, startup logged `Cleared proxy env vars before Supabase client init` and /api/admins/me returned HTTP 200 three consecutive times with admin_id 1 |
| 10 | Proof-slice code review | team-lead | DONE | 45d6bed..364875c; Panel(3) / PageHeader(2) / ErrorBanner(1) adopted; 4 components deferred |
| 11 | Record deferral in spec | software-engineer | DONE | spec §4.1.1 (status + why) and §6.1 (verification record) |
| 12 | Visual-diff verification (spec §6 criterion 3) | software-engineer | DONE | DOM/bounding-box + pixel diff at 30613ec: Masterlist PASS (empty; +2 = PageHeader wrappers, 6px = noise floor); Dashboard PASS under the corrected criterion (header 66→46px, 188 elements uniformly dy=−20, dx=dw=dh=0 = reflow not drift). Results in spec §6.2 |
| 13 | Fix PageHeader white-screen | software-engineer | DONE | 30613ec - ReferenceError "icon is not defined" (primitives.jsx:82, introduced by 76e4f6f); build / HTTP 200 / auth smoke / class-string diff all blind to it — only rendering caught it |
| 14 | Fix student IDOR on GET endpoints | software-engineer | DONE | de2bf5a - shared guard `ensure_student_access()` (routers/auth_guard.py:213): admin OR self → allow, else 403; applied to 11 routes across feedback.py, logbook.py, masterlist.py, notifications.py, student.py, student_record.py; roster endpoints admin-only. Tests: tests/test_idor_authorization.py (11 tests, fail pre-fix). Full suite 35 passed / 1 pre-existing failure (see stale-test note). External review APPROVED |
| 15 | Unify admin headers on shared PageHeader | software-engineer | DONE | 84ee22e + 70161f7 - all 9 admin pages converted (Dashboard, Masterlist, Admins & Staff, Profile, Medical Summary, Logbook, Reports, Clinic Schedule, Appointments); every page verifiably renders: no ErrorBoundary, no ReferenceErrors, §6.3 box-level PASS |
| 16 | S-1 case-normalization + residual appointment/logbook IDOR | software-engineer | DONE | 5e5a39e - (a) lookups normalized at handler top with the same helper `ensure_student_access` uses: `test001` (lowercase) now reads own profile; the upstream guard was already normalized, downstream `.eq("student_id", ...)` sites were the break. (b) admin-or-self enforcement added via `ensure_student_access()` to `/appointments?student_id=`, `/appointments/<id>`, `/logbook` (roster), `/logbook/<log_id>`; public/anonymous endpoints (slot preview) untouched. Tests: tests/test_student_id_case_normalization.py (7) + tests/test_appointment_logbook_idor.py (21), both fail pre-fix. Suite: 63 passed / 1 pre-existing failure (stale-test note below). Live curl-verified: S-1 → 200 returning TEST001; A→B logbook/appointments → 403; own data → 200; admin cross → 200 |

## Blockers / Decisions
- Decision: `Button`/`Badge`/`Field`/`EmptyState` adoption deferred to Pass 2 — spec §2 (zero
  visual change) and §4.1 (adopt all 7) conflict for these four given the existing markup's
  inconsistency; documented in spec §4.1.1.
- Resolved: backend proxy env-var issue — committed as 2b9d32f; verified 2026-10-06 with
  HTTP_PROXY/HTTPS_PROXY/ALL_PROXY = http://127.0.0.1:9: startup logged `Cleared proxy
  env vars before Supabase client init`, /api/admins/me 200 ×3 (admin_id 1).
- Resolved: branch pushed — `refactor/component-conversion` tracks
  `origin/refactor/component-conversion` (17 commits, 45d6bed..5e5a39e).
  `main` NOT merged, NOT deployed.
- Resolved (S-1, 5e5a39e): `test001` profile case-sensitivity — lookups now normalized at
  handler top; downstream `.eq("student_id", raw)` sites no longer break on
  case-mismatch (masterlist.py:115 and siblings). Row remains `TEST001` in DB (see
  TEST001 rename item below); lowercase lookups work regardless.
- Resolved (5e5a39e): residual unscoped leaks — `GET /appointments?student_id=<anyone>`
  (appointment.py:465), `GET /appointments/<id>` (appointment.py:574), `GET /logbook`
  (logbook.py:473), `GET /logbook/<log_id>` (logbook.py:699) now enforce admin-or-self
  via `ensure_student_access()`. A student token can no longer read other students'
  appointment/log data.
- Known open (security follow-up, test-only, not blocking — flagged by review):
  add pytest coverage for the 3 untested exam-keyed GETs (`physical-examination`,
  `lab-results`, `diagnosis` in student_record.py) not yet covered in
  `tests/test_idor_authorization.py`, plus a case/fallback regression pin.
- Known open S-2: intermittent 401 right after student login — refresh-token race,
  self-heals; not reproduced in later runs.
- Known open S-3: `/admin/about` — dead desktop button (Sidebar.jsx:121), mobile 404;
  `/admin/pending` has no nav link.
- Known open N-2: `202500901` has no `app_accounts` row (6 rows: 1 admin + 5 students)
  — currently works via email-local-part fallback in `resolve_student_id`
  (auth_guard.py:200-205), which is slated for removal; reconcile before removal.
- Open (Pass 2): the four components deferred in spec §4.1.1 — `Button`, `Badge`,
  `Field`, `EmptyState` — still at 0 call sites; needs screenshot review + user approval.
- Open (spec/implementation gap): `AdminsPanel.jsx:294` still carries the serif h1 that
  spec §4.2 lists for conversion — left unconverted this slice.
- Open: `TEST001` student_id rename pending — decision on current appointment-count
  query first; the row stays `TEST001` for now (case fix means lowercase lookups work).
- Deferred: security/hardening (incl. `.env` tracked and SUPABASE_SERVICE_ROLE_KEY
  rotation — in git history), Vercel deployment (needs user's Vercel auth + manual
  signoff), color migration to `brand`/`ink`/`signal` (`Button`/`Badge`/`Field`/
  `EmptyState` deferred per spec §4.1.1), merge to main.
- Vercel project not created/linked yet; needs user account access. Required env vars
  (dashboard): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  FRONTEND_ORIGINS=https://<project>.vercel.app, and build-time
  VITE_API_URL=https://<project>.vercel.app, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- vercel.json sets "framework": null so Vercel does not auto-select Flask and
  bypass api/index.py.
- Stale test: tests/test_admin_auth.py:18 expects 404, endpoint returns 200 by design —
  1 pre-existing failure at baseline, unrelated to the fixes (full suite:
  63 passed / 1 failed).
- Tooling note: run pytest as `python -m pytest` directly — the `rtk` shell wrapper
  breaks test collection ("No tests collected").
- Status note: backend running PID 15444 on :5000 (verified 2026-10-06).
- Out of scope per user: AI agent (groq missing, relative-date bug).
