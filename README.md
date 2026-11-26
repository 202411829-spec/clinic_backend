# Gordon College Clinic Appointment System

Full-stack clinic appointment system: a React PWA frontend (`src/`) and a Flask
REST API backend (`main.py`, `routers/`), both talking to Supabase.

## Stack
- **Frontend:** React 18.3.1 + Vite 5.3.4 + Tailwind CSS 3.4.7, packaged as a PWA (`vite-plugin-pwa` 0.20.1) — dev server on port 5173 (`vite.config.js:server.port`)
- **Backend:** Python / Flask 3.1.3 + `flask-cors` 6.0.5 + `supabase` 2.7.4 + `resend` 2.5.1 + `groq` >=0.11 + `python-dotenv` 1.0.1
- **Database/Auth:** Supabase (Postgres + Supabase Auth) — client lib `@supabase/supabase-js` 2.45
- **Client libs:** `react-router-dom` 6.26, `jspdf` 4.2, `html2canvas` 1.4

Docs: `docs/OVERVIEW.md` (plain-language overview). AI/project notes are indexed in `.ai/README.md`; feature design specs are in `.ai/superpowers/specs/`. Active schema DDL lives in `migrations/`.

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
main.py                   # Flask app: CORS, blueprint registration, /health
api/                      # Vercel serverless adapter (api/index.py) + function requirements
routers/                  # Flask REST blueprints, auth guard, and route helpers
database.py               # Supabase client re-export used by backend routes
supabase_client.py        # Creates the Supabase client from environment variables
cache.py                  # Optional Redis/in-memory cache used by reports
migrations/               # Active SQL schema, seed, and report migration files
docs/                     # Human docs, archived notes, and legacy references
  legacy/                 # Legacy SQL kept for reference, including supabase_migrations.sql
scripts/                  # Small maintenance/ops scripts
shared/                   # JSON/data shared by Python and JavaScript
src/                      # React PWA source (components, pages, routes, libs, styles)
public/                   # Static assets and PWA icons served by Vite
tests/                    # Python tests and tests/frontend Node tests
.agents/                  # Project-level agent instructions
.ai/                      # Repository-specific AI notes, audits, progress, and plans
.claude/                  # Claude-specific local configuration
.opencode/                # OpenCode project config and skills
.vscode/                  # Editor-only Explorer view settings
Dockerfile                # Builds/runs the Flask backend with gunicorn
package.json              # Frontend scripts and dependencies
package-lock.json         # Locked frontend dependency versions
requirements.txt          # Python dependencies for local/Docker backend
README.md                 # This beginner-friendly project guide
.ai/progress/PROGRESS.md  # Shared worklog and current status
index.html                # Vite entry HTML
vite.config.js            # Vite + vite-plugin-pwa config
tailwind.config.js        # Tailwind content paths
postcss.config.js         # PostCSS plugin config
vercel.json               # Vercel build, function, and rewrite settings
.env.example              # Template for environment variables
.gitignore                # Files Git should ignore
.vercelignore             # Files Vercel should not upload
```

## Database note
Core DDL lives in `migrations/`: `2026-08-28_clean_rebuild_ddl.sql` plus the two 2026-08-29 follow-ups. `2026-08-28_clean_seed.sql` is seed data and is applied separately. `docs/legacy/supabase_migrations.sql` is legacy (feedback table only). There is no `schema.sql` bundle in this checkout.

## Testing

```bash
python -m pytest tests -q
```

- Scope collection to `tests/`: this repository has no pytest config, so run tests from the project root. One-off Git Desktop notes were moved to `docs/archive/`.
- Current test modules: `tests/test_admin_auth.py`, `tests/test_admin_mgmt.py`, `tests/test_agent.py`, `tests/test_auth_email_delivery.py`. The last one imports `main`, so run from the project root.
- There is no `pytest.ini`, no coverage config, and no npm `test` script. `npm run build` is the frontend check; `npm run lint` is declared but `eslint` is not installed via `package.json`.

## Schema rebuild

Apply the migrations in order; there is no `schema.sql` bundle in this checkout:

```bash
psql < migrations/2026-08-28_clean_rebuild_ddl.sql
psql < migrations/2026-08-29_perf_current_status.sql
psql < migrations/2026-08-29_report_aggregate_functions.sql

# Seed data (optional, after schema is applied):
psql < migrations/2026-08-28_clean_seed.sql
```

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
