from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

from app.crisis_bridge import run_friend_crisis_post_turn
from app.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


def _serialize_retrieval(out: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    r = out.get("retrieval")
    if not isinstance(r, dict):
        return None
    chunks = r.get("chunks") or []
    return {
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


def _run_chat_sync(
    retriever: Any,
    body: ChatRequest,
    session_memory: Any,
    crisis: Any,
    keystroke_analyzer: Any,
) -> Dict[str, Any]:
    from graphrag.chat_pipeline import run_chat_turn
    from graphrag.ollama_env import default_ollama_chat_model

    history: List[Dict[str, str]] = [m.model_dump() for m in body.conversation_history]
    session_state = None
    if session_memory is not None and getattr(session_memory, "available", False):
        session_state = session_memory.get_mood_state(body.session_id)

    model = (body.model or "").strip() or default_ollama_chat_model()
    out = run_chat_turn(
        retriever,
        body.message.strip(),
        body.patient_id.strip(),
        user_profile=body.user_profile,
        conversation_history=history,
        top_k=body.top_k,
        graph_hops=body.graph_hops,
        rerank_top_n=body.rerank_top_n,
        model=model,
        session_state=session_state,
    )

    keystroke_out = None
    if keystroke_analyzer and body.keystroke_events:
        try:
            keystroke_out = keystroke_analyzer.analyze(
                body.keystroke_events,
                body.keystroke_session or {},
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("keystroke_analysis_failed: %s", exc)

    cp = body.crisis_parent
    crisis_display = "User"
    if cp and (cp.display_name or "").strip():
        crisis_display = cp.display_name.strip()
    crisis_out = run_friend_crisis_post_turn(
        crisis,
        user_id=body.user_id,
        user_text_for_crisis=body.message,
        reply_lang=str(out.get("lang") or "en"),
        parent_whatsapp_e164=cp.parent_whatsapp_e164 if cp else None,
        parent_contact_consent=bool(cp.parent_contact_consent) if cp else False,
        display_name=crisis_display,
    )

    payload: Dict[str, Any] = {
        "answer": out.get("answer", ""),
        "lang": out.get("lang", "en"),
        "escalated": bool(out.get("escalated")),
        "risk": out.get("risk") or {},
        "keystroke": keystroke_out,
    }
    nav_path = out.get("navigate_to")
    if isinstance(nav_path, str) and nav_path.strip():
        payload["navigate_to"] = nav_path.strip()
    if body.include_retrieval:
        payload["retrieval"] = _serialize_retrieval(out)
    if crisis_out.get("crisis_support_notified"):
        payload["crisis_support_notified"] = True
    if crisis_out.get("crisis_strikes") is not None:
        payload["crisis_strikes"] = crisis_out["crisis_strikes"]
    return payload


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, body: ChatRequest) -> ChatResponse:
    try:
        from app.retriever_loader import get_or_create_retriever

        retriever = get_or_create_retriever(request.app)
    except Exception as exc:
        logger.exception("retriever_load_failed")
        raise HTTPException(
            status_code=503,
            detail=(
                "RAG retriever could not connect to Qdrant or Neo4j. "
                "Start dependencies with: docker compose up -d postgres qdrant "
                "(and Neo4j on the host if you use graph retrieval). "
                f"Error: {exc}"
            ),
        ) from exc
    session_memory = getattr(request.app.state, "session_memory", None)
    crisis = getattr(request.app.state, "crisis_redis", None)
    keystroke_analyzer = getattr(request.app.state, "keystroke", None)

    timeout = float(os.getenv("RAG_CHAT_TIMEOUT_SEC", "180"))
    try:
        data = await asyncio.wait_for(
            asyncio.to_thread(
                _run_chat_sync,
                retriever,
                body,
                session_memory,
                crisis,
                keystroke_analyzer,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="RAG chat timed out") from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("chat_failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    nav_to = data.get("navigate_to")
    nav_to_s = (nav_to.strip() if isinstance(nav_to, str) else "") or None
    return ChatResponse(
        answer=str(data.get("answer", "")),
        lang=str(data.get("lang", "en")),
        escalated=bool(data.get("escalated")),
        risk=data.get("risk") if isinstance(data.get("risk"), dict) else {},
        retrieval=data.get("retrieval") if isinstance(data.get("retrieval"), dict) else None,
        keystroke=data.get("keystroke"),
        crisis_support_notified=bool(data.get("crisis_support_notified")),
        crisis_strikes=data.get("crisis_strikes") if isinstance(data.get("crisis_strikes"), int) else None,
        navigate_to=nav_to_s or None,
    )
