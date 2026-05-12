"""HTTP client for integration_kh ``POST /predict_audio``."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_MONITOR = "http://127.0.0.1:8001"


def _monitor_base_url() -> str:
    raw = (os.getenv("BIPOLAR_MONITOR_URL") or _DEFAULT_MONITOR).strip().rstrip("/")
    if raw and not raw.lower().startswith(("http://", "https://")):
        raw = "http://" + raw
    return raw


def predict_audio_url() -> str:
    """Full POST URL used for mood (for logs / UI diagnostics)."""
    return f"{_monitor_base_url()}/predict_audio"


def explain_wav_url() -> str:
    return f"{_monitor_base_url()}/explain_wav"


async def explain_wav_async(path: Path, *, timeout_sec: float = 120.0) -> Optional[Dict[str, Any]]:
    """POST WAV to monitor ``/explain_wav``; return JSON dict or None on failure."""
    url = explain_wav_url()
    try:
        body = path.read_bytes()
        files = {"file": (path.name, body, "audio/wav")}
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.post(url, files=files)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("explain_wav failed: %s (POST %s)", exc, url)
        return None
    if not isinstance(data, dict):
        return None
    return {
        "spectrogram_png_b64": str(data.get("spectrogram_png_b64") or ""),
        "waveform_png_b64": str(data.get("waveform_png_b64") or ""),
        "frequency_summary": data.get("frequency_summary") if isinstance(data.get("frequency_summary"), dict) else {},
        "caption": str(data.get("caption") or ""),
    }


def _fallback_payload(error_hint: str = "") -> Dict[str, Any]:
    """Used when the monitor HTTP call fails; do not treat as a real fusion result."""
    hint = (error_hint or "").strip().replace("\n", " ")[:480]
    return {
        "phase": "neutral",
        "confidence": 0.0,
        "raw_phase": "",
        "monitor_reached": False,
        "error_hint": hint,
    }


def predict_mood_from_wav_path(path: Path, *, timeout_sec: float = 90.0) -> Dict[str, Any]:
    """POST a WAV file to the monitor; return phase, confidence, and fusion ``raw_phase``."""
    url = predict_audio_url()
    try:
        with path.open("rb") as handle:
            files = {"file": (path.name, handle, "audio/wav")}
            with httpx.Client(timeout=timeout_sec) as client:
                resp = client.post(url, files=files)
                resp.raise_for_status()
                data = resp.json()
    except Exception as exc:
        logger.warning("Bipolar monitor request failed: %s (POST %s)", exc, url)
        return _fallback_payload(f"{exc!s} — POST {url}")

    phase = str(data.get("phase") or "neutral").lower()
    if phase not in ("depressive", "neutral", "manic"):
        phase = "neutral"
    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    raw = str(data.get("raw_phase") or "").strip()
    return {"phase": phase, "confidence": conf, "raw_phase": raw, "monitor_reached": True, "error_hint": ""}


async def predict_mood_from_wav_path_async(path: Path, *, timeout_sec: float = 90.0) -> Dict[str, Any]:
    url = predict_audio_url()
    try:
        body = path.read_bytes()
        files = {"file": (path.name, body, "audio/wav")}
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.post(url, files=files)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Bipolar monitor async request failed: %s (POST %s)", exc, url)
        return _fallback_payload(f"{exc!s} — POST {url}")

    phase = str(data.get("phase") or "neutral").lower()
    if phase not in ("depressive", "neutral", "manic"):
        phase = "neutral"
    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    raw = str(data.get("raw_phase") or "").strip()
    return {"phase": phase, "confidence": conf, "raw_phase": raw, "monitor_reached": True, "error_hint": ""}
