"""Shared cache module with optional Redis backend and in-memory fallback.

Provides a unified get_cache(key)/set_cache(key, value, ttl_seconds) API.
Values must be JSON-serializable.

Redis is optional: if REDIS_URL env var is missing or redis-py is not
installed, or if the Redis connection fails at runtime, the module
gracefully falls back to an in-memory TTL dictionary cache (per-worker,
not shared across workers — but acceptable for development and small
deployments).
"""

import json
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Try importing redis-py. If unavailable, we fall back to in-memory only.
# ---------------------------------------------------------------------------
_redis_client = None
_redis_available = False

try:
    import redis

    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        _redis_client = redis.Redis.from_url(
            redis_url,
            socket_timeout=1,
            socket_connect_timeout=1,
            decode_responses=True,
        )
        # Test connection at import time — if it fails, we degrade gracefully.
        _redis_client.ping()
        _redis_available = True
        logger.info("Redis cache connected (%s)", redis_url.split("@")[-1])
except Exception as exc:
    _redis_client = None
    _redis_available = False
    logger.info("Redis unavailable, using in-memory cache: %s", exc)


# ---------------------------------------------------------------------------
# In-memory TTL cache (per-process, shared via lock)
# ---------------------------------------------------------------------------
_mem_cache: dict[str, tuple[object, float]] = {}
_mem_lock = threading.Lock()


def get_cache(key: str) -> object | None:
    """Return cached value for *key*, or None if missing/expired."""
    now = time.time()

    # Try Redis first
    if _redis_available and _redis_client is not None:
        try:
            raw = _redis_client.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Redis get failed for %s: %s", key, exc)
            # Fall through to in-memory — don't crash the app.

    # In-memory fallback
    with _mem_lock:
        entry = _mem_cache.get(key)
        if entry is not None:
            value, expires_at = entry
            if now < expires_at:
                return value
            del _mem_cache[key]

    return None


def set_cache(key: str, value: object, ttl_seconds: int = 60) -> None:
    """Store *value* under *key* for *ttl_seconds*."""
    now = time.time()

    # Try Redis first
    if _redis_available and _redis_client is not None:
        try:
            _redis_client.setex(key, ttl_seconds, json.dumps(value))
        except Exception as exc:
            logger.warning("Redis set failed for %s: %s", key, exc)
            # Fall through to in-memory — don't crash the app.

    # Always write to in-memory too (so a process that couldn't reach Redis
    # still has a local hit for subsequent requests within the same worker).
    with _mem_lock:
        _mem_cache[key] = (value, now + ttl_seconds)
        # Simple expiry sweep: if the dict grows past 500 entries, drop
        # expired ones.  Prevents unbounded memory growth on long-lived
        # workers.  Not a hot path — runs only when cache is large.
        if len(_mem_cache) > 500:
            expired = [k for k, (_, exp) in _mem_cache.items() if now >= exp]
            for k in expired:
                del _mem_cache[k]


def invalidate_cache(key: str) -> None:
    """Remove *key* from both backends (best-effort)."""
    if _redis_available and _redis_client is not None:
        try:
            _redis_client.delete(key)
        except Exception:
            pass

    with _mem_lock:
        _mem_cache.pop(key, None)
