# Gordon College Clinic Appointment System

Full-stack clinic appointment system: a React PWA frontend (`src/`) and a Flask
REST API backend (`main.py`, `routers/`), both talking to Supabase.

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS, packaged as a PWA (`vite-plugin-pwa`)
- **Backend:** Python / Flask + `flask-cors`
- **Database/Auth:** Supabase (Postgres + Supabase Auth)

## Running the backend (Flask)

```bash
python -m venv venv
venv\Scripts\activate          # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env           # fill in Supabase URL + service_role key, etc.
python main.py
```

Backend env vars (read via `python-dotenv` from `.env`, see `.env.example`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — use the service_role secret,
  not the anon key (RLS blocks most anon access)
- `FRONTEND_ORIGINS` — comma-separated CORS allowlist (default `http://localhost:5173`)
- `HOST`, `PORT`, `DEBUG` — server settings

Health check: `GET /health`.

## Running the frontend (React PWA)

```bash
npm install
npm run dev
```

Frontend env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_API_URL`) live in the same `.env` file. Dev server opens at
http://localhost:5173.

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
routers/                 # REST blueprints (student, appointment, dashboard,
                         #   clinic_schedule, logbook, notifications, feedback,
                         #   masterlist, student_record, reports) + auth_guard.py
database.py              # Supabase client setup for the backend
supabase_migrations.sql  # additive migrations (core schema lives in Supabase)
supabase_client.py       # shared Supabase helpers
src/                     # React PWA
  components/            # layout/, admin/, student/, shared UI
  pages/                 # auth/, admin/, student/ screens
  context/AuthContext.jsx
  lib/                   # supabaseClient.js, api.js, adapters
public/                  # static assets + PWA icons
```

## Database note
The core schema lives in Supabase itself; `supabase_migrations.sql` holds
additive migrations applied on top of it.
