"""Redis counters for crisis strikes and parent-alert cooldown (same REDIS_URL as session memory)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass
class CrisisRedisStore:
    redis_client: Optional[object] = None
    key_prefix: str = "graphrag:crisis"
    ttl_strikes_sec: int = 90 * 24 * 3600
    ttl_parent_sent_sec: int = 30 * 24 * 3600
    strike_threshold: int = 1
    available: bool = False
    last_error: Optional[str] = None

    @classmethod
    def from_env(cls) -> "CrisisRedisStore":
        store = cls(
            key_prefix=(os.getenv("CRISIS_REDIS_KEY_PREFIX") or "graphrag:crisis").strip(),
            ttl_strikes_sec=max(3600, _env_int("CRISIS_STRIKES_TTL_SECONDS", 90 * 24 * 3600)),
            ttl_parent_sent_sec=max(3600, _env_int("CRISIS_PARENT_COOLDOWN_SECONDS", 30 * 24 * 3600)),
            strike_threshold=max(1, _env_int("CRISIS_STRIKE_THRESHOLD", 1)),
        )
        redis_url = (os.getenv("REDIS_URL") or "").strip()
        if not redis_url:
            store.last_error = "REDIS_URL not set"
            return store
        try:
            import redis  # type: ignore

            client = redis.Redis.from_url(redis_url, decode_responses=True)
            client.ping()
            store.redis_client = client
            store.available = True
            return store
        except Exception as exc:  # pragma: no cover
            store.last_error = str(exc)
            return store

    def _strikes_key(self, user_id: int) -> str:
        return f"{self.key_prefix}:strikes:{int(user_id)}"

    def _sent_key(self, user_id: int) -> str:
        return f"{self.key_prefix}:parent_sent:{int(user_id)}"

    def parent_alert_sent_recently(self, user_id: int) -> bool:
        if not self.available or not self.redis_client:
            return False
        try:
            return bool(self.redis_client.exists(self._sent_key(user_id)))
        except Exception:  # pragma: no cover
            return False

    def incr_crisis_strike(self, user_id: int) -> int:
        """Increment strike counter when a crisis turn is detected; returns new total."""
        if not self.available or not self.redis_client:
            return 0
        key = self._strikes_key(user_id)
        try:
            n = int(self.redis_client.incr(key))
            self.redis_client.expire(key, self.ttl_strikes_sec)
            return n
        except Exception:  # pragma: no cover
            return 0

    def reset_strikes(self, user_id: int) -> None:
        if not self.available or not self.redis_client:
            return
        try:
            self.redis_client.delete(self._strikes_key(user_id))
        except Exception:  # pragma: no cover
            pass

    def mark_parent_alert_sent(self, user_id: int) -> None:
        if not self.available or not self.redis_client:
            return
        try:
            self.redis_client.setex(self._sent_key(user_id), self.ttl_parent_sent_sec, "1")
        except Exception:  # pragma: no cover
            pass
