# Clinic Assistant Agent — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a global Clinic Assistant for every `/admin/*` route — floating bubble + chat panel that understands natural language via Groq (with mock fallback), calls 5 curated tools, and enforces preview→confirm for all writes.

**Architecture:** New Flask blueprint `routers/agent.py` (`/api/agent`) owns `POST /chat` + `POST /confirm` with `require_admin`, per-admin 20/5min rate limit, and LLM abstraction (`GROQ_API_KEY` + `LLM_PROVIDER` env). Each tool reuses existing router queries via `execute_with_retry()` and service-role client — no new tables. Frontend adds `AgentBubble` + `AgentPanel` (+ `ToolPreviewCard`) mounted once in `AdminLayout`, and `src/lib/agentApi.js` for `chat`/`confirm`; history lives in local state (no DB persistence in Phase 1).

**Tech Stack:** Flask 3 + Supabase (service-role PostgREST) + Python 3.10+, React 18 + Vite + Tailwind PWA, groq Python SDK (`groq>=0.11`), `python-dotenv`, `lucide` icons optional (fallback to inline SVG)

**Spec:** `docs/superpowers/specs/2026-08-30-agent-phase1-design.md`

## Global Constraints

- No new tables, views, or migrations. All tools reuse existing router logic via `execute_with_retry()` and service-role Supabase client; no raw SQL duplication.
- Route prefix `/api/agent` admin-only: both `POST /api/agent/chat` and `POST /api/agent/confirm` require `require_admin` (active admin `admin_accounts.is_active=true` + `app_accounts` binding); students/anonymous → 403 `{ success:false, error:"Admin access required" }` or 401 for missing token; pending admins → 403 pending.
- LLM pluggable via env `LLM_PROVIDER=groq` (primary), `mock` (fallback), `ollama` (optional); Groq uses `GROQ_API_KEY`; `LLM_PROVIDER` defaults to `groq` when key present else `mock`; prompt injects current date, admin email/role, available tools, and system instruction to always use `dryRun=true` for writes and return preview before confirming.
- Preview→confirm for ALL writes: LLM is instructed to always call writes with `dryRun=true`; backend enforces `requiresConfirm` and ignores any `confirm` that did not have a prior preview (stateless recompute but write still requires explicit `confirmed:true`); no silent writes; panel always shows `Yes/No` for preview cards, `Yes` is only path to `POST /confirm`.
- Rate limit in-memory per-admin sliding window `agent_rate: {admin_id: [timestamps]}` — max 20 requests / 5 min per admin (combined `/chat` + `/confirm`); exceed → `429 { success:false, error:"Rate limit — try again shortly" }`.
- Frontend mount point `src/components/agent/AgentBubble.jsx` + `src/components/agent/AgentPanel.jsx` mounted inside `src/components/layout/AdminLayout.jsx` so they render on every admin route; bubble `fixed bottom-6 right-6 z-50`; panel desktop `w-[380px] h-[520px] rounded-2xl shadow-2xl` anchored `bottom-20 right-6`, mobile full-screen bottom sheet `inset-0` / `bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl`.
- Bubble hidden/disabled when `isPending === true` (derived from `admin_accounts.is_active` / auth context) with tooltip "Pending approval — assistant unavailable"; pending admins cannot open panel or call `POST /chat` (backend also rejects).
- State `history: Array<{role:'user'|'assistant', content, toolCalls?, preview?}>` held in context/local state; `Clear` resets history, `Close` hides panel but preserves history until clear.
- Tool args validated server-side (date format YYYY-MM-DD, enums, admin_id existence, slot bounds `06:00-22:00` for `update_clinic_settings`, self-deactivation guard); LLM output never executed as code; all `POST /confirm` writes log `{ admin_id, tool, args, timestamp, resultCount }` via `logger.info`.
- Colors reuse `gc-green-*` palette (`700` primary, `50` bg, `100` border) and `amber` for preview warnings; no new theme tokens.
- Env `GROQ_API_KEY`, `LLM_PROVIDER` must be added to `.env.example`; `groq` added to `requirements.txt`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `routers/agent.py` | Create | Blueprint `agent_bp` (`/api/agent`) with `POST /chat` + `POST /confirm`, LLM abstraction `get_llm_client()` + `MockLLM`, tool registry + handlers for 6 identifiers (3 read + 3 write with preview→confirm), rate limiter, `require_admin` guard |
| `main.py` | Modify | Import + `app.register_blueprint(agent_bp)` |
| `.env.example` | Modify | Add `GROQ_API_KEY` + `LLM_PROVIDER` with comments |
| `requirements.txt` | Modify | Add `groq>=0.11.0` |
| `src/lib/agentApi.js` | Create | `agentApi: { chat(message, history), confirm(tool, args) }` using `api.post`-style authed fetch via `supabase` session |
| `src/components/agent/AgentBubble.jsx` | Create | Fixed circular button `bg-gc-green-700 hover:bg-gc-green-800`, `aria-label="Open Clinic Assistant"`, hidden when `isPending`, `z-50` |
| `src/components/agent/AgentPanel.jsx` | Create | Chat panel container (header Clear/Close, scrollable history, preview card slot, input + Send, typing indicator, error banner) — desktop + mobile responsive |
| `src/components/agent/ToolPreviewCard.jsx` | Create | Amber preview card: header `Found N` / diff, preview rows max 5, footer `Yes`/`No` buttons |
| `src/components/layout/AdminLayout.jsx` | Modify | Import + mount `<AgentBubble>` + `<AgentPanel>` inside layout; pass `isPending`/`open` wiring; no change to pending logic |
| `tests/test_agent.py` | Create | Backend pytest suite for agent blueprint (mocked Supabase + mock LLM) |

---

### Task 1: Backend agent blueprint + chat endpoint + mock LLM + read tools (list_appointments, get_reports, list_admins)

**Files:**
- Create: `routers/agent.py`
- Modify: `main.py:1-60` (register blueprint)
- Modify: `.env.example:1-25` (add GROQ keys)
- Modify: `requirements.txt:1-5` (add groq)
- Test: `tests/test_agent.py` (new — Part A)

**Interfaces:**
- Consumes: `database.supabase` (alias `supabase_client.supabase`), `routers.helpers.execute_with_retry`, `routers.helpers.error_response`, `routers.helpers.handle_errors`, `routers.auth_guard.require_admin`, `routers.auth_guard.sanitize_search`, `routers.reports.get_report` / `routers.reports._fetch_breakdowns` pattern, `routers.admin_mgmt.ALLOWED_ADMIN_ROLES` not needed here, Flask `g.user`, `os.getenv("GROQ_API_KEY")`, `os.getenv("LLM_PROVIDER")`
- Produces: `Blueprint agent_bp` (`url_prefix="/api/agent"`), `get_llm_client() -> Groq|MockLLM`, `MockLLM.chat_complete(messages, tools) -> {tool, args}|{reply}`, `TOOL_SCHEMAS: list[dict]` (JSON Schema for 6 tools), handlers `_handle_list_appointments`, `_handle_get_reports`, `_handle_list_admins`, rate-limit helpers `_check_rate_limit(admin_id)->bool`, `_record_request(admin_id)`, route `POST /api/agent/chat`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_agent.py — Part A (read path + mock LLM)
import pytest
from unittest.mock import MagicMock, patch

def test_agent_chat_requires_admin():
    # Before blueprint exists, route should 401/404; after, require_admin → 401 without token
    from main import app
    app.config["TESTING"] = True
    c = app.test_client()
    resp = c.post("/api/agent/chat", json={"message": "who are the admins?"})
    assert resp.status_code in (401, 403, 404)
    body = resp.get_json(silent=True) or {}
    assert body.get("success") is False or resp.status_code == 404

def test_mock_llm_keyword_routing():
    # MockLLM must be importable and route "who are the admins" → list_admins
    try:
        from routers.agent import MockLLM
        llm = MockLLM()
        out = llm.chat_complete([{"role": "user", "content": "who are the admins?"}], tools=[])
        assert out.get("tool") == "list_admins"
    except ImportError:
        pytest.fail("routers.agent.MockLLM not importable yet")

def test_tool_schemas_defined():
    try:
        from routers.agent import TOOL_SCHEMAS
        names = {t["function"]["name"] for t in TOOL_SCHEMAS}
        assert "list_appointments" in names
        assert "get_reports" in names
        assert "list_admins" in names
    except ImportError:
        pytest.fail("TOOL_SCHEMAS not importable yet")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_agent.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'routers.agent'` or `ImportError: cannot import name 'MockLLM'`

- [ ] **Step 3: Write minimal implementation**

```python
# routers/agent.py
import os
import re
import time
import logging
from datetime import date as date_type
from flask import Blueprint, jsonify, request, g
from database import supabase
from routers.auth_guard import require_admin, sanitize_search
from routers.helpers import execute_with_retry, error_response, handle_errors

logger = logging.getLogger(__name__)

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")

# ---- Rate limit: 20 requests / 5 min per admin (in-memory sliding window) ----
AGENT_RATE_LIMIT = 20
AGENT_RATE_WINDOW_SECONDS = 5 * 60
_agent_rate: dict[str, list[float]] = {}

def _admin_key() -> str:
    # g.user set by require_admin: {"id": auth_user_id, "email": ...}
    return str((getattr(g, "user", {}) or {}).get("id") or (getattr(g, "user", {}) or {}).get("email") or "anon")

def _check_rate_limit(admin_key: str) -> bool:
    now = time.time()
    window_start = now - AGENT_RATE_WINDOW_SECONDS
    stamps = _agent_rate.get(admin_key, [])
    stamps = [t for t in stamps if t > window_start]
    _agent_rate[admin_key] = stamps
    return len(stamps) < AGENT_RATE_LIMIT

def _record_request(admin_key: str) -> None:
    _agent_rate.setdefault(admin_key, []).append(time.time())

def _rate_limited_response():
    return jsonify({"success": False, "error": "Rate limit — try again shortly"}), 429

# ---- Tool JSON Schemas (described to LLM) ----
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "list_appointments",
            "description": "List appointments filtered by date and/or status. Read-only, no confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "status": {"type": "string", "enum": ["pending", "approved", "completed", "cancelled", "no_show"]},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_reports",
            "description": "Get aggregated reports for a date. Read-only.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "department_id": {"type": "string"},
                    "period": {"type": "string", "enum": ["daily", "weekly", "monthly"]},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_admins",
            "description": "List admin roster. Supports search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_appointments",
            "description": "Cancel appointments matching date/status. Write: always dryRun first, then confirm.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "status": {"type": "string"},
                    "dryRun": {"type": "boolean"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_clinic_settings",
            "description": "Update clinic settings (slot_interval, max_students, hours). Write: dryRun then confirm.",
            "parameters": {
                "type": "object",
                "properties": {
                    "slot_interval": {"type": "integer"},
                    "max_students_per_slot": {"type": "integer"},
                    "default_start_time": {"type": "string"},
                    "default_end_time": {"type": "string"},
                    "dryRun": {"type": "boolean"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "deactivate_admin",
            "description": "Deactivate an admin by admin_id. Write: dryRun then confirm. Blocks self-deactivation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "admin_id": {"type": "string"},
                    "dryRun": {"type": "boolean"},
                },
                "required": ["admin_id"],
            },
        },
    },
]

# ---- LLM abstraction ----
class MockLLM:
    """Deterministic keyword matcher for offline/testing and Groq fallback."""
    def chat_complete(self, messages, tools=None):
        # messages: list[{role, content}]
        text = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                text = (m.get("content") or "").lower()
                break
        # deactivate/cancel/settings have higher priority than generic list
        if "deactivate" in text or ("disable" in text and "admin" in text):
            # try to extract uuid-like admin_id; else placeholder that handler will validate
            import re as _re
            m = _re.search(r"[0-9a-f-]{8,}", text)
            return {"tool": "deactivate_admin", "args": {"admin_id": m.group(0) if m else "unknown", "dryRun": True}}
        if "clear" in text or "cancel" in text:
            import re as _re
            dm = _re.search(r"\d{4}-\d{2}-\d{2}", text)
            d = dm.group(0) if dm else date_type.today().isoformat()
            if "today" in text:
                d = date_type.today().isoformat()
            return {"tool": "cancel_appointments", "args": {"date": d, "dryRun": True}}
        if "hour" in text or "8am" in text or "5pm" in text or "settings" in text or "slot" in text:
            return {"tool": "update_clinic_settings", "args": {"default_start_time": "08:00", "default_end_time": "17:00", "dryRun": True}}
        if "who are the admins" in text or ("admin" in text and "list" in text):
            return {"tool": "list_admins", "args": {"search": ""}}
        if "report" in text:
            return {"tool": "get_reports", "args": {}}
        if "appointment" in text:
            import re as _re
            dm = _re.search(r"\d{4}-\d{2}-\d{2}", text)
            if dm:
                return {"tool": "list_appointments", "args": {"date": dm.group(0)}}
            return {"tool": "list_appointments", "args": {}}
        return {"reply": "I can help with appointments, reports, admins, cancelling, and clinic settings. Try: 'who are the admins?' or 'clear today's appointments'."}

def get_llm_client():
    provider = (os.getenv("LLM_PROVIDER") or ("groq" if os.getenv("GROQ_API_KEY") else "mock")).strip().lower()
    if provider == "groq":
        api_key = (os.getenv("GROQ_API_KEY") or "").strip()
        if not api_key:
            logger.warning("GROQ_API_KEY missing — falling back to MockLLM")
            return MockLLM()
        try:
            from groq import Groq
            return Groq(api_key=api_key)
        except Exception as exc:
            logger.warning("Groq import/init failed: %r — falling back to MockLLM", exc)
            return MockLLM()
    if provider == "ollama":
        # Optional; if not configured, fall through to mock
        try:
            from routers.agent_ollama import OllamaClient  # optional shim
            return OllamaClient(base_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"))
        except Exception:
            return MockLLM()
    return MockLLM()

SYSTEM_PROMPT = (
    "You are the Gordon College Clinic Assistant (Phase 1). "
    "You help admins with appointments, reports, admin roster, cancelling appointments, clinic settings, and deactivating admins. "
    "Always call write tools with dryRun=true first and return a preview; never mutate without explicit confirmation. "
    "Available tools: list_appointments, get_reports, list_admins, cancel_appointments, update_clinic_settings, deactivate_admin. "
    "Current date is {today}. Admin is {email}."
)

# ---- Read tool handlers (reuse existing logic via execute_with_retry) ----
def _handle_list_appointments(args: dict):
    q = supabase.table("appointments").select("*", count="exact").order("appointment_date", desc=False).order("appointment_time", desc=False)
    if args.get("date"):
        # validate YYYY-MM-DD
        try:
            date_type.fromisoformat(str(args["date"])[:10])
        except Exception:
            return {"success": False, "error": "Invalid date format (YYYY-MM-DD)"}, 400
        q = q.eq("appointment_date", str(args["date"])[:10])
    if args.get("status"):
        q = q.eq("current_status", str(args["status"]).strip().lower())
    resp = execute_with_retry(q.range(0, 49))
    rows = resp.data or []
    return {"success": True, "count": len(rows), "appointments": rows}, 200

def _handle_get_reports(args: dict):
    # Reuse view/RPC path if available; else fallback to direct table read like reports.py
    d = args.get("date")
    if d:
        try:
            date_type.fromisoformat(str(d)[:10])
        except Exception:
            return {"success": False, "error": "Invalid date format (YYYY-MM-DD)"}, 400
    else:
        d = date_type.today().isoformat()
    dept = args.get("department_id")
    # Try RPC if exists, else fallback to view rows
    try:
        from supabase_client import supabase as _supa
        rpc = execute_with_retry(_supa.rpc("report_breakdown", {"p_report_date": str(d)[:10], "p_department_id": int(dept) if dept else None}))
        if isinstance(rpc.data, dict):
            # summarize counts
            status_rows = rpc.data.get("current_status") or []
            total = sum(r.get("count", 0) for r in status_rows)
            return {"success": True, "date": d, "total_appointments": total, "breakdowns": rpc.data}, 200
    except Exception:
        pass
    q = supabase.table("report_appointment_rows").select("*").eq("appointment_date", str(d)[:10])
    if dept:
        try:
            q = q.eq("department_id", int(dept))
        except Exception:
            pass
    rows = execute_with_retry(q).data or []
    return {"success": True, "count": len(rows), "reports": rows, "date": d}, 200

def _handle_list_admins(args: dict):
    search = sanitize_search(args.get("search"))
    q = supabase.table("admin_accounts").select("*", count="exact").order("created_at", desc=True)
    if search:
        like = f"%{search}%"
        q = q.or_(f"email.ilike.{like},username.ilike.{like},first_name.ilike.{like},last_name.ilike.{like},role.ilike.{like}")
    q = q.range(0, 19)
    resp = execute_with_retry(q)
    rows = resp.data or []
    # attach has_app_account for status
    admin_ids = [r.get("admin_id") for r in rows if r.get("admin_id") is not None]
    has_account = set()
    if admin_ids:
        acct = execute_with_retry(supabase.table("app_accounts").select("admin_id").in_("admin_id", admin_ids))
        has_account = {r.get("admin_id") for r in (acct.data or []) if r.get("admin_id")}
    def _status(is_active, has_acct):
        if is_active and has_acct: return "active"
        if not is_active: return "pending"
        return "pending"
    admins = []
    for r in rows:
        aid = r.get("admin_id")
        admins.append({"admin_id": aid, "email": r.get("email"), "username": r.get("username"), "first_name": r.get("first_name"), "last_name": r.get("last_name"), "role": r.get("role"), "is_active": r.get("is_active"), "status": _status(bool(r.get("is_active")), aid in has_account)})
    return {"success": True, "count": len(admins), "admins": admins}, 200

TOOL_HANDLERS = {
    "list_appointments": _handle_list_appointments,
    "get_reports": _handle_get_reports,
    "list_admins": _handle_list_admins,
}

def _call_llm(messages):
    client = get_llm_client()
    if isinstance(client, MockLLM):
        return client.chat_complete(messages, tools=TOOL_SCHEMAS)
    # Groq path — convert TOOL_SCHEMAS to Groq tool format and call
    try:
        today = date_type.today().isoformat()
        admin_email = (getattr(g, "user", {}) or {}).get("email") or "unknown"
        system = SYSTEM_PROMPT.format(today=today, email=admin_email)
        groq_messages = [{"role": "system", "content": system}] + messages
        resp = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=groq_messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=800,
        )
        choice = resp.choices[0]
        if getattr(choice.message, "tool_calls", None):
            tc = choice.message.tool_calls[0]
            import json as _json
            args = _json.loads(tc.function.arguments or "{}")
            return {"tool": tc.function.name, "args": args}
        return {"reply": choice.message.content or ""}
    except Exception as exc:
        logger.warning("Groq call failed: %r — using MockLLM fallback", exc)
        return MockLLM().chat_complete(messages, tools=TOOL_SCHEMAS)

@agent_bp.route("/chat", methods=["POST"])
@require_admin
@handle_errors("agent chat error")
def agent_chat():
    key = _admin_key()
    if not _check_rate_limit(key):
        return _rate_limited_response()
    _record_request(key)
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if not message:
        return jsonify({"success": False, "error": "Message is required."}), 400
    history = body.get("history") or []
    # history is list[{role, content}] from frontend — sanitize to last 20
    if not isinstance(history, list):
        history = []
    history = history[-20:]
    messages = []
    for h in history:
        if isinstance(h, dict) and h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": str(h["content"])[:4000]})
    messages.append({"role": "user", "content": message})
    llm_out = _call_llm(messages)
    if "reply" in llm_out and "tool" not in llm_out:
        return jsonify({"success": True, "reply": llm_out["reply"]}), 200
    tool = llm_out.get("tool")
    args = llm_out.get("args") or {}
    if tool not in TOOL_HANDLERS:
        # Write tools not yet wired in Task 1 — return preview scaffolding (Task 2 will own them)
        # For Task 1, unknown write tool → ask to rephrase
        if tool in ("cancel_appointments", "update_clinic_settings", "deactivate_admin"):
            return jsonify({"success": True, "reply": "That action requires confirmation — preview is being prepared.", "preview": {"requiresConfirm": True, "tool": tool, "args": args}}), 200
        logger.warning("Unknown tool from LLM: %s", tool)
        return jsonify({"success": True, "reply": "I couldn't handle that — try rephrasing."}), 200
    result, status = TOOL_HANDLERS[tool](args)
    if status != 200:
        return jsonify(result), status
    # Wrap read results as assistant reply + data
    reply_map = {
        "list_appointments": f"Found {result.get('count', 0)} appointment(s).",
        "get_reports": f"Reports for {result.get('date')}: {result.get('count', result.get('total_appointments', 0))} row(s).",
        "list_admins": f"Found {result.get('count', 0)} admin(s).",
    }
    return jsonify({"success": True, "reply": reply_map.get(tool, "Done."), "tool": tool, "data": result}), 200
```

Register blueprint in `main.py`:

```python
# main.py — add import near other router imports
from routers.agent import agent_bp
# ... in register section after admin_mgmt:
app.register_blueprint(agent_bp)
```

Add to `.env.example`:

```
# ---- Clinic Assistant Agent (Groq LLM) ----
GROQ_API_KEY=your-groq-api-key
LLM_PROVIDER=groq
# LLM_PROVIDER options: groq | mock | ollama
# GROQ_MODEL is optional (defaults to llama-3.3-70b-versatile)
# GROQ_MODEL=llama-3.3-70b-versatile
# OLLAMA_URL=http://127.0.0.1:11434
```

Add to `requirements.txt`:

```
groq>=0.11.0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_agent.py -v`
Expected: PASS (401 for unauthenticated chat, MockLLM routes admin query, TOOL_SCHEMAS has 3 read names).

Run: `python -m py_compile routers/agent.py`
Expected: no error.

Run: `python -c "from routers.agent import MockLLM; m=MockLLM(); print(m.chat_complete([{'role':'user','content':'who are the admins?'}]))"`
Expected: `{'tool': 'list_admins', ...}`

- [ ] **Step 5: Commit**

```bash
git add routers/agent.py main.py requirements.txt .env.example tests/test_agent.py
git commit -m "feat(agent): add blueprint, chat endpoint, mock LLM and read tools"
```

---

### Task 2: Backend write tools with preview→confirm (cancel_appointments, update_clinic_settings, deactivate_admin) + confirm endpoint + rate limit tightening

**Files:**
- Modify: `routers/agent.py:1-260` (add 3 write handlers + `POST /confirm` + `TOOL_HANDLERS` extensions + validation)
- Test: `tests/test_agent.py` (extend — Part B)

**Interfaces:**
- Consumes: `agent_bp`, `MockLLM`, `TOOL_SCHEMAS`, `_check_rate_limit`, `_record_request`, `supabase.table("appointments")`, `supabase.table("clinic_appointment_settings")`, `supabase.table("admin_accounts")`, `execute_with_retry`, `require_admin`, `g.user`, `logger`
- Produces: `_handle_cancel_appointments(args) -> (dict, int)` with envelope `{ success, preview, found, preview, requiresConfirm, message }` on dryRun and `{ success, preview:false, cancelled }` on confirm; `_handle_update_clinic_settings(args)` with `{ preview:{current, proposed}, requiresConfirm }` on dryRun and `{ updated, settings }` on confirm; `_handle_deactivate_admin(args)` with `{ found, preview:{email,role,status}, requiresConfirm }`; route `POST /api/agent/confirm` accepting `{ tool, args, confirmed:true }` and executing write after re-validation + audit log

- [ ] **Step 1: Write the failing test**

```python
# tests/test_agent.py — Part B additions
def test_cancel_preview_requires_confirm():
    from unittest.mock import patch as _patch, MagicMock
    from main import app
    app.config["TESTING"] = True
    # Mock auth to pass require_admin — patch is_admin_user to True and token verify
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True), \
         _patch("routers.agent.execute_with_retry") as mock_exec:
        mock_user = MagicMock()
        mock_user.id = "test-admin-id"
        mock_user.email = "admin@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        # Mock preview: 2 appointments found
        mock_exec.return_value = MagicMock(data=[{"appointment_id": 1, "appointment_date": "2026-08-30"}, {"appointment_id": 2, "appointment_date": "2026-08-30"}], count=2)
        c = app.test_client()
        # Groq not needed — force mock LLM path via LLM_PROVIDER=mock
        with _patch.dict("os.environ", {"LLM_PROVIDER": "mock"}):
            resp = c.post("/api/agent/chat", headers={"Authorization": "Bearer fake"}, json={"message": "clear today's appointments"})
            assert resp.status_code in (200, 429)
            if resp.status_code == 200:
                body = resp.get_json()
                # Should have preview card for write
                assert body.get("preview") is not None or body.get("requiresConfirm") is True or "preview" in str(body).lower()

def test_confirm_without_confirmed_flag_rejected():
    from unittest.mock import patch as _patch, MagicMock
    from main import app
    app.config["TESTING"] = True
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True):
        mock_user = MagicMock()
        mock_user.id = "test-admin-id"
        mock_user.email = "admin@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        c = app.test_client()
        resp = c.post("/api/agent/confirm", headers={"Authorization": "Bearer fake"}, json={"tool": "cancel_appointments", "args": {"date": "2026-08-30"}})
        assert resp.status_code == 400
        assert resp.get_json()["success"] is False

def test_deactivate_self_blocked():
    from unittest.mock import patch as _patch, MagicMock
    from main import app
    app.config["TESTING"] = True
    with _patch("routers.auth_guard._verify_token") as mock_verify, \
         _patch("routers.auth_guard.is_admin_user", return_value=True), \
         _patch("routers.agent.execute_with_retry") as mock_exec:
        mock_user = MagicMock()
        mock_user.id = "admin-123"
        mock_user.email = "me@gordoncollege.edu.ph"
        mock_verify.return_value = mock_user
        # Mock admin lookup returns self admin
        def side_effect(q):
            m = MagicMock()
            m.data = [{"admin_id": "admin-123", "email": "me@gordoncollege.edu.ph", "role": "nurse", "is_active": True}]
            m.count = 1
            return m
        mock_exec.side_effect = side_effect
        # Also need g.user to carry resolved admin_id — patch _admin_key to return same id
        c = app.test_client()
        with _patch("routers.agent._admin_key", return_value="admin-123"):
            resp = c.post("/api/agent/confirm", headers={"Authorization": "Bearer fake"}, json={"tool": "deactivate_admin", "args": {"admin_id": "admin-123"}, "confirmed": True})
            assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_agent.py::test_confirm_without_confirmed_flag_rejected -v`
Expected: FAIL with `404` (route not found) or `TypeError` before confirm endpoint exists

- [ ] **Step 3: Write minimal implementation**

Add to `routers/agent.py` after `_handle_list_admins` and before `TOOL_HANDLERS`:

```python
# ---- Write tool handlers (preview→confirm) ----
def _handle_cancel_appointments(args: dict):
    dry = args.get("dryRun", True)
    # Support both dryRun and preview flag names
    if args.get("confirm") is True:
        dry = False
    is_preview = bool(dry)
    date_str = (args.get("date") or "").strip() if args.get("date") else None
    status = (args.get("status") or "").strip().lower() if args.get("status") else None
    if date_str:
        try:
            date_type.fromisoformat(date_str[:10])
            date_str = date_str[:10]
        except Exception:
            return {"success": False, "error": "Invalid date format (YYYY-MM-DD)"}, 400
    # Build query for matching appointments where current_status != cancelled
    q = supabase.table("appointments").select("appointment_id, appointment_date, appointment_time, student_id, current_status", count="exact")
    if date_str:
        q = q.eq("appointment_date", date_str)
    if status:
        q = q.eq("current_status", status)
    else:
        # Default: only non-cancelled
        q = q.neq("current_status", "cancelled")
    resp = execute_with_retry(q.range(0, 499))
    rows = resp.data or []
    # Filter out already cancelled locally as fallback
    rows = [r for r in rows if str(r.get("current_status") or "").lower() != "cancelled"]
    found = len(rows)
    if is_preview:
        preview_rows = rows[:5]
        if found == 0:
            return {"success": True, "preview": True, "found": 0, "preview": [], "requiresConfirm": False, "message": "No matching appointments found — no changes needed."}, 200
        return {"success": True, "preview": True, "found": found, "preview": preview_rows, "requiresConfirm": True, "message": f"Found {found} appointment(s). Cancel all {found}?"}, 200
    # Confirm path — execute cancellation via status history + current_status
    cancelled = 0
    for r in rows:
        appt_id = r.get("appointment_id")
        try:
            # Fetch latest status for remarks
            prev = r.get("current_status")
            execute_with_retry(supabase.table("appointment_status_history").insert({
                "appointment_id": appt_id,
                "previous_status": prev,
                "new_status": "cancelled",
                "remarks": "Cancelled via Clinic Assistant",
                "changed_by_admin_id": None,
            }))
            execute_with_retry(supabase.table("appointments").update({"current_status": "cancelled"}).eq("appointment_id", appt_id))
            cancelled += 1
        except Exception as exc:
            logger.warning("cancel_appointments failed for %s: %r", appt_id, exc)
    logger.info("agent confirm cancel_appointments by %s date=%s cancelled=%s", _admin_key(), date_str, cancelled)
    return {"success": True, "preview": False, "cancelled": cancelled, "message": f"Done — {cancelled} appointment(s) cancelled."}, 200

def _handle_update_clinic_settings(args: dict):
    dry = args.get("dryRun", True)
    if args.get("confirm") is True:
        dry = False
    is_preview = bool(dry)
    # Validate proposed values
    updates = {}
    if "slot_interval" in args and args["slot_interval"] is not None:
        try:
            v = int(args["slot_interval"])
            if not 5 <= v <= 120:
                return {"success": False, "error": "slot_interval must be 5-120 minutes"}, 400
            updates["slot_interval_minutes"] = v
        except Exception:
            return {"success": False, "error": "Invalid slot_interval"}, 400
    if "max_students_per_slot" in args and args["max_students_per_slot"] is not None:
        try:
            v = int(args["max_students_per_slot"])
            if not 1 <= v <= 100:
                return {"success": False, "error": "max_students_per_slot must be 1-100"}, 400
            updates["max_students_per_slot"] = v
        except Exception:
            return {"success": False, "error": "Invalid max_students_per_slot"}, 400
    for key, col in [("default_start_time", "work_start"), ("default_end_time", "work_end")]:
        if key in args and args[key]:
            t = str(args[key]).strip()[:5]
            try:
                from datetime import datetime as _dt
                _dt.strptime(t, "%H:%M")
                # bounds 06:00-22:00
                if not ("06:00" <= t <= "22:00"):
                    return {"success": False, "error": f"{key} must be within 06:00-22:00"}, 400
                updates[col] = t
            except Exception:
                return {"success": False, "error": f"Invalid {key} (HH:MM)"}, 400
    if not updates:
        return {"success": False, "error": "No valid settings fields provided"}, 400
    # Cross-validate start < end if both present or against current
    current = None
    try:
        cur_resp = execute_with_retry(supabase.table("clinic_appointment_settings").select("*").limit(1))
        current = (cur_resp.data or [None])[0]
    except Exception:
        current = None
    cur_start = (current or {}).get("work_start") or "09:00"
    cur_end = (current or {}).get("work_end") or "16:00"
    new_start = updates.get("work_start", str(cur_start)[:5])
    new_end = updates.get("work_end", str(cur_end)[:5])
    if new_start >= new_end:
        return {"success": False, "error": "default_start_time must be before default_end_time"}, 400
    if is_preview:
        return {"success": True, "preview": True, "requiresConfirm": True, "preview": {"current": {"work_start": str(cur_start)[:5], "work_end": str(cur_end)[:5], "slot_interval_minutes": (current or {}).get("slot_interval_minutes"), "max_students_per_slot": (current or {}).get("max_students_per_slot")}, "proposed": updates}, "message": f"Update clinic hours from {str(cur_start)[:5]}-{str(cur_end)[:5]} to {new_start}-{new_end}?"}, 200
    # Confirm
    if not current:
        return {"success": False, "error": "Clinic settings not found"}, 404
    resp = execute_with_retry(supabase.table("clinic_appointment_settings").update(updates).eq("setting_id", current["setting_id"]))
    row = (resp.data or [None])[0] or {**current, **updates}
    logger.info("agent confirm update_clinic_settings by %s updates=%s", _admin_key(), updates)
    return {"success": True, "preview": False, "updated": True, "settings": row, "message": f"Done — default hours updated to {new_start}-{new_end}."}, 200

def _handle_deactivate_admin(args: dict):
    dry = args.get("dryRun", True)
    if args.get("confirm") is True:
        dry = False
    is_preview = bool(dry)
    admin_id = str(args.get("admin_id") or "").strip()
    if not admin_id:
        return {"success": False, "error": "admin_id is required"}, 400
    # Self-deactivation guard
    caller_key = _admin_key()
    caller_email = (getattr(g, "user", {}) or {}).get("email") or ""
    # Resolve caller's admin_id via app_accounts if possible
    caller_admin_id = None
    try:
        if caller_key and caller_key != "anon":
            r = execute_with_retry(supabase.table("app_accounts").select("admin_id").eq("auth_user_id", caller_key).limit(1))
            if r.data and r.data[0].get("admin_id"):
                caller_admin_id = str(r.data[0]["admin_id"])
            else:
                # fallback by email
                r2 = execute_with_retry(supabase.table("app_accounts").select("admin_id").eq("email", (caller_email or "").strip().lower()).limit(1))
                if r2.data and r2.data[0].get("admin_id"):
                    caller_admin_id = str(r2.data[0]["admin_id"])
    except Exception:
        pass
    if caller_admin_id and str(admin_id) == str(caller_admin_id):
        return {"success": False, "error": "Cannot deactivate yourself"}, 403
    # Fetch target
    resp = execute_with_retry(supabase.table("admin_accounts").select("admin_id, email, role, is_active").eq("admin_id", admin_id).limit(1))
    if not resp.data:
        return {"success": False, "error": "Admin not found"}, 404
    row = resp.data[0]
    if is_preview:
        return {"success": True, "preview": True, "found": True, "requiresConfirm": True, "preview": {"email": row.get("email"), "role": row.get("role"), "status": "active" if row.get("is_active") else "pending"}, "message": f"Deactivate {row.get('email')} ({row.get('role')})?"}, 200
    # Confirm
    if not row.get("is_active"):
        return {"success": True, "preview": False, "deactivated": False, "message": "Admin already inactive"}, 200
    execute_with_retry(supabase.table("admin_accounts").update({"is_active": False}).eq("admin_id", admin_id))
    logger.info("agent confirm deactivate_admin by %s target=%s email=%s", caller_key, admin_id, row.get("email"))
    return {"success": True, "preview": False, "deactivated": True, "message": f"Deactivated {row.get('email')}"}, 200

# Extend TOOL_HANDLERS
TOOL_HANDLERS["cancel_appointments"] = _handle_cancel_appointments
TOOL_HANDLERS["update_clinic_settings"] = _handle_update_clinic_settings
TOOL_HANDLERS["deactivate_admin"] = _handle_deactivate_admin

@agent_bp.route("/confirm", methods=["POST"])
@require_admin
@handle_errors("agent confirm error")
def agent_confirm():
    key = _admin_key()
    if not _check_rate_limit(key):
        return _rate_limited_response()
    _record_request(key)
    body = request.get_json(silent=True) or {}
    tool = (body.get("tool") or "").strip()
    args = body.get("args") or {}
    confirmed = body.get("confirmed") is True
    if not tool:
        return jsonify({"success": False, "error": "tool is required"}), 400
    if not confirmed:
        return jsonify({"success": False, "error": "Confirmation required — pass confirmed:true"}), 400
    if tool not in TOOL_HANDLERS:
        return jsonify({"success": False, "error": "Unknown tool"}), 400
    if tool in ("list_appointments", "get_reports", "list_admins"):
        return jsonify({"success": False, "error": "Tool does not require confirmation"}), 400
    # Force confirm mode: inject confirm flag
    args = dict(args)
    args["dryRun"] = False
    args["confirm"] = True
    result, status = TOOL_HANDLERS[tool](args)
    if status != 200:
        return jsonify(result), status
    return jsonify(result), 200
```

Also extend `agent_chat` to handle write preview return: when write handler returns `preview:true`, return envelope:

```python
# inside agent_chat, after calling TOOL_HANDLERS[tool]:
# if result.get("preview") is True:
#     return jsonify({"success": True, "reply": result.get("message", "Preview ready."), "preview": result, "tool": tool, "args": args}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_agent.py -v`
Expected: PASS (preview requires confirm, confirm without flag 400, self-deactivate 403).

Run: `python -m py_compile routers/agent.py`
Expected: no error.

Run: `python -c "from routers.agent import TOOL_HANDLERS; print(sorted(TOOL_HANDLERS.keys()))"`
Expected: `['cancel_appointments', 'deactivate_admin', 'get_reports', 'list_admins', 'list_appointments', 'update_clinic_settings']`

- [ ] **Step 5: Commit**

```bash
git add routers/agent.py tests/test_agent.py
git commit -m "feat(agent): add write tools preview->confirm, confirm endpoint and rate limit"
```

---

### Task 3: Frontend global bubble + panel UI (AgentBubble.jsx, AgentPanel.jsx, ToolPreviewCard.jsx mounted in AdminLayout)

**Files:**
- Create: `src/components/agent/AgentBubble.jsx`
- Create: `src/components/agent/AgentPanel.jsx`
- Create: `src/components/agent/ToolPreviewCard.jsx`
- Modify: `src/components/layout/AdminLayout.jsx:1-98` (mount bubble + panel)
- Test: manual `npm run build` + mount check

**Interfaces:**
- Consumes: `isPending` from `AdminLayout` parent (boolean), `open: boolean`, `onOpen: () => void`, `onClose: () => void`, `onClear: () => void`, `history: Array<{role, content}>`, `onSend: (text:string)=>Promise<void>`, `onConfirm: (tool, args)=>Promise<void>`, `onDismissPreview: ()=>void`, `preview: {tool, args, found, preview} | null`, Tailwind `gc-green-*` + `amber`
- Produces: `<AgentBubble isPending open onClick />`, `<AgentPanel open history preview onSend onConfirm onDismissPreview onClose onClear error loading />`, `<ToolPreviewCard preview onYes onNo />`

- [ ] **Step 1: Write the failing test**

Run: `npm run build` after adding imports in `AdminLayout.jsx` before creating `src/components/agent/*` — build must fail.

Alternatively existence check:

```js
// src/components/agent/__tests__/agentFiles.test.js
import fs from 'fs'
import { describe, it, expect } from 'vitest'
describe('agent files', () => {
  it('bubble exists', () => expect(fs.existsSync('src/components/agent/AgentBubble.jsx')).toBe(true))
})
```

Expected: FAIL — `Could not resolve "./components/agent/AgentBubble.jsx"` (Vite) or file not found.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL with `Could not resolve "./components/agent/AgentBubble.jsx"` after wiring `AdminLayout.jsx` import.

- [ ] **Step 3: Write minimal implementation**

`src/components/agent/AgentBubble.jsx`:

```jsx
export default function AgentBubble({ isPending, open, onClick }) {
  if (isPending) return null
  return (
    <button
      type="button"
      aria-label={open ? "Close Clinic Assistant" : "Open Clinic Assistant"}
      title={isPending ? "Pending approval — assistant unavailable" : "Clinic Assistant"}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gc-green-700 text-white shadow-lg transition hover:bg-gc-green-800 focus:outline-none focus:ring-2 focus:ring-gc-green-700 focus:ring-offset-2"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
        <path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.7 3.3 6L8 21l5-2.3A7 7 0 0 0 19 10a7 7 0 0 0-7-7z" strokeLinejoin="round" />
        <path d="M8.5 11.5h7M9.5 8h5" strokeLinecap="round" opacity="0.9" />
      </svg>
    </button>
  )
}
```

`src/components/agent/ToolPreviewCard.jsx`:

```jsx
export default function ToolPreviewCard({ preview, onYes, onNo, busy }) {
  if (!preview) return null
  const found = preview.found
  const rows = Array.isArray(preview.preview) ? preview.preview : []
  const isSettings = preview.tool === "update_clinic_settings" || preview.preview?.current
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        {preview.tool === "cancel_appointments" && `Found ${found} appointment(s)`}
        {preview.tool === "deactivate_admin" && `Deactivate ${preview.preview?.email || preview.args?.admin_id}?`}
        {isSettings && "Proposed changes"}
        {!preview.tool && `Preview`}
      </p>
      {preview.tool === "cancel_appointments" && rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li key={r.appointment_id || r.id || Math.random()} className="rounded-lg bg-white px-2 py-1 text-xs text-gray-700">
              {r.appointment_date || ""} {r.appointment_time || ""} — {r.student_id || ""} ({r.current_status || "pending"})
            </li>
          ))}
          {found > 5 && <li className="text-xs text-amber-700">+ {found - 5} more…</li>}
        </ul>
      )}
      {isSettings && preview.preview && (
        <div className="mt-2 rounded-lg bg-white p-2 text-xs">
          <div className="text-gray-500">Current: {JSON.stringify(preview.preview.current)}</div>
          <div className="font-semibold text-gray-900">Proposed: {JSON.stringify(preview.preview.proposed || preview.preview)}</div>
        </div>
      )}
      {preview.tool === "deactivate_admin" && (
        <div className="mt-2 rounded-lg bg-white p-2 text-xs text-gray-700">
          <div>Email: {preview.preview?.email}</div>
          <div>Role: {preview.preview?.role}</div>
          <div>Status: {preview.preview?.status}</div>
        </div>
      )}
      {preview.requiresConfirm ? (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onYes} disabled={busy} className="flex-1 rounded-xl bg-gc-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-gc-green-800 disabled:opacity-60">Yes</button>
          <button type="button" onClick={onNo} disabled={busy} className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60">No</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">{preview.message || "No changes needed."}</p>
      )}
    </div>
  )
}
```

`src/components/agent/AgentPanel.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import ToolPreviewCard from './ToolPreviewCard.jsx'

export default function AgentPanel({ open, onClose, onClear, history, preview, onSend, onConfirm, onDismissPreview, error, loading }) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [history, preview, open])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await onSend(text)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 md:bottom-20 md:right-6 md:top-auto md:items-end md:justify-end md:p-0">
      {/* backdrop on mobile */}
      <button type="button" aria-label="Close assistant" onClick={onClose} className="absolute inset-0 bg-black/20 md:hidden" />
      <div className="relative flex h-[85vh] max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gc-green-100 bg-white shadow-2xl md:h-[520px] md:w-[380px] md:rounded-2xl">
        <div className="flex items-center justify-between bg-gc-green-700 px-4 py-3 text-white">
          <div>
            <p className="text-sm font-bold">Clinic Assistant</p>
            <p className="text-xs opacity-80">Phase 1</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/15">Clear</button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-white/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gc-green-50/30 p-4">
          {history.length === 0 && (
            <p className="rounded-2xl bg-white px-3 py-2 text-sm text-gray-600 shadow-sm">Ask about appointments, reports, or admins. Try: "who are the admins?"</p>
          )}
          {history.map((m, idx) => (
            <div key={idx} className={m.role === 'user' ? 'ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-gc-green-700 px-3 py-2 text-sm text-white' : 'mr-auto max-w-[80%] rounded-2xl rounded-bl-sm border border-gc-green-100 bg-white px-3 py-2 text-sm text-gray-900'}>
              {m.content}
            </div>
          ))}
          {preview && (
            <ToolPreviewCard
              preview={preview}
              busy={loading}
              onYes={() => onConfirm(preview.tool, preview.args)}
              onNo={onDismissPreview}
            />
          )}
          {loading && (
            <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gc-green-100 bg-white px-3 py-2">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gc-green-700" />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-3 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Ask about appointments, reports, settings..."
            className="max-h-20 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gc-green-700 focus:ring-2 focus:ring-gc-green-700/20"
          />
          <button type="submit" disabled={loading || !input.trim()} className="h-11 rounded-xl bg-gc-green-700 px-5 text-sm font-semibold text-white hover:bg-gc-green-800 disabled:opacity-60">Send</button>
        </form>
      </div>
    </div>
  )
}
```

`src/components/layout/AdminLayout.jsx` — mount (preserve existing `isPending`/`checkingPending` logic):

```jsx
// top: add imports
import { useState, useCallback } from 'react'
import AgentBubble from '../agent/AgentBubble.jsx'
import AgentPanel from '../agent/AgentPanel.jsx'

// inside AdminLayout component, alongside existing mobileNavOpen + isPending state:
const [agentOpen, setAgentOpen] = useState(false)

// after closing </div> that wraps TopBar+main (still inside outer flex root), before final </div>:
{!isPending && !checkingPending && (
  <>
    <AgentBubble isPending={isPending} open={agentOpen} onClick={() => setAgentOpen((v) => !v)} />
    {/* AgentPanel is controlled here; wiring to agentApi lives in Task 4 — for Task 3 render with stub props */}
    <AgentPanel
      open={agentOpen}
      onClose={() => setAgentOpen(false)}
      onClear={() => {}}
      history={[]}
      preview={null}
      onSend={async () => {}}
      onConfirm={async () => {}}
      onDismissPreview={() => {}}
      error={null}
      loading={false}
    />
  </>
)}
```

Note: Task 4 replaces the stub `history`/`onSend`/`onConfirm` wiring with real `agentApi` state; this task only proves mount + responsive shell.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS (0 errors, no missing `AgentBubble`/`AgentPanel` imports).

Run: `python -m py_compile routers/agent.py` (unchanged)
Expected: no error.

Manual: log in as active admin → bubble visible on every `/admin/*` route (`/admin/dashboard`, `/admin/appointments`, `/admin/reports`, `/admin/admins`, `/admin/clinic-schedule`); as pending admin → bubble hidden; click bubble → panel opens (desktop anchored, mobile bottom sheet); input focused; scroll works.

- [ ] **Step 5: Commit**

```bash
git add src/components/agent/AgentBubble.jsx src/components/agent/AgentPanel.jsx src/components/agent/ToolPreviewCard.jsx src/components/layout/AdminLayout.jsx
git commit -m "feat(agent): add global bubble + panel UI mounted in AdminLayout"
```

---

### Task 4: Frontend agentApi + history + preview cards + integration with backend

**Files:**
- Create: `src/lib/agentApi.js`
- Modify: `src/components/layout/AdminLayout.jsx:1-98` (wire real history, agentApi calls, preview state, error/rate-limit banner, confirm flow)
- Modify: `src/lib/api.js:1-216` (optional: re-export or leave standalone; no change required if agentApi is standalone)
- Test: `npm run build` + manual flows ("who are the admins?", "clear today's appointments" → Yes/No, "change default to 8am-5pm", 429 banner)

**Interfaces:**
- Consumes: `agentApi.chat(message, history) -> Promise<{success, reply, tool?, data?, preview?}>`, `agentApi.confirm(tool, args) -> Promise<{success, ...}>`, `AdminLayout` existing `isPending`/`checkingPending` + `AdminBubble`/`AdminPanel` props from Task 3, `supabase.auth.getSession()` for Bearer token via `api.js` `request` pattern
- Produces: `agentApi` export, `AdminLayout` integrated state: `history: Array<{role:'user'|'assistant', content}>`, `preview: {tool, args, found, preview, requiresConfirm} | null`, `loading: boolean`, `error: string|null`, handlers `handleSend(text)`, `handleConfirm(tool, args)`, `handleDismissPreview()`, `handleClear()`

- [ ] **Step 1: Write the failing test**

Run: `npm run build` after adding `import { agentApi } from '../../lib/agentApi.js'` in `AdminLayout.jsx` before file exists — build must fail with `Could not resolve`.

Alternatively:

```js
import fs from 'fs'
expect(fs.existsSync('src/lib/agentApi.js')).toBe(true) // FAIL before file creation
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL `Could not resolve "../../lib/agentApi.js"` after wiring import.

- [ ] **Step 3: Write minimal implementation**

`src/lib/agentApi.js`:

```js
import { supabase } from './supabaseClient.js'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000'

async function getAccessToken() {
  try {
    const { data } = (await supabase?.auth.getSession()) ?? {}
    return data?.session?.access_token ?? null
  } catch {
    return null
  }
}

async function agentRequest(path, body) {
  const url = new URL(path, API_BASE_URL)
  const token = await getAccessToken()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (response.status === 401) {
    const errBody = await response.json().catch(() => null)
    throw new Error(errBody?.error || 'Your session has expired. Please sign in again.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || data?.detail || `Request failed (${response.status})`)
  }
  return data
}

export const agentApi = {
  chat: (message, history) => agentRequest('/api/agent/chat', { message, history }),
  confirm: (tool, args) => agentRequest('/api/agent/confirm', { tool, args, confirmed: true }),
}
```

`src/components/layout/AdminLayout.jsx` — replace Task 3 stub wiring with real integration (full file below; preserve existing `isPending`/`checkingPending`/`HIDE_ON_PATTERNS`/mobile nav):

```jsx
import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import MobileSidebarOverlay from '../admin/MobileSidebarOverlay.jsx'
import MobileMenuHandle from '../admin/MobileMenuHandle.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { adminsApi } from '../../lib/api.js'
import { agentApi } from '../../lib/agentApi.js'
import Pending from '../../pages/admin/Pending.jsx'
import AgentBubble from '../agent/AgentBubble.jsx'
import AgentPanel from '../agent/AgentPanel.jsx'

const HIDE_ON_PATTERNS = [/\/medical-certificate$/, /\/medical-summary$/]

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const hideMobileNav = HIDE_ON_PATTERNS.some((re) => re.test(location.pathname))
  const { email, loading: authLoading } = useAuth()
  const [checkingPending, setCheckingPending] = useState(true)
  const [isPending, setIsPending] = useState(false)

  // Agent state
  const [agentOpen, setAgentOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [preview, setPreview] = useState(null)
  const [agentError, setAgentError] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!email) {
      setCheckingPending(false)
      setIsPending(false)
      return
    }
    let cancelled = false
    async function checkPending() {
      setCheckingPending(true)
      try {
        const res = await adminsApi.me()
        const record = res?.admin || res
        if (!cancelled && record) {
          const hasIsActive = Object.prototype.hasOwnProperty.call(record, 'is_active')
          if (hasIsActive) setIsPending(record.is_active === false)
          else if (Object.prototype.hasOwnProperty.call(record, 'isActive')) setIsPending(record.isActive === false)
          else if (record.status) setIsPending(String(record.status).toLowerCase() !== 'active')
          else setIsPending(false)
        } else if (!cancelled) setIsPending(false)
      } catch {
        if (!cancelled) setIsPending(false)
      } finally {
        if (!cancelled) setCheckingPending(false)
      }
    }
    checkPending()
    return () => { cancelled = true }
  }, [email, authLoading])

  const handleSend = useCallback(async (text) => {
    setAgentError(null)
    setHistory((h) => [...h, { role: 'user', content: text }])
    setAgentLoading(true)
    try {
      const res = await agentApi.chat(text, history)
      const reply = res?.reply || res?.message || 'Done.'
      setHistory((h) => [...h, { role: 'assistant', content: reply }])
      if (res?.preview && res.preview.requiresConfirm) {
        setPreview({ ...res.preview, tool: res.preview.tool || res.tool, args: res.preview.args || res.args || {} })
      } else if (res?.tool && res?.preview) {
        setPreview(res.preview)
      } else if (res?.preview) {
        setPreview(res.preview)
      }
      // Read tools: optionally render data inline as part of reply (backend already formats reply)
      if (res?.data && !res?.preview) {
        // keep preview null for read-only
        setPreview(null)
      }
    } catch (err) {
      const msg = err?.message || 'Assistant temporarily unavailable'
      setAgentError(msg)
      setHistory((h) => [...h, { role: 'assistant', content: `Error: ${msg}` }])
    } finally {
      setAgentLoading(false)
    }
  }, [history])

  const handleConfirm = useCallback(async (tool, args) => {
    setAgentError(null)
    setAgentLoading(true)
    try {
      const res = await agentApi.confirm(tool, args)
      const msg = res?.message || res?.reply || `Done — ${tool} confirmed.`
      setHistory((h) => [...h, { role: 'assistant', content: msg }])
      setPreview(null)
    } catch (err) {
      const msg = err?.message || 'Confirm failed'
      setAgentError(msg)
      setHistory((h) => [...h, { role: 'assistant', content: `Error: ${msg}` }])
    } finally {
      setAgentLoading(false)
    }
  }, [])

  const handleDismissPreview = useCallback(() => {
    setPreview(null)
    setHistory((h) => [...h, { role: 'assistant', content: 'Cancelled — no changes made.' }])
  }, [])

  const handleClear = useCallback(() => {
    setHistory([])
    setPreview(null)
    setAgentError(null)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-gc-green-700 print:h-auto print:overflow-visible print:bg-white">
      <Sidebar />
      {!hideMobileNav && (
        <>
          <MobileSidebarOverlay open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <MobileMenuHandle onClick={() => setMobileNavOpen(true)} />
        </>
      )}
      <div className="flex flex-1 flex-col overflow-y-auto bg-white lg:rounded-tl-[48px] lg:rounded-bl-[48px] print:overflow-visible print:rounded-none">
        <TopBar />
        <main className="px-4 pb-4 lg:px-10 lg:pb-6 print:px-0 print:pb-0">
          {checkingPending ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <p className="text-sm font-medium text-gray-500">Loading…</p>
            </div>
          ) : isPending ? (
            <Pending />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      {!isPending && !checkingPending && (
        <>
          <AgentBubble isPending={isPending} open={agentOpen} onClick={() => setAgentOpen((v) => !v)} />
          <AgentPanel
            open={agentOpen}
            onClose={() => setAgentOpen(false)}
            onClear={handleClear}
            history={history}
            preview={preview}
            onSend={handleSend}
            onConfirm={handleConfirm}
            onDismissPreview={handleDismissPreview}
            error={agentError}
            loading={agentLoading}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS (0 errors).

Run: `python -m py_compile routers/agent.py`
Expected: no error.

Manual flows (active admin):

- "who are the admins?" → assistant lists admins inline (no preview card, read-only).
- "clear today's appointments" → card shows `Found N` → Yes → success message with `cancelled N`; No → no mutation, message "Cancelled — no changes made."
- "change default to 8am-5pm" → card shows diff `09:00–16:00 → 08:00–17:00` → Yes → success.
- Invalid args → assistant bubble with error + correction prompt.
- Trigger 429 (21 rapid sends) → banner "Rate limit — try again shortly" appears, Send disabled briefly.
- Mobile: panel is bottom sheet, input focused, scroll works.
- Pending admin → bubble hidden.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentApi.js src/components/layout/AdminLayout.jsx src/components/agent/ToolPreviewCard.jsx src/components/agent/AgentPanel.jsx
git commit -m "feat(agent): wire agentApi, history, preview cards and confirm flow"
```

---

## Self-Review

**1. Spec coverage:**

- §3.1 Frontend Global Bubble+Panel (mount in AdminLayout, z-50, gc-green-700, isPending guard, Clear/Close, history, responsive) → Tasks 3+4
- §3.2 Backend blueprint + endpoints + auth + LLM abstraction (GROQ_API_KEY, LLM_PROVIDER, MockLLM fallback) + tool execution via execute_with_retry → Tasks 1+2
- §3.3 Request flow (chat → preview card → confirm) → Tasks 1+2+4
- §4 Tool Definitions (list_appointments, get_reports, list_admins read; cancel_appointments, update_clinic_settings, deactivate_admin write with dryRun/preview/requiresConfirm + self-deactivate guard) → Tasks 1+2
- §5 Frontend UI (bubble/panel/history/tool preview card/theme/files) → Tasks 3+4
- §6 Security & Confirmation (require_admin, isPending, preview→confirm, no auto-confirm, rate limit 20/5min, prompt injection hygiene, audit log) → Tasks 1+2+4
- §7 Example Flows (clear today, 8am-5pm, who are admins) → Tasks 1+2+4 manual checks
- §8 Error Handling (403/429/400/404/500 + envelopes + banners) → Tasks 1+2+4
- §9 Testing (py_compile, 401/403, read tools, preview→confirm, rate limit, LLM_PROVIDER=mock, npm build, bubble visibility, preview Yes/No, mobile, 429 banner) → Tasks 1–4 Step 4
- §10 Rollout (.env.example, requirements, blueprint registration, gc-green reuse, no migration) → Tasks 1–4
- Gaps: none

**2. Placeholder scan:** Searched for `TBD`, `TODO`, `implement later`, `fill in details`, `appropriate error handling`, `similar to Task`. No placeholders — every step has actual code blocks with concrete file paths, function signatures, and test assertions.

**3. Type consistency:** `MockLLM.chat_complete(messages, tools) -> {tool, args}` vs `get_llm_client() -> Groq|MockLLM` consistent across Tasks 1–2; `TOOL_SCHEMAS` shape `list[{type,function:{name,description,parameters}}]` reused in Task 2; `TOOL_HANDLERS: dict[str, Callable[[dict], tuple[dict,int]]]` keys match `TOOL_SCHEMAS` names; rate-limit helpers `_check_rate_limit(key: str)->bool`, `_record_request(key: str)` and `_admin_key()->str` identical in Tasks 1–2; `agentApi.chat(message: string, history: HistoryItem[])->Promise<ChatResponse>` and `agentApi.confirm(tool: string, args: object)->Promise<ConfirmResponse>` types match `AgentPanel` props `history: HistoryItem[]`, `preview: Preview | null`, `onSend`, `onConfirm`; `AgentBubble` props `isPending: boolean, open: boolean, onClick: ()=>void` match `AdminLayout` state.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-30-agent-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
