# Project Progress
Updated: 2026-09-17 09:55

## Current Goal
1-week scalable refactor — SHIPPED. Pushed to origin/main as 3d08404 (squashed).

## Steps
| # | Step | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 0 | git pull + resolve merge conflicts | team-lead | DONE | 81268e5 → e89b8cc (rewritten) |
| 1 | PR #1: DB indexes + Years distinct | backend-developer | DONE | 94e6fa1; SQL run by user in Supabase (Success) |
| 2 | PR #2: Reports fast-path + mv_daily_reports + pg_cron job 1 | backend-developer | DONE | 0f6471e; SQL run by user (Schedule:1) |
| 3 | PR #3: Redis + HTTP cache + gunicorn/Docker | backend-developer | DONE | f8a4d32; in-memory fallback active (no redis pkg) |
| 4 | PR #4: client TTL cache + abort + skeletons + dedupe | general | DONE | 52a2088, 4ba5cd4; build PASS |
| 5 | Fix clinic-settings Cache-Control prefix | team-lead | DONE | 3566eae; verified live |
| 6 | Auth 401 regression after restart → clean restart fixed | team-lead | DONE | PID 10664; smoke PASS (login + 3 endpoints 200) |
| 7 | QA AFTER verification | general | DONE | 7/7 PASS; zero error bodies |
| 8 | Rebase/merge with teammate redesign (73792b8, ac4f54e) | software-engineer | DONE | merge 7e3e683; perf logic verified 5/5 |
| 9 | GitHub push-protection block (Groq key in tracked .env) | team-lead | DONE | rewrote branch: .env reverted to origin version, squash 3d08404, local .env restored |
| 10 | Push to origin/main | team-lead | DONE | ac4f54e..3d08404 |

## Final QA numbers (AFTER vs BASELINE)
| Endpoint | Baseline | After (warm) | Cache 2nd call |
|---|---|---|---|
| masterlist/students p1/15 | 1300 ms | 301-305 ms | n/a (intentional) |
| masterlist/years | 818 ms | 314-320 ms | n/a |
| reports today | 485 ms | 355 ms | 239 ms |
| reports historical | — | 308-433 ms | 151-186 ms |
- Cache-Control on reports/years/clinic-settings: public, max-age=60, stale-while-revalidate=300 ✓
- report_breakdown RPC validated against live data (31 appointments grouped correctly)
- Per-request auth floor ~150-250ms (require_auth → supabase get_user) — future optimization: local JWT verify

## Blockers / Decisions / Open items
- OPEN: GitHub push protection enabled on repo — ANY commit touching tracked .env with a known secret will be blocked. Options: (a) untrack .env + .gitignore (needs user consent — earlier user said keep .gitignore intentional), (b) rotate the Groq key (it was pasted in chat + pushed earlier in e89b8cc-original... it never reached origin), (c) only commit .env WITHOUT secrets.
- OPEN: recommend rotating GROQ_API_KEY (exposed in chat transcript) and SUPABASE_SERVICE_ROLE_KEY (in repo-history .env, user's intentional tracking).
- Redis: activate via pip install redis + REDIS_URL in .env for shared cross-worker cache.
- Backend currently running: PID 10664 (clean env restart at 09:31; auth verified).
- Parallel session pushes frequently → prefer git merge over rebase when integrating origin/main.