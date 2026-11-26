---
name: clinic-stack-conventions
description: Use when working in the clinic_backend repository and you need verified stack, command, file-layout, or workflow conventions before implementing or verifying changes.
---

# Clinic Stack Conventions

## Verified stack

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3, PWA (`vite-plugin-pwa`). Entry/scripts in `package.json`.
- **Backend:** Python / Flask 3. Routes live under `routers/`; app entry is `main.py`; shared Supabase client is `supabase_client.py`.
- **Database:** Supabase (Postgres + Auth). Core DDL/migrations live in `migrations/`; `docs/legacy/supabase_migrations.sql` exists as historical/reference SQL. Do not assume a `schema.sql`.
- **Runtime/config:** `.env.example` documents frontend `VITE_*`, backend Supabase service-role key, SMTP/Resend, Groq/LLM, and server/CORS settings. Never read or expose real secrets.

## Verified commands

Run from `C:\Users\LENOVO\Desktop\clinic_backend` unless a task requires another directory.

- Frontend dev: `npm run dev`
- Frontend build/check: `npm run build`
- Frontend preview: `npm run preview`
- Lint script exists (`npm run lint`) but `eslint` is not currently listed in `package.json`; verify before relying on it.
- Python syntax check: `python -m py_compile <file>`
- Tests: `python -m pytest tests -q` (scope to `tests/`; no `pytest.ini` detected).

## Working rules

- Prefer targeted checks for touched behavior; do not claim pass without observed output.
- Preserve existing API contracts unless explicitly requested.
- Keep changes minimal and follow surrounding conventions; flag unrelated mess instead of expanding scope.
- Do not modify `.env`, credential/token files, or uncommitted user work without explicit approval.
- For servers/dev servers: never run as a blocking command; start detached, verify by request, report PID/port, stop by killing listener.

## Where to look first

- Project rules: `.agents/AGENTS.md`
- AI/project context: `.ai/README.md`, `.ai/project-context/OPENCODE_TEAM_AUDIT.md`
- Active worklog: `.ai/progress/PROGRESS.md` (do not overwrite existing notes)
- Frontend: `src/`, `index.html`, `vite.config.js`, `tailwind.config.js`
- Backend: `main.py`, `routers/`, `supabase_client.py`, `requirements.txt`
- DB/migrations: `migrations/`, `docs/legacy/supabase_migrations.sql`
