# Shared Supabase client for all backend routers.
#
# Kept as a thin re-export of supabase_client so there is exactly ONE
# place that configures the client (env vars, validation, service-role
# key). Routers may import from either module name — they get the same
# instance either way.
from supabase_client import supabase

__all__ = ["supabase"]
