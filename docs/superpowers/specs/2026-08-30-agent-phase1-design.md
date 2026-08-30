# Clinic Assistant Agent — Phase 1 Architectural Design Spec (Global Bubble, 5 Tools, Groq)

**Date:** 2026-08-30
**Project:** Gordon College Clinic Appointment System
**Stack:** Flask + Supabase (backend) · React 18 + Vite + Tailwind PWA (frontend) · Groq LLM
**Status:** Approved Design — Ready for Implementation
**Route Prefix:** `/api/agent` (admin-only) · UI mounted in `AdminLayout` (global)
**LLM Provider:** `LLM_PROVIDER=groq` (primary), `mock` (fallback), `ollama` (optional)

---

## 1. Overview

Phase 1 delivers a **global Clinic Assistant** embedded in every admin route. A floating bubble opens a chat panel that understands natural language, calls **5 curated tools**, and enforces a **preview → confirm** flow for all writes.

The assistant helps admins with routine operations without leaving the dashboard:

- Read: appointments, reports, admin roster.
- Write (preview-gated): cancel appointments, update clinic settings, deactivate admins.

No new tables or migrations. All tools reuse existing router logic via `execute_with_retry()` and service-role Supabase client. LLM is pluggable via env (`LLM_PROVIDER`), with Groq as primary and a deterministic mock fallback for offline/testing.

Out of scope for this spec: student Profile (`/student/profile`) renames, admin pending-flow changes, and any non-admin surfaces — those are covered by separate specs.

---

## 2. Goals / Non-Goals

### Goals

- Provide a single global entry point for admin assistance on **every** `/admin/*` route.
- Support 5 tools that cover 80% of repetitive admin tasks (Phase 1 slice).
- Enforce **no silent writes**: every write returns a preview and requires explicit `POST /confirm`.
- Keep LLM pluggable (Groq primary, mock fallback, Ollama optional) via `LLM_PROVIDER`.
- Reuse existing business logic (routers, validation, retries) — no duplicate DB logic.
- Ship with rate limiting and `require_admin` guards consistent with existing admin routers.

### Non-Goals (Deferred to Later Phases)

- No student-facing assistant; admin-only.
- No new DB tables, views, or migrations.
- No autonomous multi-step writes without human confirmation.
- No tools beyond the Phase 1 five (e.g., create reports, bulk import, email blasts, student edits).
- No voice, image, or file-upload capabilities.
- No persistent conversation history in DB (in-memory / local state only for Phase 1).
- No role-tier differentiation within admin (any active admin has same tool access).

---

## 3. Architecture

### 3.1 Frontend — Global Bubble + Panel

- **Mount point:** `src/components/agent/AgentBubble.jsx` + `src/components/agent/AgentPanel.jsx` mounted inside `src/components/layout/AdminLayout.jsx` so they render on **every** admin route.
- **Bubble:** `fixed bottom-6 right-6 z-50` circular button, `bg-gc-green-700` with hover `bg-gc-green-800`, white chat icon, shadow-lg, `aria-label="Open Clinic Assistant"`.
- **Panel:** sibling to bubble, conditionally rendered when `open=true`.
  - Desktop: `w-[380px] h-[520px] rounded-2xl shadow-2xl` anchored `bottom-20 right-6`.
  - Mobile: full-screen bottom sheet (`inset-0` or `bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl`).
- **Guard:** `isPending` check (derived from `admin_accounts.is_active` / auth context). Pending admins cannot open bubble — button hidden/disabled with tooltip "Pending approval — assistant unavailable".
- **State:** `history: Array<{role:'user'|'assistant', content, toolCalls?, preview?}>` held in context/local state; `Clear` resets history, `Close` hides panel but preserves history until clear.

### 3.2 Backend — `routers/agent.py`

- **Blueprint:** `agent_bp = Blueprint('agent', __name__, url_prefix='/api/agent')` registered in `main.py`.
- **Endpoints:**
  - `POST /api/agent/chat` — accepts `{ message, history? }`, runs LLM, may invoke tools, returns assistant reply and optional preview.
  - `POST /api/agent/confirm` — accepts `{ tool, args, confirmed: true }`, executes the write after re-validation, returns result.
- **Auth:** `require_admin` decorator on **all** `/api/agent/*` routes (active admin only; students → 403).
- **LLM abstraction:** `src/lib/llm.py` or `routers/agent.py` internal `get_llm_client()`:
  ```python
  provider = os.getenv("LLM_PROVIDER", "groq")  # groq | mock | ollama
  if provider == "groq":  client = Groq(api_key=os.getenv("GROQ_API_KEY"))
  elif provider == "ollama": client = Ollama(base_url=os.getenv("OLLAMA_URL"))
  else: client = MockLLM()  # deterministic, returns tool calls by keyword match
  ```
  Prompt template injects clinic context: current date, admin email/role, available tools, and system instruction to always use `dryRun=true` for writes and return preview before confirming.
- **Tool execution:** Each tool handler calls existing logic (same queries/validation as `routers/appointments.py`, `routers/reports.py`, `routers/admin_mgmt.py`, `routers/settings.py`) via `execute_with_retry()` and service-role client (`database.supabase`). No raw SQL duplication.
- **Rate limit:** In-memory per-admin counter `agent_rate: {admin_id: [timestamps]}` — max **20 requests / 5 min** per admin. Exceed → `429 { success:false, error:"Rate limit — try again shortly" }`.

### 3.3 Request Flow

```
[Admin types] → POST /api/agent/chat {message, history}
  → require_admin → rate-limit check
  → build prompt (clinic context + tool schemas)
  → LLM → tool_call? ──yes──→ execute_tool(dryRun=true) → preview {found, preview, requiresConfirm}
  │                                          │
  │                          return { reply, previewCard } → Panel shows "Found N — Yes/No"
  │
  └──no tool──→ return { reply } (direct answer)

[Admin clicks Yes] → POST /api/agent/confirm {tool, args, confirmed:true}
  → require_admin → re-validate args → execute_tool(dryRun=false) → { result, count }
  → return { reply: "Done — N appointments cancelled." }
```

---

## 4. Tool Definitions (Phase 1 — 5 Tools)

All tools are described to the LLM via JSON Schema. Read tools execute immediately; write tools **always** start with `dryRun=true`.

| # | Name | Type | Params | Behavior (dryRun → preview / confirm → result) |
|---|------|------|--------|------------------------------------------------|
| 1 | `list_appointments` | Read | `date?: string (YYYY-MM-DD)`, `status?: string (pending\|approved\|completed\|cancelled)` | Queries `appointments` via existing list logic; returns `{ count, appointments: [...] }`. No confirmation needed. |
| 2 | `get_reports` | Read | `date?: string`, `department_id?: string`, `period?: string (daily\|weekly\|monthly)` | Reuses `routers/reports.py` aggregation; returns `{ count, reports: [...] }`. |
| 3 | `list_admins` | Read | `search?: string` | Reuses `GET /api/admins` filtering (`sanitize_search` + pagination default 20); returns `{ count, admins: [...] }`. For "who are the admins?" queries. |
| 4 | `cancel_appointments` | Write (preview→confirm) | `date?: string`, `status?: string`, `dryRun?: boolean`, `confirm?: boolean` | **dryRun=true:** scans matching appointments, returns `{ found, preview: [first 5 rows], requiresConfirm:true }` without mutating. **confirm=true:** executes cancellation via `execute_with_retry()` and returns `{ cancelled: N, result }`. |
| 5 | `update_clinic_settings` | Write (preview→confirm) | `slot_interval?: number`, `max_students_per_slot?: number`, `default_start_time?: string (HH:MM)`, `default_end_time?: string (HH:MM)`, `dryRun?: boolean`, `confirm?: boolean` | **dryRun:** validates new values, returns `{ preview: { current, proposed }, requiresConfirm:true }`. **confirm:** writes to `clinic_settings` (single-row) and returns `{ updated, settings }`. |
| 6 | `deactivate_admin` | Write (preview→confirm) | `admin_id: string (required)`, `dryRun?: boolean`, `confirm?: boolean` | **dryRun:** fetches target admin, returns `{ found, preview: { email, role, status }, requiresConfirm:true }`; guards self-deactivation (if `admin_id == caller` → error). **confirm:** sets `admin_accounts.is_active=false` (no auth deletion in Phase 1) and returns `{ deactivated }`. |

> **Note:** Table lists 6 rows because the write variant splits `cancel` + `update_settings` + `deactivate`; the **5 logical tools** are: 3 read + 2 bulk-write (`cancel`, `update_settings`) + 1 single-write (`deactivate`). If counting tool names, it is 6 identifiers; if counting per spec's "5 tools" grouping, `deactivate_admin` is the 5th write tool alongside the two bulk writes.

**Tool response envelope:**

- Preview (dryRun): `{ success:true, preview:true, found, preview, requiresConfirm:true, message }`
- Result (confirm): `{ success:true, preview:false, result, message }`
- Error: `{ success:false, error }` with 400/403/404/429/500.

All handlers reuse existing routers' validation and `execute_with_retry()`; no new DB access patterns.

---

## 5. Frontend UI

### 5.1 Bubble

- `fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gc-green-700 hover:bg-gc-green-800 text-white shadow-lg flex items-center justify-center`
- Icon: chat bubble / sparkles (lucide `MessageCircle` or `Sparkles`).
- Hidden when `isPending === true`.

### 5.2 Panel

- **Container:** Desktop `w-[380px] h-[520px] rounded-2xl bg-white shadow-2xl border border-gc-green-100 flex flex-col overflow-hidden`; Mobile `fixed inset-0 md:bottom-20 md:right-6 md:inset-auto` bottom sheet.
- **Header:** `bg-gc-green-700 text-white px-4 py-3 flex items-center justify-between` — left `Clinic Assistant` + subtitle `Phase 1`, right `Clear` (ghost) + `Close` (X).
- **History:** scrollable `flex-1 overflow-y-auto p-4 space-y-3 bg-gc-green-50/30`
  - User bubble: `ml-auto bg-gc-green-700 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[80%]`
  - Assistant bubble: `mr-auto bg-white border border-gc-green-100 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[80%]`
  - Tool preview card: `bg-amber-50 border border-amber-200 rounded-xl p-3` — header `Found N appointments` or `Proposed changes`, preview rows (max 5), footer `Yes / No` buttons (`Yes` triggers `POST /confirm`, `No` dismisses preview).
- **Input:** `border-t p-3 flex gap-2` — `textarea rows=1` auto-expands to 3, placeholder `Ask about appointments, reports, settings...`, `Send` button `bg-gc-green-700`.
- **Typing indicator:** three-dot bounce when awaiting `POST /chat`.
- **Error banner:** `bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-sm` above input on 4xx/5xx.

### 5.3 Admin Theme

- Colors reuse `gc-green-*` palette (`700` primary, `50` bg, `100` border) and `amber` for preview warnings. No new theme tokens.

### 5.4 Files

- `src/components/agent/AgentBubble.jsx`
- `src/components/agent/AgentPanel.jsx`
- `src/components/agent/ToolPreviewCard.jsx` (optional split)
- `src/lib/agentApi.js` — `agentApi: { chat(message, history), confirm(tool, args) }`
- `src/context/AgentContext.jsx` (optional — or local state in `AdminLayout`)

---

## 6. Security & Confirmation

| Control | Detail |
|---------|--------|
| `require_admin` on `/api/agent/*` | Both `POST /chat` and `POST /confirm` require active admin (`admin_accounts.is_active=true` + valid `app_accounts` binding). Students/anonymous → 403. |
| `isPending` guard (frontend) | Bubble hidden/disabled when `isPending`; pending admins cannot open panel or call `POST /chat` (backend also rejects). |
| Preview → Confirm for all writes | LLM is instructed to always call writes with `dryRun=true`; backend enforces `requiresConfirm` and ignores any `confirm` that did not have a prior preview (stateless: preview is recomputed but write still requires explicit `confirm:true`); **no silent writes**. |
| No auto-confirm | Panel always shows `Yes/No` for preview cards; `Yes` is the only path to `POST /confirm`. |
| Rate limit | **20 requests / 5 min per admin** (in-memory sliding window on `admin_id`); 429 on exceed. Counted separately for `/chat` and `/confirm` combined. |
| Prompt injection hygiene | Tool args are validated server-side (date format, enum, admin_id existence, slot bounds); LLM output is never executed as code. |
| Audit trail | All `POST /confirm` writes log `{ admin_id, tool, args, timestamp, resultCount }` via `logger.info` (no new table; future phase can persist). |

---

## 7. Example Flows

### 7.1 "Clear today's appointments"

1. Admin types: `clear today's appointments`
2. Frontend → `POST /api/agent/chat { message:"clear today's appointments" }`
3. LLM selects `cancel_appointments` with `{ date:"2026-08-30", dryRun:true }`
4. Backend scans `appointments` where `date=2026-08-30` and `status != cancelled` → `{ found:12, preview:[5 rows], requiresConfirm:true }`
5. Assistant replies: `Found 12 appointments for 2026-08-30. Cancel all 12?` + preview card `Found 12 → [Yes] [No]`
6. Admin clicks **Yes** → `POST /api/agent/confirm { tool:"cancel_appointments", args:{date:"2026-08-30"}, confirmed:true }`
7. Backend executes `cancel_appointments` with `dryRun=false` → `{ cancelled:12 }`
8. Assistant replies: `Done — 12 appointments cancelled for 2026-08-30.`

If admin clicks **No**: preview dismissed, assistant replies `Cancelled — no changes made.`

### 7.2 "Change default to 8am–5pm"

1. Admin types: `change default to 8am-5pm`
2. `POST /api/agent/chat` → LLM → `update_clinic_settings` with `{ default_start_time:"08:00", default_end_time:"17:00", dryRun:true }`
3. Backend validates times (`08:00 < 17:00`, within 06:00–22:00) and returns `{ preview:{ current:{default_start_time:"09:00", default_end_time:"16:00"}, proposed:{default_start_time:"08:00", default_end_time:"17:00"} }, requiresConfirm:true }`
4. Assistant: `Update clinic hours from 09:00–16:00 to 08:00–17:00?` + card with diff + `[Yes] [No]`
5. Admin **Yes** → `POST /api/agent/confirm { tool:"update_clinic_settings", args:{default_start_time:"08:00", default_end_time:"17:00"}, confirmed:true }`
6. Backend writes `clinic_settings` → `{ updated:true, settings:{...} }`
7. Assistant: `Done — default hours updated to 08:00–17:00.`

### 7.3 "Who are the admins?" (read-only, no confirm)

1. `POST /api/agent/chat { message:"who are the admins?" }` → LLM → `list_admins { search:"" }`
2. Backend returns `{ count:4, admins:[...] }`
3. Assistant renders list inline (no preview card, no confirm).

---

## 8. Error Handling

| Scenario | Status | Response / UI |
|----------|--------|---------------|
| Not admin at `POST /chat` or `/confirm` | 403 | `{ success:false, error:"Admin access required" }` → error banner "Admin access required." |
| Pending admin tries to open | 403 | Bubble hidden; if direct API call → 403 "Pending — assistant unavailable" |
| Rate limit exceeded | 429 | `{ success:false, error:"Rate limit — try again shortly" }` → banner + retry after 60s |
| Invalid tool args (bad date, missing admin_id, invalid time) | 400 | `{ success:false, error:"Invalid date format (YYYY-MM-DD)" }` → assistant bubble with error + correction prompt |
| Target not found (`deactivate_admin` with unknown id) | 404 | `{ success:false, error:"Admin not found" }` |
| Self-deactivate attempt | 403 | `{ success:false, error:"Cannot deactivate yourself" }` |
| Preview with `found=0` | 200 | Assistant: `No matching appointments found — no changes needed.` (no Yes/No) |
| Groq unavailable / key missing | 200 (degraded) | Fallback to `MockLLM` (keyword matcher); if both fail → `500 { success:false, error:"Assistant temporarily unavailable" }` |
| LLM returns unknown tool | 400 | `{ success:false, error:"Unknown tool" }` logged, assistant replies "I couldn't handle that — try rephrasing." |
| Generic 500 | 500 | `{ success:false, error:"Unexpected error" }` → banner, server log |

---

## 9. Testing

### 9.1 Backend

- `python -m py_compile routers/agent.py` — zero syntax errors.
- `POST /api/agent/chat` with valid admin JWT → 200; with student JWT → 403; without token → 401.
- Read tools: `list_appointments` with `date=2026-08-30` returns `count` matching `GET /api/appointments?date=...`; `list_admins` with `search` mirrors `GET /api/admins`.
- Write preview: `cancel_appointments {date, dryRun:true}` → `found` + `requiresConfirm` without DB change; verify count unchanged after preview.
- Write confirm: `POST /api/agent/confirm {tool:"cancel_appointments", args:{date}, confirmed:true}` → `cancelled` equals `found`; verify DB rows updated.
- `update_clinic_settings` dryRun → preview diff; confirm → row updated; invalid time → 400.
- `deactivate_admin` with self id → 403; with unknown id → 404; with other admin + dryRun → preview; confirm → `is_active=false`.
- Rate limit: 21 rapid `POST /chat` from same admin → 21st is 429.
- LLM provider switch: `LLM_PROVIDER=mock` → deterministic tool selection by keyword, no external call.

### 9.2 Frontend

- `npm run build` → 0 errors.
- Manual: Log in as active admin → bubble visible on every `/admin/*` route; as pending admin → bubble hidden.
- Chat: "who are the admins?" → assistant lists admins inline.
- Preview flow: "clear today's appointments" → card shows `Found N` → Yes → success message with `cancelled N`; No → no mutation.
- Mobile: panel is bottom sheet, input focused, scroll works.
- Error: trigger 429 → banner appears, Send disabled briefly.

---

## 10. Rollout

1. Merge spec (this file) to `main`.
2. Implement backend `routers/agent.py` + LLM abstraction + register blueprint in `main.py`; add env `GROQ_API_KEY`, `LLM_PROVIDER` to `.env.example`.
3. Implement frontend `AgentBubble` + `AgentPanel` + `agentApi` + mount in `AdminLayout`; reuse `gc-green` theme.
4. Deploy backend; run `py_compile` + curl checks for `require_admin`, preview→confirm, and rate limit.
5. Deploy frontend; run `npm run build` + manual flows ("clear today's appointments", "change default to 8am-5pm", "who are the admins?").
6. Monitor Groq usage and fallback to `mock` if quota/error; no migration or DB change required.

---

## 11. Open Questions

*None — design approved as written. Any new question must be recorded here via amendment before implementation.*

---

*End of spec — 2026-08-30. Authoritative for Clinic Assistant Agent Phase 1 (Global Bubble, 5 Tools, Groq) implementation.*
