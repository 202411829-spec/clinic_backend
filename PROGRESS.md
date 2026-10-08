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
| 6 | Push commits to origin | team-lead | PENDING | Those 3 deploy commits are on origin/main (checked 2026-10-06); component-conversion branch (9 commits) not pushed |
| 7 | Set Vercel env vars | user | PENDING | Dashboard step, see below |
| 8 | First Vercel deploy | user | PENDING | After push + env vars |
| 9 | Fix backend proxy env-var issue | user | DONE | Verified 2026-10-06: with HTTP_PROXY/HTTPS_PROXY/ALL_PROXY = http://127.0.0.1:9, startup logged `Cleared proxy env vars before Supabase client init` and /api/admins/me returned HTTP 200 three consecutive times with admin_id 1 |
| 10 | Proof-slice code review | team-lead | DONE | 45d6bed..364875c; Panel(3) / PageHeader(2) / ErrorBanner(1) adopted; 4 components deferred |
| 11 | Record deferral in spec | software-engineer | DONE | spec §4.1.1 (status + why) and §6.1 (verification record) |
| 12 | Visual-diff verification (spec §6 criterion 3) | software-engineer | DONE | DOM/bounding-box + pixel diff at 30613ec: Masterlist PASS (empty; +2 = PageHeader wrappers, 6px = noise floor); Dashboard PASS under the corrected criterion (header 66→46px, 188 elements uniformly dy=−20, dx=dw=dh=0 = reflow not drift). Results in spec §6.2 |
| 13 | Fix PageHeader white-screen | software-engineer | DONE | 30613ec - ReferenceError "icon is not defined" (primitives.jsx:82, introduced by 76e4f6f); build / HTTP 200 / auth smoke / class-string diff all blind to it — only rendering caught it |

## Blockers / Decisions
- Decision: `Button`/`Badge`/`Field`/`EmptyState` adoption deferred to Pass 2 — spec §2 (zero
  visual change) and §4.1 (adopt all 7) conflict for these four given the existing markup's
  inconsistency; documented in spec §4.1.1.
- Resolved: backend proxy env-var issue — verified 2026-10-06 with
  HTTP_PROXY/HTTPS_PROXY/ALL_PROXY = http://127.0.0.1:9: startup logged `Cleared proxy
  env vars before Supabase client init`, /api/admins/me 200 ×3 (admin_id 1). Note: the
  fix lives in the working tree (supabase_client.py), not yet committed.
- Open (Pass 2): the four components deferred in spec §4.1.1 — `Button`, `Badge`,
  `Field`, `EmptyState` — still at 0 call sites; needs screenshot review + user approval.
- Open (spec/implementation gap): `AdminsPanel.jsx:294` still carries the serif h1 that
  spec §4.2 lists for conversion — left unconverted this slice.
- Open: `TEST001` student_id rename pending current-count query.
- Deferred: security/hardening (incl. SUPABASE_SERVICE_ROLE_KEY rotation — in git history),
  Vercel deployment (needs user's Vercel auth + manual signoff), color migration to
  `brand`/`ink`/`signal`.
- Vercel project not created/linked yet; needs user account access. Required env vars
  (dashboard): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  FRONTEND_ORIGINS=https://<project>.vercel.app, and build-time
  VITE_API_URL=https://<project>.vercel.app, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- vercel.json sets "framework": null so Vercel does not auto-select Flask and
  bypass api/index.py.
- Stale test: tests/test_admin_auth.py expects 404, endpoint returns 200 by design.
- Out of scope per user: AI agent (groq missing, relative-date bug).
