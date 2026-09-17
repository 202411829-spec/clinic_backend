# Project Progress
Updated: 2026-09-16 17:52

## Current Goal
1-week scalable refactor: DB indexes, Reports fast-path, Redis + HTTP cache + gunicorn, client-side cache. All code DONE locally — awaiting manual SQL migration run, then after-indexes QA + push.

## Steps
| # | Step | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 0 | git pull + resolve merge conflicts (teammate redesign) | team-lead | DONE | 81268e5 |
| 1 | PR #1: DB indexes + Years distinct | backend-developer | DONE | 94e6fa1 |
| 2 | PR #2: Reports fast-path + mv_daily_reports | backend-developer | DONE | 0f6471e |
| 3 | PR #3: Redis + HTTP cache + gunicorn/Docker | backend-developer | DONE | f8a4d32 |
| 4 | PR #4: client TTL cache + abort + skeletons + dashboard dedupe | general | DONE | 52a2088, 4ba5cd4; build PASS |
| 5 | Backend restart (PR #2/3 live) | team-lead | DONE | PID 24712 → 12924 |
| 6 | QA baseline (before-indexes) | qa-tester | DONE | 7 PASS / 1 FAIL (clinic-settings header) → fixed |
| 7 | Fix clinic-settings Cache-Control prefix | team-lead | DONE | 3566eae (main.py: "/api/clinic-settings" → "/clinic-settings") |
| 8 | Run SQL migrations in Supabase SQL Editor | USER | PENDING | REQUIRED: docs/superpowers/migrations/2026-09-01-perf-indexes.sql + 2026-09-01-reports-fast-path.sql |
| 9 | QA after-indexes verification (p95 < 100ms target) | qa-tester | PENDING | after step 8 |
| 10 | Push to origin main | team-lead | PENDING | after QA green; coordinate with parallel session |

## Baseline timings (before-indexes, fresh token, 17:40)
- /api/masterlist/students?page=1&page_size=15 → 200, **1300 ms**
- /api/masterlist/years → 200, **818 ms**
- /api/reports/?date=2026-09-16 → 200, **485 ms**, Cache-Control present
- /api/reports/?date=2026-01-01 → 200 (no 500 from new RPC guard)
- No 401s. Health 200.

## Blockers / Decisions
- SQL migrations MUST be run by user in Supabase SQL Editor (no dashboard/psql access here). RPC already deployed → fast-fail safe.
- Redis: not installed locally → in-memory fallback active (log line confirms). Optional: pip install redis + REDIS_URL.
- Model outage: opencode/muse-spark-1.2-contributor-free DOWN (encrypted_content provider error). Config switched: frontend-developer + qa-tester → mimo-v2.5-free, team-lead → big-pickle. Restart opencode to apply.
- Local commits (NOT pushed): 81268e5, 94e6fa1, 0f6471e, f8a4d32, 52a2088, 4ba5cd4, 3566eae.