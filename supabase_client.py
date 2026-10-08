"""
Shared Supabase client. Routers import `supabase` from here instead of
from main.py, to avoid circular imports as more modules get added.
"""

import logging
import os

from dotenv import load_dotenv
from supabase import create_client

logger = logging.getLogger(__name__)

load_dotenv()

# Why: supabase-py's httpx transport honours HTTP_PROXY / HTTPS_PROXY /
# ALL_PROXY from the environment, so an inherited or dead proxy makes
# auth.get_user() fail and valid tokens surface as 401s. Stripped here —
# the one place the client is built, reached by every entry point — so
# startup behaves the same regardless of the shell's proxy settings.
_proxy_names = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")
_cleared = [name for name in list(os.environ) if name.upper() in _proxy_names]
for name in _cleared:
    del os.environ[name]
if _cleared:
    logger.warning(
        "Cleared proxy env vars before Supabase client init: %s",
        ", ".join(_cleared),
    )

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env. "
        "Use the service_role key here, not the publishable key — most "
        "tables have RLS enabled with no anon/authenticated policies, so "
        "the publishable key silently gets empty results back."
    )

supabase = create_client(url, key)
