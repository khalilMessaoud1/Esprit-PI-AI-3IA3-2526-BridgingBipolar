from __future__ import annotations

import asyncio
import json
import logging
import os
from functools import partial
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.crisis_bridge import run_friend_crisis_post_turn

logger = logging.getLogger(__name__)

router = APIRouter(tags=["image"])


def _sniff_image_media_type(data: bytes) -> str:
    if len(data) < 12:
        raise ValueError("Image file is too small")
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise ValueError("Unsupported image type; use JPEG, PNG, or WebP")


def _chat_image_max_bytes() -> int:
    raw = (os.getenv("CHAT_IMAGE_MAX_BYTES") or "").strip()
    if not raw:
        return 8 * 1024 * 1024
    try:
        return max(256_000, int(raw))
    except ValueError:
        return 8 * 1024 * 1024


@router.post("/chat/image")
async def chat_image_endpoint(
    request: Request,
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    session_id: str = Form(...),
    user_id: str = Form(...),
    message: Optional[str] = Form(None),
    conversation_history_json: str = Form(default="[]"),
    user_profile_json: str = Form(default="null"),
    crisis_parent_json: str = Form(default="null"),
    model: Optional[str] = Form(None),
    vision_model: Optional[str] = Form(None),
    include_retrieval: bool = Form(False),
    top_k: int = Form(12),
    graph_hops: int = Form(1),
    rerank_top_n: int = Form(8),
) -> Dict[str, Any]:
    from graphrag.chat_pipeline import merge_user_note_and_image_caption, photo_turn_transcript_for_ui, run_chat_turn
    from graphrag.ollama_env import default_ollama_chat_model, default_ollama_vision_model
    from graphrag.vision_caption import caption_image_bytes, vision_caption_read_timeout_seconds

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")
    max_bytes = _chat_image_max_bytes()
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Image too large (max {max_bytes} bytes).")
    try:
        _sniff_image_media_type(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        history_raw: List[Dict[str, str]] = json.loads(conversation_history_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation_history_json") from exc
    history: List[Dict[str, str]] = []
    for row in history_raw:
        if isinstance(row, dict) and row.get("role") in ("user", "assistant") and row.get("content"):
            history.append({"role": row["role"], "content": str(row["content"])})

    user_profile = None
    if user_profile_json and user_profile_json.strip() not in ("", "null"):
        try:
            user_profile = json.loads(user_profile_json)
        except json.JSONDecodeError:
            user_profile = None

    crisis_parent = None
    if crisis_parent_json and crisis_parent_json.strip() not in ("", "null"):
        try:
            crisis_parent = json.loads(crisis_parent_json)
        except json.JSONDecodeError:
            crisis_parent = None

    user_note = (message or "").strip()
    vm = (vision_model or "").strip() or default_ollama_vision_model()
    try:
        caption = await asyncio.to_thread(
            partial(
                caption_image_bytes,
                raw,
                model=vm,
                user_note=user_note,
                timeout_sec=vision_caption_read_timeout_seconds(),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Image caption failed: {exc}") from exc

    try:
        merged = merge_user_note_and_image_caption(user_note, caption)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    memory = getattr(request.app.state, "session_memory", None)
    if memory and getattr(memory, "available", False):
        session_mood = memory.get_mood_state(session_id)
    else:
        session_mood = {"mood_state": "neutral", "mood_confidence": 0.0, "last_updated": None}

    retriever = request.app.state.retriever
    chat_model = (model or "").strip() or default_ollama_chat_model()

    def _turn() -> Dict[str, Any]:
        return run_chat_turn(
            retriever,
            merged,
            patient_id.strip(),
            user_profile=user_profile if isinstance(user_profile, dict) else None,
            conversation_history=history,
            top_k=top_k,
            graph_hops=graph_hops,
            rerank_top_n=rerank_top_n,
            model=chat_model,
            session_state=session_mood,
        )

    timeout = float(os.getenv("RAG_CHAT_TIMEOUT_SEC", "180"))
    try:
        out = await asyncio.wait_for(asyncio.to_thread(_turn), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="RAG chat timed out") from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("image_chat_failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    transcript_ui = photo_turn_transcript_for_ui(user_note, caption)
    data: Dict[str, Any] = {
        "answer": out.get("answer", ""),
        "lang": out.get("lang", "en"),
        "escalated": bool(out.get("escalated")),
        "risk": out.get("risk") or {},
        "transcript": transcript_ui,
        "image_caption": caption,
        "session_id": session_id,
    }
    nav_path = out.get("navigate_to")
    if isinstance(nav_path, str) and nav_path.strip():
        data["navigate_to"] = nav_path.strip()
    if include_retrieval and out.get("retrieval"):
        r = out["retrieval"]
        chunks = r.get("chunks") or []
        data["retrieval"] = {
            "intent": r.get("intent"),
            "lang": r.get("lang"),
            "chunks": [
                {
                    "chunk_id": c.get("chunk_id"),
                    "section_title": (c.get("metadata") or {}).get("section_title"),
                    "text_preview": ((c.get("text") or "")[:240] + "…")
                    if len(c.get("text") or "") > 240
                    else (c.get("text") or ""),
                }
                for c in chunks
            ],
        }

    crisis = getattr(request.app.state, "crisis_redis", None)
    if crisis is not None:
        cp = crisis_parent if isinstance(crisis_parent, dict) else {}
        co = run_friend_crisis_post_turn(
            crisis,
            user_id=user_id,
            user_text_for_crisis=merged,
            reply_lang=str(out.get("lang") or "en"),
            parent_whatsapp_e164=cp.get("parent_whatsapp_e164") if cp else None,
            parent_contact_consent=bool(cp.get("parent_contact_consent")) if cp else False,
            display_name=str(cp.get("display_name") or "User") if cp else "User",
        )
        if co.get("crisis_support_notified"):
            data["crisis_support_notified"] = True
        if co.get("crisis_strikes") is not None:
            data["crisis_strikes"] = co["crisis_strikes"]

    return data
