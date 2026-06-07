"""Caption user images via Ollama /api/chat (vision models)."""

from __future__ import annotations

import base64
import json
import os
import re
from io import BytesIO
from typing import Optional

import requests
from PIL import Image, ImageOps

from graphrag.ollama_env import default_ollama_vision_model, ollama_chat_url


def _env_int(name: str, default: int, *, lo: int, hi: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        v = int(raw)
    except ValueError:
        return default
    return max(lo, min(hi, v))


def _env_optional_nonneg_int(name: str) -> Optional[int]:
    """If set, parsed as int >= 0; invalid or empty → None."""
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return None
    try:
        v = int(raw)
    except ValueError:
        return None
    return max(0, v)


def _ollama_vision_read_timeout_sec() -> int:
    """
    HTTP read timeout for Ollama /api/chat (vision). First GPU loads can be slow — override with OLLAMA_VISION_TIMEOUT_SEC.
    """
    return _env_int("OLLAMA_VISION_TIMEOUT_SEC", 900, lo=60, hi=1800)


def vision_caption_read_timeout_seconds() -> int:
    """Public alias for FastAPI / other callers that want to pass `timeout_sec=` explicitly."""
    return _ollama_vision_read_timeout_sec()


def _prepare_image_bytes_for_vision(image_bytes: bytes) -> bytes:
    """
    Downscale and re-encode as JPEG so Ollama vision uses less VRAM (large photos
    often crash the runner with 'llama runner process has terminated').
    """
    max_side = _env_int("VISION_IMAGE_MAX_SIDE", 1024, lo=256, hi=4096)
    quality = _env_int("VISION_JPEG_QUALITY", 85, lo=60, hi=95)

    buf_in = BytesIO(image_bytes)
    im = Image.open(buf_in)
    im = ImageOps.exif_transpose(im)

    if im.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    w, h = im.size
    if max(w, h) > max_side:
        scale = max_side / float(max(w, h))
        nw = max(1, int(round(w * scale)))
        nh = max(1, int(round(h * scale)))
        try:
            resample = Image.Resampling.LANCZOS
        except AttributeError:  # pragma: no cover - older Pillow
            resample = Image.LANCZOS  # type: ignore[attr-defined]
        im = im.resize((nw, nh), resample)

    out = BytesIO()
    im.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()


def _ollama_http_error_detail(resp: requests.Response) -> str:
    """Extract Ollama JSON `error` field or a short text body for debugging."""
    try:
        data = resp.json()
        err = data.get("error")
        if err:
            return str(err).strip()
    except (json.JSONDecodeError, ValueError, TypeError):
        pass
    text = (resp.text or "").strip()
    if text:
        return text[:2000]
    return resp.reason or f"HTTP {resp.status_code}"

VISION_SYSTEM = (
    "You describe images for a supportive mental-health companion app. "
    "Be factual about what is visible (people, objects, setting, text in image, mood cues). "
    "Do not diagnose medical or psychiatric conditions from pixels. "
    "If something is unclear, say so. Answer in the same language as any clear text in the image; "
    "otherwise use the same language as the user's note if provided, else English."
)

VISION_USER_TEMPLATE = (
    "{user_hint}"
    "Describe this image in plain language for the assistant that will reply next. "
    "Stay under 200 words. No greeting."
)


def _parse_chat_content(data: dict) -> str:
    """Extract assistant text from Ollama /api/chat JSON (tolerates minor schema differences)."""
    if not isinstance(data, dict):
        return ""
    msg = data.get("message") or {}
    if isinstance(msg, dict):
        text = (msg.get("content") or "").strip()
        if text:
            return text
    return str(data.get("response") or "").strip()


def _sanitize_vision_caption(text: str, *, max_chars: int = 280) -> str:
    """
    Trim moondream degenerate output (letter spam, slash-separated chars, long repeats).
    """
    t = (text or "").strip()
    if not t:
        return t
    # m/e/t/a/p/h/o/r/e style letter-by-letter spelling
    if re.search(r"(?:\w/){4,}\w", t):
        t = re.sub(r"(?<=[A-Za-zÀ-ÿ0-9])/+(?=[A-Za-zÀ-ÿ0-9])", "", t)
    # Cut before long same-character runs (common moondream failure mode)
    m = re.search(r"(.)\1{7,}", t)
    if m:
        t = t[: m.start()].rstrip(" ,;:-")
    # Collapse short repeated-char bursts
    t = re.sub(r"(.)\1{4,}", r"\1\1", t)
    # Collapse repeated trailing word
    t = re.sub(r"(\b[\wÀ-ÿ'-]+\b)(?: \1){2,}", r"\1", t, flags=re.IGNORECASE)
    t = re.sub(r"\s{2,}", " ", t).strip()
    # Drop gibberish comma-separated segments (no spaces, not an address/number chunk)
    parts = [p.strip() for p in t.split(",") if p.strip()]
    while len(parts) > 1:
        tail = parts[-1]
        if len(tail) > 12 and " " not in tail and not re.search(r"\d{3,}", tail):
            parts.pop()
        else:
            break
    if parts:
        t = ", ".join(parts)
    if len(t) > max_chars:
        cut = t[:max_chars]
        if " " in cut:
            cut = cut.rsplit(" ", 1)[0]
        t = cut.rstrip(" ,;:-") + "…"
    return t


def _is_moondream_model(model: str) -> bool:
    return "moondream" in (model or "").lower()


def _build_vision_prompt(model: str, user_note: str, *, minimal: bool = False) -> str:
    hint = (user_note or "").strip()
    if minimal or _is_moondream_model(model):
        base = (
            "Describe the scene in plain language. If there is visible text (signs, addresses, labels), "
            "transcribe it accurately. Do not repeat letters. Under 80 words. No greeting."
        )
        if hint:
            return f"The user wrote: {hint}\n\n{base}"
        return base
    user_block = VISION_USER_TEMPLATE.format(
        user_hint=(f"User added this note: {hint}\n\n" if hint else ""),
    )
    return f"{VISION_SYSTEM}\n\n{user_block}"


def _post_ollama_vision_chat(
    *,
    url: str,
    model: str,
    b64: str,
    prompt: str,
    num_predict: int,
    num_ctx: int,
    connect_to: int,
    read_to: int,
) -> dict:
    options: dict = {
        "temperature": 0.0 if _is_moondream_model(model) else 0.2,
        "num_predict": num_predict,
        "num_ctx": num_ctx,
    }
    vision_num_gpu = _env_optional_nonneg_int("OLLAMA_VISION_NUM_GPU")
    if vision_num_gpu is not None:
        options["num_gpu"] = vision_num_gpu

    keep_alive = (os.getenv("OLLAMA_KEEP_ALIVE") or "5m").strip()
    payload: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
        "stream": False,
        "options": options,
    }
    if keep_alive:
        payload["keep_alive"] = keep_alive

    resp = requests.post(url, json=payload, timeout=(connect_to, read_to))
    if not resp.ok:
        detail = _ollama_http_error_detail(resp)
        raise RuntimeError(f"Ollama /api/chat {resp.status_code}: {detail}") from None
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("Ollama /api/chat returned non-object JSON")
    return data


def caption_image_bytes(
    image_bytes: bytes,
    *,
    model: Optional[str] = None,
    user_note: str = "",
    ollama_chat_endpoint: Optional[str] = None,
    timeout_sec: Optional[int] = None,
) -> str:
    """
    Call Ollama vision model with base64 image; return trimmed caption text.
    Raises RuntimeError on Ollama HTTP errors (message includes server `error` JSON if present).
    Raises ValueError on empty model/response.
    """
    if not image_bytes:
        raise ValueError("Empty image bytes")
    model = (model or default_ollama_vision_model()).strip()
    if not model:
        raise ValueError("OLLAMA_VISION_MODEL / vision model is empty")
    url = ollama_chat_endpoint or ollama_chat_url()
    try:
        prepared = _prepare_image_bytes_for_vision(image_bytes)
    except Exception as exc:
        raise ValueError(f"Could not decode or resize image: {exc}") from exc
    b64 = base64.b64encode(prepared).decode("ascii")

    num_predict = _env_int("OLLAMA_VISION_NUM_PREDICT", 256, lo=96, hi=512)
    num_ctx = _env_int("OLLAMA_VISION_NUM_CTX", 2048, lo=512, hi=8192)
    read_to = timeout_sec if timeout_sec is not None else _ollama_vision_read_timeout_sec()
    env_floor = _env_int("OLLAMA_VISION_MIN_READ_TIMEOUT_SEC", 900, lo=300, hi=1800)
    read_to = max(read_to, env_floor, 900)
    connect_to = _env_int("OLLAMA_VISION_CONNECT_TIMEOUT_SEC", 15, lo=5, hi=120)

    attempts = (
        (_build_vision_prompt(model, user_note, minimal=False), num_predict, num_ctx),
        (_build_vision_prompt(model, user_note, minimal=True), max(num_predict, 320), max(num_ctx, 2048)),
    )
    last_reason = ""
    for prompt, predict, ctx in attempts:
        data = _post_ollama_vision_chat(
            url=url,
            model=model,
            b64=b64,
            prompt=prompt,
            num_predict=predict,
            num_ctx=ctx,
            connect_to=connect_to,
            read_to=read_to,
        )
        text = _sanitize_vision_caption(_parse_chat_content(data))
        if text:
            return text
        last_reason = str(data.get("done_reason") or "empty content")

    hint = (user_note or "").strip()
    if hint:
        return f"(Photo description unavailable from vision model; user note: {hint})"

    raise ValueError(
        f"Vision model '{model}' returned empty caption (done_reason={last_reason}). "
        "Ensure Ollama is running and `ollama pull moondream` completed, then restart the RAG service."
    )
