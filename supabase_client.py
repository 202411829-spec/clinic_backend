"""
Shared Supabase client. Routers import `supabase` from here instead of
from main.py, to avoid circular imports as more modules get added.
"""

import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

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
