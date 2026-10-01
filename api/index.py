"""Vercel serverless entrypoint.

Vercel only serves Python functions under /api/*, so every request the browser
makes arrives here with an /api prefix. Our Flask routes are a mix: some are
already registered with the prefix (/api/masterlist/..., /api/reports/,
/api/admins/..., /api/auth/..., /api/records/..., /api/agent/...) and the rest
live at the root (/health, /reasons, /appointments, /logbook, ...).

A plain DispatcherMiddleware mount cannot handle that mix because it strips the
/api prefix unconditionally, which sends /api/masterlist/students to Flask as
/masterlist/students and 404s. The middleware below decides per request: if the
path without the prefix is a real route we strip it, otherwise we keep the
prefix. SCRIPT_NAME is set so url_for() still emits /api/... URLs.
"""
from werkzeug.exceptions import NotFound
from werkzeug.routing import RequestRedirect

from main import app as flask_app

# Ask Flask's own url_map whether a path is routable. Doing it this way handles
# converters (/api/masterlist/students/<student_id>) without us re-implementing
# pattern matching.
_adapter = flask_app.url_map.bind("vercel.local")


def _is_routable(path: str) -> bool:
    """True if Flask has a rule that matches this internal path."""
    try:
        _adapter.match(path)
    except NotFound:
        return False
    except RequestRedirect:
        # A redirect (usually a missing trailing slash) means the path exists.
        return True
    return True


def _decide(path: str):
    """Return (script_name, path_info) for an incoming request path."""
    if path == "/api":
        # The mounted root route.
        return "/api", "/"
    if not path.startswith("/api/"):
        # Bare path (direct Flask access): pass through untouched.
        return "", path

    without_prefix = path[len("/api"):]
    if _is_routable(without_prefix):
        # Root-level route such as /api/reasons -> /reasons.
        return "/api", without_prefix
    # Already-prefixed route such as /api/masterlist/students.
    return "", path


def application(environ, start_response):
    """WSGI callable: rewrite /api paths, then hand off to Flask."""
    path = environ.get("PATH_INFO", "") or "/"
    script_name, path_info = _decide(path)

    environ["PATH_INFO"] = path_info
    environ["SCRIPT_NAME"] = script_name
    return flask_app(environ, start_response)