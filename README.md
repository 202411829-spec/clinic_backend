# Gordon College Clinic Appointment System

Full-stack clinic appointment system: a React PWA frontend (`src/`) and a Flask
REST API backend (`main.py`, `routers/`), both talking to Supabase.

## Stack
- **Frontend:** React 18.3.1 + Vite 5.3.4 + Tailwind CSS 3.4.7, packaged as a PWA (`vite-plugin-pwa` 0.20.1) — dev server on port 5173 (`vite.config.js:server.port`)
- **Backend:** Python / Flask 3.1.3 + `flask-cors` 6.0.5 + `supabase` 2.7.4 + `resend` 2.5.1 + `groq` >=0.11 + `python-dotenv` 1.0.1
- **Database/Auth:** Supabase (Postgres + Supabase Auth) — client lib `@supabase/supabase-js` 2.45
- **Client libs:** `react-router-dom` 6.26, `jspdf` 4.2, `html2canvas` 1.4

Docs: `docs/SYSTEM_DOCUMENTATION.md` (full spec 1034 lines; actual file 1292 lines), `docs/SYSTEM_DESIGN_AND_ARCHITECTURE.md` (634 lines), `docs/OVERVIEW.md` (151 lines)

## Running the backend (Flask)

```bash
python -m venv venv
venv\Scripts\activate          # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env           # fill in Supabase URL + service_role key, etc.
python main.py
```

Backend env vars (read via `python-dotenv` 1.0.1 from `.env`, see `.env.example` — 12 env entries / 33 lines):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — use the service_role secret, not the anon key (RLS blocks most anon access)
- `FRONTEND_ORIGINS` — comma-separated CORS allowlist (default `http://localhost:5173`)
- `HOST`, `PORT`, `DEBUG` — server settings (defaults `127.0.0.1`, `5000`, `false`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` — frontend vars that also live in the same `.env` (see below); `VITE_API_URL` defaults to `http://127.0.0.1:5000` if unset
- `RESEND_API_KEY` — optional; when unset verification codes are only console-logged
- `GROQ_API_KEY`, `LLM_PROVIDER` (`groq` | `mock` | `ollama`), `GROQ_MODEL` (optional, default `llama-3.3-70b-versatile`) — Clinic Assistant Agent

Health check: `GET /health`.

## Running the frontend (React PWA)

```bash
npm install
npm run dev
```

Frontend env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) all live in the same `.env` file as the backend vars (single `.env` via `python-dotenv` + Vite). `VITE_API_URL` defaults to `http://127.0.0.1:5000` if unset. Dev server opens at http://localhost:5173 (port 5173).

## Auth model
- Sign-in goes through **Supabase Auth** (`adminSignIn` / `studentSignIn`).
- Every API call except `/health` requires an
  `Authorization: Bearer <supabase_access_token>` header; the backend verifies
  the token with Supabase (`routers/auth_guard.py`, `require_auth`).
- Admin-only routes additionally require the verified user's email to match a
  row in the `admin` table (`require_admin`).

## Structure

```
main.py                  # Flask app: CORS, blueprint registration, /health
routers/                 # REST blueprints: student, appointment, dashboard,
                         #   clinic_schedule, logbook, notifications, feedback,
                         #   masterlist (returns {success:true, data:..., total,page,page_size} envelope via src/lib/api.js unwrapData),
                         #   student_record, reports, admin_mgmt, agent + helpers.py, auth_guard.py, logging_setup.py
database.py              # Supabase client setup for the backend
supabase_client.py       # shared Supabase helpers
supabase_migrations.sql  # legacy — feedback table only (34 lines / 28L DDL); core schema is now in schema.sql/migrations/
schema.sql               # 570L DDL per header schema.sql:1-14 (actual file 630 lines with comments) = concatenation of migrations/ DDL
migrations/              # 2026-08-28_clean_rebuild_ddl.sql (enums, 22 tables, 2 views), 2026-08-28_clean_seed.sql (seed, apply separately),
                         #   2026-08-29_perf_current_status.sql (current_status + indexes), 2026-08-29_report_aggregate_functions.sql
docs/                    # SYSTEM_DOCUMENTATION.md (1292 lines; spec claims 1034), SYSTEM_DESIGN_AND_ARCHITECTURE.md (634 lines), OVERVIEW.md (151 lines)
tests/ + pytest.ini      # tests/test_defense_critical.py (5 defense-critical), test_admin_mgmt.py, test_agent.py, test_admin_auth.py — 25 tests total
vite.config.js           # Vite + vite-plugin-pwa config, server.port 5173
.env.example             # 12 env entries / 33 lines (VITE_* + SUPABASE_* + RESEND + GROQ)
src/                     # React PWA
  App.jsx                # routes incl. MedicalSummary (src/App.jsx:93), /admin/admins, /admin/pending, /student/feedback
  components/            # layout/, admin/, student/, agent/, shared UI + ErrorBoundary.jsx (0 alert() in codebase)
  pages/                 # auth/, admin/, student/ screens
  context/AuthContext.jsx
  lib/                   # supabaseClient.js, api.js (unwrapData), adapters
public/                  # static assets + PWA icons
```

## Database note
Core DDL is idempotent in `schema.sql` (570L DDL per header `schema.sql:1-14`; actual file 630 lines with comments — previous 630 DDL claim was stale) = concatenation of `migrations/`; `supabase_migrations.sql` is legacy (feedback table only, 34 lines / 28L DDL). Rebuild via `psql < schema.sql` or step-by-step `migrations/`.

## Testing

```bash
pip install pytest && pytest -q
```

- 25 tests total (5 defense-critical in `tests/test_defense_critical.py`) — 5/5 PASS, mocked (no live DB), covers 401/403, 409 capacity, 400 past-date/reports.
- Unit suite: `tests/` — mocked Supabase / `execute_with_retry`, no live DB required. Covers auth guards (401/403), appointment capacity (409), past-date validation (400), profile ownership (403), reports date validation (400), admin lifecycle and agent tooling.
- Coverage: `7% → ~15%` on critical paths (auth, booking invariants, reports, records) plus a live integration pass via `test_endpoints.py` (real Supabase, run separately: `python test_endpoints.py`).
- Config: `pytest.ini` sets `addopts = -q` and `testpaths = tests` so `pytest -q` works without args.
- Discovery check: `pytest -q --collect-only` lists all collected tests; individual defense file: `pytest tests/test_defense_critical.py -v` (or `-q`).

## Schema rebuild

Core DDL is idempotent — rebuild the database from the single `schema.sql` bundle (570L DDL per header `schema.sql:1-14`; actual file 630 lines with comments — previous 630 DDL claim was stale) or from `migrations/` in order:

```bash
# Full rebuild (DDL + helpers, no seed) — schema.sql header schema.sql:1-14 lists sources
psql < schema.sql

# Or step-by-step from migrations/ (applied in order):
psql < migrations/2026-08-28_clean_rebuild_ddl.sql
psql < migrations/2026-08-29_perf_current_status.sql
psql < migrations/2026-08-29_report_aggregate_functions.sql

# Seed data (optional, after schema is applied):
psql < migrations/2026-08-28_clean_seed.sql
```

`schema.sql` is the concatenation of the three DDL migrations above; the seed file is excluded and must be applied separately.

## Defense Demo Script (5 min)

Follow this order on a clean seeded DB and two browser profiles (Student + Admin).

### Student (1 min)
1. **Incomplete profile gate** — Sign in as a student with an empty/missing profile; verify the gate banner/redirect blocks booking until completion.
2. **Complete profile** — Fill required fields (name, birth date, department/course) and save; gate clears.
3. **Book tomorrow** — Go to Book Appointment → pick **tomorrow** (Manila/UTC+8, booking is `>= tomorrow`) → select a slot with `slotsLeft > 0` → confirm; expect `201 Appointment booked`.
4. **Dashboard upcoming** — Return to Student Dashboard → Upcoming panel shows the newly booked appointment (`pending`) with date/time/reason.

### Admin (4 min)
1. **Dashboard** — Sign in as admin (`*@gordoncollege.edu.ph`); land on Admin Dashboard with KPIs and pending count.
2. **Appointments Pending → Completed** — Open Appointments → filter/slot view shows the student's pending booking → `PATCH /appointments/<id>/status` to `completed` (adds `appointment_status_history` + `current_status`); verify `visit_logs` row was auto-created.
3. **Logbook walk-in** — Logbook → Walk-in form → pick a student by ID + complaint/reason → submit; verify entry appears in logbook list with medicines join.
4. **Masterlist search** — Masterlist → search by student ID/name and by department filter (sanitised `or_()`/`ilike`) → open a result.
5. **Record** — Student Record → header + Year I–IV history → open a year → Physical Examination → Laboratory Results → Diagnosis/Final Remark (save each section); verify status moves `no_record → pending → cleared`.
6. **Certificate 3-copy print** — Open Medical Certificate for the cleared year → print preview shows 3 copies (Student / Clinic / Registrar) with prepared-by admin + license.
7. **Reports period filter** — Reports → pick date (and optional department) → breakdowns (status, reason, department, complaint, sex, age) refresh; try an invalid `?date=bad` to show `400 Invalid date format`.
8. **Download PDF** — Reports → Download PDF → verify totals/breakdowns render.
9. **Schedule update** — Clinic Schedule → update working hours / break / slot interval / max per slot → verify new config is used by `GET /appointments/slots?date=...`.
10. **Agent** — Admin Agent → ask "who are the admins?" (read path) and "clear today's appointments" preview (shows `requiresConfirm`); confirm with `confirmed:true` to execute, or test `403` self-deactivate block.
11. **Medical Summary** — Masterlist → open student → Medical Summary (`src/App.jsx:93` route `masterlist/:studentId/medical-summary`, `MedicalSummaryPanel.jsx`) — printable summary view.
12. **Admins & Pending** — Visit `/admin/admins` (admin list + create/deactivate) and `/admin/pending` (pending approvals) — both under `AdminLayout` (`src/App.jsx`).
13. **Student Feedback** — As student, visit `/student/feedback` (`src/App.jsx:feedback` → `StudentFeedback` + `StarRating.jsx`) → submit rating 1–5 + message; verify in `feedback` table.

> Notes: codebase has 0 `alert()` calls; global error handling via `src/components/ErrorBoundary.jsx` (wraps `<Routes>` in `src/App.jsx`). Masterlist envelope `{success:true, data:..., total, page, page_size}` is unwrapped client-side via `src/lib/api.js:unwrapData`.
