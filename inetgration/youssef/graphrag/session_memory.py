"""Redis-backed short-term session memory for chat turns."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _env_int(name: str, default: int, *, lo: Optional[int] = None, hi: Optional[int] = None) -> int:
    raw = (os.getenv(name) or "").strip()
    v = default
    if raw:
        try:
            v = int(raw)
        except ValueError:
            v = default
    if lo is not None:
        v = max(lo, v)
    if hi is not None:
        v = min(hi, v)
    return v


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class SessionMemoryStore:
    """Short-term memory backed by Redis lists."""

    redis_client: Optional[object] = None
    key_prefix: str = "graphrag:session_memory"
    ttl_seconds: int = 24 * 60 * 60
    max_turns: int = 10
    max_voice_turns: int = 30
    available: bool = False
    last_error: Optional[str] = None

    @classmethod
    def from_env(cls) -> "SessionMemoryStore":
        store = cls(
            key_prefix=(os.getenv("SESSION_MEMORY_KEY_PREFIX") or "graphrag:session_memory").strip(),
            ttl_seconds=max(60, _env_int("SESSION_MEMORY_TTL_SECONDS", 24 * 60 * 60)),
            max_turns=max(1, _env_int("SESSION_MEMORY_MAX_TURNS", 10)),
            max_voice_turns=max(1, _env_int("SESSION_VOICE_HISTORY_MAX", 30)),
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
        except Exception as exc:  # pragma: no cover - environment specific
            store.last_error = str(exc)
            return store

    def _key(self, session_id: str) -> str:
        return f"{self.key_prefix}:{session_id}"

    def _mood_key(self, session_id: str) -> str:
        return f"{self.key_prefix}:mood:{session_id}"

    def _voice_history_key(self, session_id: str) -> str:
        return f"{self.key_prefix}:voice_history:{session_id}"

    @staticmethod
    def _trim_xai_for_redis(xai: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not xai:
            return None
        out: Dict[str, Any] = {}
        cap = _env_int("SESSION_VOICE_XAI_B64_MAX_CHARS", 220_000, lo=10_000, hi=500_000)
        for key in ("spectrogram_png_b64", "waveform_png_b64"):
            v = xai.get(key)
            if isinstance(v, str) and len(v) > cap:
                out[key] = ""
            else:
                out[key] = v if isinstance(v, str) else ""
        fs = xai.get("frequency_summary")
        out["frequency_summary"] = fs if isinstance(fs, dict) else {}
        cap_txt = _env_int("SESSION_VOICE_XAI_CAPTION_MAX", 2000, lo=200, hi=8000)
        cap_c = str(xai.get("caption") or "")[:cap_txt]
        out["caption"] = cap_c
        return out

    def append_voice_turn(self, session_id: str, record: Dict[str, Any]) -> None:
        """Append one voice analysis record (newest first in Redis list, returned chronological by getter)."""
        if not self.available or not self.redis_client:
            return
        key = self._voice_history_key(session_id)
        rec = dict(record)
        rec["stored_at"] = _utc_iso()
        xai = rec.get("xai")
        if isinstance(xai, dict):
            rec["xai"] = self._trim_xai_for_redis(xai)
        try:
            raw = json.dumps(rec, ensure_ascii=False)
            if len(raw) > 480_000:
                rec.pop("xai", None)
                raw = json.dumps(rec, ensure_ascii=False)
        except (TypeError, ValueError):
            return
        try:
            pipe = self.redis_client.pipeline()
            pipe.lpush(key, raw)
            pipe.ltrim(key, 0, self.max_voice_turns - 1)
            pipe.expire(key, self.ttl_seconds)
            pipe.execute()
        except Exception:  # pragma: no cover
            return

    def get_voice_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Chronological voice records (oldest first)."""
        if not self.available or not self.redis_client:
            return []
        key = self._voice_history_key(session_id)
        try:
            rows = self.redis_client.lrange(key, 0, self.max_voice_turns - 1)
        except Exception:  # pragma: no cover
            return []
        out: List[Dict[str, Any]] = []
        for raw in reversed(rows):
            try:
                out.append(json.loads(raw))
            except Exception:
                continue
        return out

    def clear_voice_history(self, session_id: str) -> None:
        if not self.available or not self.redis_client:
            return
        key = self._voice_history_key(session_id)
        try:
            self.redis_client.delete(key)
        except Exception:  # pragma: no cover
            return

    def get_mood_state(self, session_id: str) -> Dict[str, Any]:
        """Last voice-derived mood for this session (in-process default if Redis unavailable)."""
        default: Dict[str, Any] = {
            "mood_state": "neutral",
            "mood_confidence": 0.0,
            "last_updated": None,
        }
        if not self.available or not self.redis_client:
            return default
        key = self._mood_key(session_id)
        try:
            raw = self.redis_client.get(key)
        except Exception:  # pragma: no cover
            return default
        if not raw:
            return default
        try:
            data = json.loads(raw)
        except Exception:
            return default
        mood = str(data.get("mood_state") or "neutral").lower()
        if mood not in ("depressive", "neutral", "manic"):
            mood = "neutral"
        try:
            conf = float(data.get("mood_confidence", 0.0))
        except (TypeError, ValueError):
            conf = 0.0
        return {
            "mood_state": mood,
            "mood_confidence": max(0.0, min(1.0, conf)),
            "last_updated": data.get("last_updated"),
        }

    def set_mood_state(self, session_id: str, mood_state: str, mood_confidence: Optional[float] = None) -> None:
        """Persist mood from the monitor service (best-effort)."""
        mood = (mood_state or "neutral").strip().lower()
        if mood not in ("depressive", "neutral", "manic"):
            mood = "neutral"
        try:
            conf = float(mood_confidence) if mood_confidence is not None else 0.0
        except (TypeError, ValueError):
            conf = 0.0
        conf = max(0.0, min(1.0, conf))
        record = {
            "mood_state": mood,
            "mood_confidence": conf,
            "last_updated": _utc_iso(),
        }
        if not self.available or not self.redis_client:
            return
        key = self._mood_key(session_id)
        try:
            self.redis_client.setex(key, self.ttl_seconds, json.dumps(record, ensure_ascii=False))
        except Exception:  # pragma: no cover
            return

    def get_recent_messages(self, session_id: str) -> List[Dict[str, str]]:
        """Return chronological role/content messages for this session."""
        if not self.available or not self.redis_client:
            return []
        key = self._key(session_id)
        try:
            # list holds one item per turn; each item has {"user":"...", "assistant":"...", ...}
            rows = self.redis_client.lrange(key, 0, self.max_turns - 1)
        except Exception:  # pragma: no cover
            return []
        out: List[Dict[str, str]] = []
        for raw in reversed(rows):
            try:
                turn = json.loads(raw)
            except Exception:
                continue
            user_text = (turn.get("user") or "").strip()
            assistant_text = (turn.get("assistant") or "").strip()
            if user_text:
                out.append({"role": "user", "content": user_text})
            if assistant_text:
                out.append({"role": "assistant", "content": assistant_text})
        return out

    def append_turn(self, session_id: str, *, user: str, assistant: str) -> None:
        if not self.available or not self.redis_client:
            return
        key = self._key(session_id)
        record = {
            "created_at": _utc_iso(),
            "user": user,
            "assistant": assistant,
        }
        try:
            pipe = self.redis_client.pipeline()
            pipe.lpush(key, json.dumps(record, ensure_ascii=False))
            pipe.ltrim(key, 0, self.max_turns - 1)
            pipe.expire(key, self.ttl_seconds)
            pipe.execute()
        except Exception:  # pragma: no cover
            return
