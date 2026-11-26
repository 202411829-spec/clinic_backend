# AI / project-context index

This directory holds repository-specific notes and audits that help agents understand this project. It is **not** a native OpenCode or Claude configuration directory; nothing here is auto-discovered by tooling. Native configuration remains in its required locations.

## Structure

- `project-context/` â€” current audits and project context.
- `progress/PROGRESS.md` â€” chronological project worklog.
- `superpowers/plans/` â€” implementation plans.
- `superpowers/specs/` â€” design specs.
- `superpowers/migrations/` â€” historical migration notes.

## Native instruction/config locations

- `.agents/AGENTS.md` â€” project tech-stack and workflow rules for agents.
- `.claude/settings.local.json` â€” Claude Code local settings.
- `progress/PROGRESS.md` â€” active worklog; centralized under `.ai/`.
- `.opencode/opencode.jsonc` â€” project-local OpenCode config (MCPs project-scoped and disabled by default; Context7 disabled; Playwright configured locally but disabled by default, opt-in for explicit local/dev browser or UI testing only).
- `.opencode/skills/` â€” project-local OpenCode skills (`clinic-stack-conventions`, `concise-communication`, `security-review-checklist`).

## Project knowledge

- `project-context/OPENCODE_TEAM_AUDIT.md` â€” current team team audit, A1-A5 status, and later approved workflow updates.
- `../docs/OVERVIEW.md` â€” project overview.
- `../docs/archive/` â€” archived one-off artifacts.
- `superpowers/plans/` â€” implementation plans.
- `superpowers/specs/` â€” design specs.
- `superpowers/migrations/` â€” historical migration notes.

## Removed external harness

- The former `../deepseek-harness/` directory is no longer part of this workspace. See `progress/PROGRESS.md` for the cleanup record; do not treat it as a current project directory.

## Conventions

- Do not put secrets, `.env` values, credentials, source code, tests, migrations, or Supabase configuration in this directory.
- Do not rely on `.ai/` for tool discovery; the native files listed above are authoritative.
- MCPs added for this project must be project-scoped and disabled by default unless explicitly approved otherwise.
- Playwright browser MCP is configured locally but opt-in: enable/use only for explicit local/dev or explicitly authorized UI/browser testing; never use production accounts or real user data.

