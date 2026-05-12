from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.crisis_bridge import run_friend_crisis_post_turn
from services.bipolar_api_client import explain_wav_async

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


def _serialize_chat_min(out: Dict[str, Any], *, include_retrieval: bool) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "answer": out.get("answer", ""),
        "lang": out.get("lang", "en"),
        "escalated": bool(out.get("escalated")),
        "risk": out.get("risk") or {},
    }
    nav_path = out.get("navigate_to")
    if isinstance(nav_path, str) and nav_path.strip():
        payload["navigate_to"] = nav_path.strip()
    if include_retrieval and out.get("retrieval"):
        r = out["retrieval"]
        chunks = r.get("chunks") or []
        payload["retrieval"] = {
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
    return payload


@router.post("/voice")
async def voice_endpoint(
    request: Request,
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    session_id: str = Form(...),
    user_id: str = Form(...),
    conversation_history_json: str = Form(default="[]"),
    user_profile_json: str = Form(default="null"),
    crisis_parent_json: str = Form(default="null"),
    model: Optional[str] = Form(None),
    whisper_language: Optional[str] = Form(None),
    include_retrieval: bool = Form(False),
    top_k: int = Form(12),
    graph_hops: int = Form(1),
    rerank_top_n: int = Form(8),
) -> Dict[str, Any]:
    from graphrag.chat_pipeline import run_chat_turn
    from graphrag.monitor_wav import bytes_to_wav_tempfile
    from graphrag.ollama_env import default_ollama_chat_model
    from graphrag.voice_io import transcribe_audio_bytes
    from services.bipolar_api_client import predict_mood_from_wav_path_async

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio file")
    name = file.filename or "recording.webm"

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

    retriever = request.app.state.retriever
    memory = getattr(request.app.state, "session_memory", None)

    wav_path: Optional[str] = None
    xai_payload: Optional[Dict[str, Any]] = None
    monitor_payload: Dict[str, Any] = {
        "phase": "neutral",
        "confidence": 0.0,
        "raw_phase": "",
        "monitor_reached": False,
        "error_hint": "",
    }
    try:
        try:
            wav_path = await asyncio.to_thread(bytes_to_wav_tempfile, raw, name)
        except Exception as exc:
            logger.warning("WAV conversion skipped: %s", exc)
            monitor_payload["error_hint"] = (f"WAV/ffmpeg: {exc}")[:240]

        if wav_path:
            wav_p = Path(wav_path)
            transcript, monitor_payload, xai_payload = await asyncio.gather(
                asyncio.to_thread(
                    transcribe_audio_bytes,
                    raw,
                    original_filename=name,
                    language=whisper_language,
                ),
                predict_mood_from_wav_path_async(wav_p),
                explain_wav_async(wav_p),
            )
        else:
            transcript = await asyncio.to_thread(
                transcribe_audio_bytes,
                raw,
                original_filename=name,
                language=whisper_language,
            )
    except ImportError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        if wav_path:
            try:
                os.unlink(wav_path)
            except OSError:
                pass

    if not (transcript or "").strip():
        raise HTTPException(status_code=400, detail="No speech detected; try again or use text.")

    if memory and getattr(memory, "available", False):
        memory.set_mood_state(
            session_id,
            str(monitor_payload.get("phase") or "neutral"),
            float(monitor_payload.get("confidence") or 0.0),
        )
        session_mood = memory.get_mood_state(session_id)
    else:
        session_mood = {
            "mood_state": str(monitor_payload.get("phase") or "neutral"),
            "mood_confidence": float(monitor_payload.get("confidence") or 0.0),
            "last_updated": None,
        }

    chat_model = (model or "").strip() or default_ollama_chat_model()

    def _turn() -> Dict[str, Any]:
        return run_chat_turn(
            retriever,
            transcript.strip(),
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
        logger.exception("voice_chat_failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if memory and getattr(memory, "available", False):
        memory.append_voice_turn(
            session_id,
            {
                "phase": str(monitor_payload.get("phase") or "neutral"),
                "raw_phase": str(monitor_payload.get("raw_phase") or "").strip(),
                "confidence": float(monitor_payload.get("confidence") or 0.0),
                "monitor_reached": bool(monitor_payload.get("monitor_reached")),
                "error_hint": str(monitor_payload.get("error_hint") or "").strip(),
            },
        )

    data = _serialize_chat_min(out, include_retrieval=include_retrieval)
    data["transcript"] = transcript.strip()
    data["session_id"] = session_id
    data["voice_mood"] = {
        "phase": str(monitor_payload.get("phase") or "neutral"),
        "raw_phase": str(monitor_payload.get("raw_phase") or "").strip(),
        "confidence": float(monitor_payload.get("confidence") or 0.0),
        "monitor_reached": bool(monitor_payload.get("monitor_reached")),
        "error_hint": str(monitor_payload.get("error_hint") or "").strip(),
    }
    if isinstance(xai_payload, dict) and (
        xai_payload.get("spectrogram_png_b64") or xai_payload.get("waveform_png_b64")
    ):
        data["xai"] = {
            "spectrogram_png_b64": str(xai_payload.get("spectrogram_png_b64") or ""),
            "waveform_png_b64": str(xai_payload.get("waveform_png_b64") or ""),
            "frequency_summary": xai_payload.get("frequency_summary")
            if isinstance(xai_payload.get("frequency_summary"), dict)
            else {},
            "caption": str(xai_payload.get("caption") or ""),
        }

    crisis = getattr(request.app.state, "crisis_redis", None)
    if crisis is not None:
        cp = crisis_parent if isinstance(crisis_parent, dict) else {}
        co = run_friend_crisis_post_turn(
            crisis,
            user_id=user_id,
            user_text_for_crisis=transcript.strip(),
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
