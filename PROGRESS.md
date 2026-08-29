# Project Progress
Updated: 2026-08-29

## Current Goal
Code audit + cleanliness cleanup (backend + frontend) — both committed, pending push.

## Code audit + cleanup (DONE, committed)
- Audit (2 agents): backend + frontend — healthy (builds clean, no broken code), main issue = copy-paste duplication + dead code.
- **Backend** (`1f1318e`): print→logging (new `routers/logging_setup.py`), removed dead code (dashboard date fns, `_is_tomorrow_date`, unused import), `_write_status` helper (3 status-write sites), `handle_errors` decorator + `error_response` (consolidated ~23 inline error blocks), shared `_SEARCH_SCAN_CAP`, `DEFAULT_SLOT_INTERVAL`/`DEFAULT_MAX_STUDENTS` constants, dept/course split helper, `_is_admin_user`→`is_admin_user`, module loggers added to all routers. QA: all items PASS (1 minor note about modules loggers — fixed). py_compile + import clean, no circular import.
- **Frontend** (`be7e685`): extracted `WalkInVisitForm`+`useWalkInForm`, `Letterhead`, `Pagination`+`useDebouncedValue`, `pdfLetterhead` (lib/pdf.js), `format.js`/`referenceData.js`; centralized `toYMD`/`formatMDY`/`formatDisplayName`/`computeBmi`/year maps; removed dead exports incl. 7,000-row `masterlistStudents`, deleted `ComingSoon`/orphaned `Sidebar`/dead icons; nit fixes (ternary, CSS dup, SessionLoader, `NavIcon dots`). QA: build PASS 0 errors; fixed walk-in error-clear regression (round 2) + orphaned `DotsIcon` + `&#8942;` standardization.
- Net result: ~1,800 lines removed across both subsystems. Cleanups are behavior-preserving; risky refactors (split StudentRecordPanel, collapse Appointments panels, unify sidebars/logins) deferred.

## Overview doc (done)
- `docs/OVERVIEW.md` (`c9ad457`): non-technical, high-level overview (what it does, who uses it, student & admin experience, core concepts, visit flow, how it's built, security). Pushed, in sync.

## Sprint 4 (student first-login gate + logbook print design): DONE ✅
- First-login hard gate (`95fe5bb`): derived completeness (no schema change); incomplete students forced to /student/record; dashboard/book/feedback blocked; gate lifts on save. QA PASS, 0 required corrections.
- Logbook print/PDF unified with Reports design (`3f46fed`).
- Both pushed to origin/main (`95fe5bb`), in sync.
- Optional hardening noted (not applied): reject all-empty emergency-contact rows in hasEmergencyContact (profileCompleteness.js).

## Performance sprints (earlier, all DONE & pushed)
- Sprint 1 (P0): current_status denormalization + 10 indexes + kill whole-table fetches — live.
- Sprint 2 (P1): reports SQL aggregation (RPC, live), logbook search consolidation, appointment scoping — live.
- Sprint 3 (P1): build_student_lookup scoped per-page — pushed.
- Remaining P2 (not started): batch medicine inserts, multi-worker Redis cache, PgBouncer, RLS.

## Auth decision (deferred by user)
- User wanted Google login broadly; then redirected focus to first-login gate. Google/OAuth integration deferred for now. Audit of current auth flow done (supabase-js signInWithPassword; auth_guard.py get_user; app_accounts link; no sign-up; manual test accounts).


## Audit baseline (2026-08-29)
- P0: logbook.py:167 whole-table fetch; no indexes on appointments/status_history; status resolved by Python history full-scan (helpers.py:365).
- P1 (next sprint): SQL-side aggregation in reports; stop 7k-row student lookup per request; bound logbook search; default get_appointments/get_time_slots paged.
- P2: batch med inserts; cache dept/course; DISTINCT year_level; multi-worker caching/PgBouncer/RLS.
