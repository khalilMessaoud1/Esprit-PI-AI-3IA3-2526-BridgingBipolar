from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import APIRouter, Request

from app.bootstrap import youssef_root

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/ollama")
def ollama_health() -> dict:
    """Probe Ollama text model (useful when chat returns 500)."""
    from app.bootstrap import ensure_graphrag_path

    ensure_graphrag_path()
    load_dotenv(youssef_root() / ".env")
    import requests

    from graphrag.ollama_env import default_ollama_chat_model, ollama_generate_url

    model = default_ollama_chat_model()
    url = ollama_generate_url()
    try:
        response = requests.post(
            url,
            json={"model": model, "prompt": "ping", "stream": False, "options": {"num_predict": 8, "num_ctx": 512}},
            timeout=60,
        )
        if response.ok:
            return {"status": "ok", "model": model, "url": url}
        detail = response.text[:300]
        try:
            detail = response.json().get("error", detail)
        except Exception:
            pass
        return {"status": "error", "model": model, "url": url, "http_status": response.status_code, "detail": detail}
    except requests.RequestException as exc:
        return {"status": "unreachable", "model": model, "url": url, "detail": str(exc)}


@router.get("/health/ready")
def ready(request: Request) -> dict:
    r = getattr(request.app.state, "retriever", None)
    return {"status": "ok" if r is not None else "no_retriever", "retriever": r is not None}
