"""Resolve Ollama base URL and default model names from environment."""

from __future__ import annotations

import os
from urllib.parse import urlparse


def _strip_trailing_slash(url: str) -> str:
    return url.rstrip("/")


def ollama_base_url() -> str:
    """Host + optional port, without /api/* path. Works when OLLAMA_URL is generate or chat URL."""
    raw = (os.getenv("OLLAMA_URL") or "http://localhost:11434/api/generate").strip()
    if not raw:
        return "http://localhost:11434"
    lower = raw.lower()
    for suffix in ("/api/generate", "/api/chat"):
        if lower.endswith(suffix):
            return _strip_trailing_slash(raw[: -len(suffix)]) or "http://localhost:11434"
    parsed = urlparse(raw)
    if parsed.scheme and parsed.netloc:
        return _strip_trailing_slash(f"{parsed.scheme}://{parsed.netloc}")
    return _strip_trailing_slash(raw) or "http://localhost:11434"


def ollama_generate_url() -> str:
    """Full URL for Ollama text /api/generate (matches legacy OLLAMA_URL default)."""
    explicit = (os.getenv("OLLAMA_URL") or "").strip()
    if explicit.lower().endswith("/api/generate"):
        return explicit
    return f"{ollama_base_url()}/api/generate"


def ollama_chat_url() -> str:
    """Full URL for Ollama /api/chat (vision and multimodal)."""
    return f"{ollama_base_url()}/api/chat"


def default_ollama_chat_model() -> str:
    return (os.getenv("OLLAMA_CHAT_MODEL") or os.getenv("OLLAMA_MODEL") or "llama3.2:3b").strip()


def _env_int(name: str, default: int, lo: int, hi: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(lo, min(hi, value))


def ollama_generate_options(*, temperature: float) -> dict:
    """Low-memory-friendly defaults; override with OLLAMA_NUM_CTX / OLLAMA_NUM_PREDICT."""
    return {
        "temperature": temperature,
        "num_predict": _env_int("OLLAMA_NUM_PREDICT", 256, 64, 1024),
        "num_ctx": _env_int("OLLAMA_NUM_CTX", 2048, 512, 8192),
    }


def ollama_generate_timeout_sec() -> int:
    return _env_int("OLLAMA_GENERATE_TIMEOUT_SEC", 180, 30, 600)


def default_ollama_vision_model() -> str:
    """
    Default `moondream` — fast enough on CPU for photo captions. Heavy models (`llava:7b`, …)
    need a GPU or long timeouts; set OLLAMA_VISION_MODEL explicitly if you prefer them.
    """
    return (os.getenv("OLLAMA_VISION_MODEL") or "moondream").strip()
