# OpenCode Team Audit — clinic_backend (Current)

**Status:** Current working audit (replaces stale 7-agent audit).  
**Date:** 2026-11-24  
**Scope:** Read-only audit basis, with later approved workflow/doc updates reflected here. No secrets reproduced.

## 1) Current team architecture

- **Architecture:** 3 active implementation agents. `team-lead` is primary/default implementer.
- **Subagents:** `backend-developer`, `frontend-developer`. `verification-engineer.md` exists only for explicit manual user-requested independent review; not in default orchestration/config.
- **Global config:** `C:\Users\LENOVO\.config\opencode\opencode.jsonc`
- **Agent prompts:** `C:\Users\LENOVO\.config\opencode\agent\*.md`
- **Plugins:** `superpowers@git+https://github.com/obra/superpowers.git` (unpinned), `opencode-model-fallback`, `opencode-multimodal`; local `plugins/rtk.ts`.
- **Project-local MCP config:** `.opencode/opencode.jsonc` contains Context7 (remote, disabled by default, no auth header) and Playwright (local, **disabled by default**, enabled only for explicit local/dev browser or UI testing). Playwright keeps `--caps=testing --no-webmcp --isolated` and must never use production accounts or real user data.

## 2) Project baseline

- **Stack:** React 18 + Vite 5 + Tailwind 3 PWA frontend; Python/Flask 3 backend (`main.py`, `routers/`); Supabase Postgres/Auth.
- **Verified commands:** `npm run build`; `python -m py_compile <file>`; `python -m pytest tests -q`. `npm run lint` script exists but `eslint` is not declared in `package.json`.
- **Key project rules:** `.agents/AGENTS.md`; do not modify `.env`/credentials/uncommitted user work without explicit approval.
- **Progress/worklog:** `.ai/progress/PROGRESS.md` (append-only notes; do not overwrite existing entries).

## 3) A1-A5 approved changes

| ID | Change | Status |
|---|---|---|
| A1 | `.opencode/skills/clinic-stack-conventions/SKILL.md` | Implemented |
| A2 | `.opencode/skills/security-review-checklist/SKILL.md` | Implemented |
| A3 | Project-local Context7 MCP in `.opencode/opencode.jsonc`, disabled by default, no auth header | Implemented |
| A4 | Concise MCP guardrails added to active global agent prompt files (team-lead, backend, frontend) | Implemented |
| A5 | Refreshed `.ai` audit/index docs | Implemented |

## 4) Later approved workflow updates

- **Concise communication:** project-local `concise-communication` skill added; Team Lead communication guidance updated for concise, plain-language reporting.
- **Intuitive teaching:** Team Lead communication guidance includes teaching unfamiliar concepts/decisions when helpful, with simple explanations, short analogies/examples when useful, and clear trade-offs.
- **Playwright MCP:** configured project-locally in `.opencode/opencode.jsonc`; default is disabled (opt-in). When explicitly needed for local/dev browser or UI testing, enable/use it with existing safety flags and never use production accounts or real user data.
- **ACCURATE SPEED / minimum sufficient verification:** default workflow is `Understand → Implement → Minimum meaningful verification → Complete`. Implementation owner identifies the single most useful, smallest check that provides reasonable confidence; prefers quick/focused checks, existing targeted tests when fastest reliable, and smallest risk-covering check for migrations/schema/auth/authorization/data integrity. No automatic full suite/browser QA/independent review/overlapping checks; expensive/unavailable/live-env checks reported as unverified. No automatic `verification-before-completion` or `test-driven-development` activation. VE prompt retained for explicit manual review only.

## 5) Guardrails

- MCPs are project-scoped and disabled by default; enable only when clearly needed and authorized.
- Context7 is for current library/framework/API docs only; no secrets/private data in queries.
- Playwright is for explicit local/dev or authorized UI/browser testing only; keep capability/safety restrictions.
- Preserve security, authorization, validation, and data-integrity checks when relevant. No independent review phase in default workflow.
- No Phase B/C items implemented beyond approved Playwright MCP configuration: no Chrome DevTools MCP, Supabase MCP, Humanizer, Headroom, or external skill installs.

## 6) Known risks / follow-ups (not approved)

- Superpowers plugin is unpinned (supply-chain/update drift risk) — evaluate separately.
- Model-fallback plugin/config warning and source-of-truth need investigation.
- Credential/token files and `.env` handling need careful hygiene; do not expose or modify without approval.
- Consider Chrome DevTools only for performance/debug diagnosis; Supabase MCP only with L3 gates.
