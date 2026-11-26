# Project Tech Stack Rules

- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3 (PWA)
- **Backend**: Python / Flask 3 (`main.py`, `routers/`)
- **Database**: Supabase (Postgres + Auth)

## Verified workflow

- Frontend check: `npm run build`
- Python syntax check: `python -m py_compile <file>`
- Tests: `python -m pytest tests -q` (no `pytest.ini`; scope to `tests/`)
- Core DDL lives in `migrations/`; there is no `schema.sql` in this checkout.
- `npm run lint` is declared but `eslint` is not listed in `package.json`.

## Agent workflow

- Team: `team-lead` (primary), `backend-developer`, `frontend-developer`.
- Implementation owner performs minimum meaningful verification (single most useful, smallest check) before completion; no automatic independent review handoff.
- Multi-session: sessions may share the same working directory; treat assigned task as independent workstream, inspect shared files before editing, do not overwrite/revert/remove another session's work, pause and coordinate on conflicting file/area, no auto branches/worktrees/extra agents unless requested.
- Never modify `.env`, credential files, or uncommitted user work without explicit approval.
