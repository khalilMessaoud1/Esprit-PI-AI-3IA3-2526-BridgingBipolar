"""Shared GraphRAG retrieval + LLM chat turn (used by FastAPI and CLI)."""

import os
import re
from typing import Any, Dict, Optional, Sequence, Tuple

from graphrag.companion_navigation import detect_companion_navigate_path
from graphrag.crisis_detector import build_crisis_companion_reply, is_crisis_self_harm_turn
from graphrag.generation import generate_with_ollama
from graphrag.retrieval import HybridRetriever

_PHOTO_BLOCK = "[Image description from the user's photo]"

_VISUAL_ID_RE = re.compile(
    r"(?is)"
    r"(?:"
    r"what\s+is\s+(?:this|that|it)|what['\u2019]?s\s+this|what\s+am\s+i\s+looking\s+at|"
    r"identify\s+(?:this|that)|recognize\s+(?:this|that)|"
    r"qu['\u2019]?est[\-\s]?ce\s+que\s+c['\u2019]?est|c['\u2019]est\s+quoi|"
    r"qu['\u2019]?est[\-\s]?ce\s+que\s+c['\u2019]?est\s+que|"
    r"de\s+quoi\s+s['\u2019]?agit[\-\s]?il|"
    r"what\s+do\s+you\s+see|describe\s+this\s+(?:photo|picture|image)"
    r")"
)


def parse_photo_turn(message: str) -> Optional[Tuple[str, str]]:
    """Return (user_note, image_caption) when message is a merged photo turn."""
    if _PHOTO_BLOCK not in (message or ""):
        return None
    before, after = message.split(_PHOTO_BLOCK, 1)
    note = ""
    if "User message:" in before:
        note = before.split("User message:", 1)[1].strip()
    elif before.strip():
        note = before.strip()
    cap = (after or "").strip()
    return note, cap


def is_visual_identification_question(text: str) -> bool:
    """True when the user is asking what something in a photo is."""
    t = (text or "").strip()
    if not t:
        return True
    return bool(_VISUAL_ID_RE.search(t))


def merge_user_note_and_image_caption(user_note: str, caption: str) -> str:
    """Combine optional user text with vision caption for retrieval + generation."""
    note = (user_note or "").strip()
    cap = (caption or "").strip()
    if not cap:
        raise ValueError("image caption is required")
    parts: list[str] = []
    if note:
        parts.append(f"User message:\n{note}")
    parts.append(f"[Image description from the user's photo]\n{cap}")
    return "\n\n".join(parts)


def photo_turn_transcript_for_ui(user_note: str, caption: str, *, max_caption_chars: int = 220) -> str:
    """Short line for transcript panel (not necessarily full merged prompt)."""
    note = (user_note or "").strip()
    cap = (caption or "").strip()
    if len(cap) > max_caption_chars:
        cap = cap[: max_caption_chars - 3].rstrip() + "..."
    if note:
        return f"(Photo) {note} — {cap}"
    return f"(Photo) {cap}"


def _env_flag(name: str, *, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


def build_retriever_from_env() -> HybridRetriever:
    return HybridRetriever(
        embedding_model=os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-large"),
        reranker_model=os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        collection_name=os.getenv("QDRANT_COLLECTION", "bipolar_chunks"),
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=os.getenv("NEO4J_PASSWORD", "password"),
        verify_qdrant_collection=_env_flag("QDRANT_VERIFY_COLLECTION", default=True),
    )


def run_chat_turn(
    retriever: HybridRetriever,
    message: str,
    patient_id: str,
    *,
    user_profile: Optional[Dict[str, str]] = None,
    conversation_history: Optional[Sequence[Dict[str, str]]] = None,
    top_k: int = 12,
    graph_hops: int = 1,
    rerank_top_n: int = 8,
    model: str = "",
    rag_debug_prompt: Optional[bool] = None,
    session_state: Optional[Dict[str, Any]] = None,
    voice_prompt_debug: bool = False,
    voice_debug_out: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    photo = parse_photo_turn(message)
    retrieval_query = message
    if photo:
        note, cap = photo
        retrieval_query = note or cap or message

    retrieval_result = retriever.retrieve(
        query=retrieval_query,
        top_k=top_k,
        graph_hops=graph_hops,
        rerank_top_n=rerank_top_n,
    )

    if photo:
        note, cap = photo
        retrieval_result["intent"] = "photo"
        retrieval_result["chunks"] = []
        retrieval_result["photo_turn"] = {"note": note, "caption": cap}
    mood_state = "neutral"
    mood_confidence = 0.0
    if session_state:
        mood_state = str(session_state.get("mood_state") or "neutral").lower()
        if mood_state not in ("depressive", "neutral", "manic"):
            mood_state = "neutral"
        try:
            mood_confidence = float(session_state.get("mood_confidence", 0.0))
        except (TypeError, ValueError):
            mood_confidence = 0.0
        mood_confidence = max(0.0, min(1.0, mood_confidence))
    retrieval_result["mood_state"] = mood_state
    retrieval_result["mood_confidence"] = mood_confidence

    lang = retrieval_result.get("lang", "en")

    if is_crisis_self_harm_turn(message):
        navigate_to = detect_companion_navigate_path(message)
        out: Dict[str, Any] = {
            "escalated": True,
            "risk": {"crisis_self_harm": True, "intent": retrieval_result.get("intent", "risk")},
            "answer": build_crisis_companion_reply(str(lang)),
            "lang": lang,
            "retrieval": retrieval_result,
        }
        if navigate_to:
            out["navigate_to"] = navigate_to
        return out

    from graphrag.ollama_env import default_ollama_chat_model

    chat_model = (model or "").strip() or default_ollama_chat_model()
    answer = generate_with_ollama(
        message,
        retrieval_result,
        user_profile=user_profile,
        conversation_history=conversation_history,
        model=chat_model,
        debug_prompt=rag_debug_prompt,
        session_state=session_state,
        voice_prompt_debug=voice_prompt_debug,
        voice_debug_out=voice_debug_out,
    )
    navigate_to = detect_companion_navigate_path(message)
    out: Dict[str, Any] = {
        "escalated": False,
        "risk": {},
        "answer": answer,
        "lang": lang,
        "retrieval": retrieval_result,
    }
    if navigate_to:
        out["navigate_to"] = navigate_to
    return out
