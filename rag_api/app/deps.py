from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException, Request


def require_rag_api_key(request: Request) -> None:
    expected = (os.getenv("RAG_API_KEY") or "").strip()
    if not expected:
        return
    got = (request.headers.get("X-RAG-API-KEY") or "").strip()
    if got != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-RAG-API-KEY")


def cors_origins() -> list[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    return [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:3002",
        "http://localhost:3002",
        "http://127.0.0.1:4000",
        "http://localhost:4000",
    ]
