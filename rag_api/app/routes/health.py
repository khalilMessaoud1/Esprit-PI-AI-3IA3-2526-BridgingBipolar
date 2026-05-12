from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/ready")
def ready(request: Request) -> dict:
    r = getattr(request.app.state, "retriever", None)
    return {"status": "ok" if r is not None else "no_retriever", "retriever": r is not None}
