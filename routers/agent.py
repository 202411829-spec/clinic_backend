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
    return str(
        (getattr(g, "user", {}) or {}).get("id")
        or (getattr(g, "user", {}) or {}).get("email")
        or "anon"
    )


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
                    "status": {
                        "type": "string",
                        "enum": ["pending", "approved", "completed", "cancelled", "no_show"],
                    },
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
        text = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                text = (m.get("content") or "").lower()
                break
        # deactivate/cancel/settings have higher priority than generic list
        if "deactivate" in text or ("disable" in text and "admin" in text):
            m = re.search(r"[0-9a-f-]{8,}", text)
            return {
                "tool": "deactivate_admin",
                "args": {
                    "admin_id": m.group(0) if m else "unknown",
                    "dryRun": True,
                },
            }
        if "clear" in text or "cancel" in text:
            dm = re.search(r"\d{4}-\d{2}-\d{2}", text)
            d = dm.group(0) if dm else date_type.today().isoformat()
            if "today" in text:
                d = date_type.today().isoformat()
            return {"tool": "cancel_appointments", "args": {"date": d, "dryRun": True}}
        if "hour" in text or "8am" in text or "5pm" in text or "settings" in text or "slot" in text:
            return {
                "tool": "update_clinic_settings",
                "args": {
                    "default_start_time": "08:00",
                    "default_end_time": "17:00",
                    "dryRun": True,
                },
            }
        if "who are the admins" in text or ("admin" in text and "list" in text):
            return {"tool": "list_admins", "args": {"search": ""}}
        if "report" in text:
            return {"tool": "get_reports", "args": {}}
        if "appointment" in text:
            dm = re.search(r"\d{4}-\d{2}-\d{2}", text)
            if dm:
                return {"tool": "list_appointments", "args": {"date": dm.group(0)}}
            return {"tool": "list_appointments", "args": {}}
        return {
            "reply": (
                "I can help with appointments, reports, admins, cancelling, "
                "and clinic settings. Try: 'who are the admins?' or "
                "'clear today's appointments'."
            )
        }


def get_llm_client():
    provider = (
        os.getenv("LLM_PROVIDER")
        or ("groq" if os.getenv("GROQ_API_KEY") else "mock")
    ).strip().lower()
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
        try:
            from routers.agent_ollama import OllamaClient
            return OllamaClient(base_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"))
        except Exception:
            return MockLLM()
    return MockLLM()


SYSTEM_PROMPT = (
    "You are the Gordon College Clinic Assistant (Phase 1). "
    "You help admins with appointments, reports, admin roster, cancelling "
    "appointments, clinic settings, and deactivating admins. "
    "Always call write tools with dryRun=true first and return a preview; "
    "never mutate without explicit confirmation. "
    "Available tools: list_appointments, get_reports, list_admins, "
    "cancel_appointments, update_clinic_settings, deactivate_admin. "
    "Current date is {today}. Admin is {email}."
)


# ---- Read tool handlers (reuse existing logic via execute_with_retry) ----
def _handle_list_appointments(args: dict):
    q = (
        supabase.table("appointments")
        .select("*", count="exact")
        .order("appointment_date", desc=False)
        .order("appointment_time", desc=False)
    )
    if args.get("date"):
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

        rpc = execute_with_retry(
            _supa.rpc(
                "report_breakdown",
                {
                    "p_report_date": str(d)[:10],
                    "p_department_id": int(dept) if dept else None,
                },
            )
        )
        if isinstance(rpc.data, dict):
            status_rows = rpc.data.get("current_status") or []
            total = sum(r.get("count", 0) for r in status_rows)
            return {
                "success": True,
                "date": d,
                "total_appointments": total,
                "breakdowns": rpc.data,
            }, 200
    except Exception:
        pass
    q = supabase.table("report_appointment_rows").select("*").eq(
        "appointment_date", str(d)[:10]
    )
    if dept:
        try:
            q = q.eq("department_id", int(dept))
        except Exception:
            pass
    rows = execute_with_retry(q).data or []
    return {
        "success": True,
        "count": len(rows),
        "reports": rows,
        "date": d,
    }, 200


def _handle_list_admins(args: dict):
    search = sanitize_search(args.get("search"))
    q = (
        supabase.table("admin_accounts")
        .select("*", count="exact")
        .order("created_at", desc=True)
    )
    if search:
        like = f"%{search}%"
        q = q.or_(
            f"email.ilike.{like},username.ilike.{like},"
            f"first_name.ilike.{like},last_name.ilike.{like},role.ilike.{like}"
        )
    q = q.range(0, 19)
    resp = execute_with_retry(q)
    rows = resp.data or []
    # attach has_app_account for status
    admin_ids = [r.get("admin_id") for r in rows if r.get("admin_id") is not None]
    has_account = set()
    if admin_ids:
        acct = execute_with_retry(
            supabase.table("app_accounts")
            .select("admin_id")
            .in_("admin_id", admin_ids)
        )
        has_account = {
            r.get("admin_id") for r in (acct.data or []) if r.get("admin_id")
        }

    def _status(is_active, has_acct):
        if is_active and has_acct:
            return "active"
        if not is_active:
            return "pending"
        return "pending"

    admins = []
    for r in rows:
        aid = r.get("admin_id")
        admins.append(
            {
                "admin_id": aid,
                "email": r.get("email"),
                "username": r.get("username"),
                "first_name": r.get("first_name"),
                "last_name": r.get("last_name"),
                "role": r.get("role"),
                "is_active": r.get("is_active"),
                "status": _status(
                    bool(r.get("is_active")), aid in has_account
                ),
            }
        )
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
    # Groq path
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
    if not isinstance(history, list):
        history = []
    history = history[-20:]

    messages = []
    for h in history:
        if (
            isinstance(h, dict)
            and h.get("role") in ("user", "assistant")
            and h.get("content")
        ):
            messages.append({"role": h["role"], "content": str(h["content"])[:4000]})
    messages.append({"role": "user", "content": message})

    llm_out = _call_llm(messages)

    if "reply" in llm_out and "tool" not in llm_out:
        return jsonify({"success": True, "reply": llm_out["reply"]}), 200

    tool = llm_out.get("tool")
    args = llm_out.get("args") or {}

    if tool not in TOOL_HANDLERS:
        # Write tools not yet wired in Task 1 — return preview scaffolding
        if tool in ("cancel_appointments", "update_clinic_settings", "deactivate_admin"):
            return jsonify({
                "success": True,
                "reply": "That action requires confirmation — preview is being prepared.",
                "preview": {"requiresConfirm": True, "tool": tool, "args": args},
            }), 200
        logger.warning("Unknown tool from LLM: %s", tool)
        return jsonify({
            "success": True,
            "reply": "I couldn't handle that — try rephrasing.",
        }), 200

    result, status = TOOL_HANDLERS[tool](args)
    if status != 200:
        return jsonify(result), status

    reply_map = {
        "list_appointments": f"Found {result.get('count', 0)} appointment(s).",
        "get_reports": f"Reports for {result.get('date')}: {result.get('count', result.get('total_appointments', 0))} row(s).",
        "list_admins": f"Found {result.get('count', 0)} admin(s).",
    }
    return jsonify({
        "success": True,
        "reply": reply_map.get(tool, "Done."),
        "tool": tool,
        "data": result,
    }), 200
