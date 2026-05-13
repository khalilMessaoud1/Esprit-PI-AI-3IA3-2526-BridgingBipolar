"""FastAPI web UI: auth + age-based avatar voice experience + TTS."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import sqlite3
import sys
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

_PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_project_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    env_path = _PROJECT_ROOT / ".env"
    if env_path.is_file():
        load_dotenv(env_path)


_load_project_env()

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from graphrag.auth_security import (
    COOKIE_NAME,
    configure_jwt_secret,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from graphrag.auth_store import AuthStore, UserRecord
from graphrag.crisis_pipeline import handle_crisis_post_turn
from graphrag.crisis_redis import CrisisRedisStore
from graphrag.chat_pipeline import (
    build_retriever_from_env,
    merge_user_note_and_image_caption,
    photo_turn_transcript_for_ui,
    run_chat_turn,
)
from graphrag.keystroke_analyzer import KeystrokeAnalyzer
from graphrag.ollama_env import default_ollama_chat_model, default_ollama_vision_model
from graphrag.vision_caption import caption_image_bytes, vision_caption_read_timeout_seconds
from graphrag.retrieval import HybridRetriever
from graphrag.monitor_wav import bytes_to_wav_tempfile
from graphrag.session_memory import SessionMemoryStore
from graphrag.voice_io import synthesize_speech_mp3, transcribe_audio_bytes
from services.bipolar_api_client import explain_wav_async, predict_audio_url, predict_mood_from_wav_path_async
from graphrag.voice_session_report import summarize_voice_phases

STATIC_DIR = Path(__file__).resolve().parent / "static"

logger = logging.getLogger(__name__)

_AUTH_RATE: Dict[str, deque] = defaultdict(deque)
_AUTH_RATE_LIMIT = 40
_AUTH_RATE_WINDOW_SEC = 60


def _default_ollama_chat_model() -> str:
    return default_ollama_chat_model()


def _chat_image_max_bytes() -> int:
    raw = (os.getenv("CHAT_IMAGE_MAX_BYTES") or "").strip()
    if not raw:
        return 8 * 1024 * 1024
    try:
        return max(256_000, int(raw))
    except ValueError:
        return 8 * 1024 * 1024


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


def _new_session_id() -> str:
    return uuid.uuid4().hex


def _normalize_session_id(session_id: Optional[str]) -> str:
    raw = (session_id or "").strip()
    return raw[:128] if raw else _new_session_id()


def _voice_lab_debug_allowed(request: Request) -> bool:
    """HTTP JSON may include voice prompt debug only when env and query both opt in."""
    if os.getenv("VOICE_PROMPT_DEBUG", "").strip().lower() not in ("1", "true", "yes"):
        return False
    v = (request.query_params.get("voice_prompt_debug") or "").strip().lower()
    return v in ("1", "true", "yes")


def _serialize_chat_out(out: Dict[str, Any], *, include_retrieval: bool) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "answer": out.get("answer", ""),
        "escalated": bool(out.get("escalated")),
        "lang": out.get("lang", "en"),
        "risk": out.get("risk"),
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


def _startup_help_message(exc: BaseException) -> str:
    qdrant_url = os.getenv("QDRANT_URL", "").strip()
    qdrant_host = os.getenv("QDRANT_HOST", "").strip()
    has_remote_qdrant = bool(qdrant_url) or qdrant_host.lower().startswith(("http://", "https://"))
    if has_remote_qdrant:
        qdrant_hint = (
            "Qdrant remote config is present (QDRANT_URL and/or https QDRANT_HOST). "
            "If connection still fails, check URL, QDRANT_API_KEY, VPN/firewall, and that "
            "QDRANT_COLLECTION exists on that cluster (same name as run_ingestion.py / .env).\n"
        )
    else:
        qdrant_hint = (
            "No QDRANT_URL / https QDRANT_HOST found — client defaults to localhost:6333.\n"
            "For Qdrant Cloud, set e.g. QDRANT_URL=https://....cloud.qdrant.io and QDRANT_API_KEY, "
            "or set QDRANT_HOST=https://....cloud.qdrant.io:6333 as in your .env.\n"
            "Set QDRANT_COLLECTION to match ingestion (default in code: bipolar_chunks).\n"
        )
    return (
        "\n"
        "=== GraphRAG web startup failed ===\n"
        "The retriever could not reach Qdrant or Neo4j.\n"
        "\n"
        "Qdrant (Cloud / remote — if you are NOT running Qdrant on this PC):\n"
        + qdrant_hint
        + "\n"
        "Qdrant (local Docker — only if you intend to use localhost):\n"
        "    docker run --rm -p 6333:6333 -p 6334:6334 qdrant/qdrant\n"
        "    Then ingest so your collection exists; dashboard: http://localhost:6333/dashboard\n"
        "\n"
        "Neo4j: start your instance (Desktop / Docker / Aura) and set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD if not default.\n"
        "\n"
        f"Original error: {exc!r}\n"
        "===================================\n"
    )


def _cors_origins() -> List[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    port = (os.getenv("WEB_PORT") or "8000").strip()
    return [
        f"http://127.0.0.1:{port}",
        f"http://localhost:{port}",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ]


def _cookie_secure() -> bool:
    return (os.getenv("AUTH_COOKIE_SECURE") or "").strip().lower() in ("1", "true", "yes")


def experience_mode_for(user: UserRecord) -> str:
    return "under16_avatar_voice" if user.is_under_16() else "over16_avatar_voice"


def patient_id_for(user: UserRecord) -> str:
    return f"user_{user.id}"


def _auth_rate_check(client_host: str) -> None:
    now = time.time()
    q = _AUTH_RATE[client_host]
    while q and q[0] < now - _AUTH_RATE_WINDOW_SEC:
        q.popleft()
    if len(q) >= _AUTH_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests; try again later.")
    q.append(now)


def _validate_email(email: str) -> str:
    e = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
        raise HTTPException(status_code=400, detail="Invalid email.")
    return e


def _validate_password(pw: str) -> None:
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")


def _validate_name(name: str) -> str:
    n = (name or "").strip()
    if len(n) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    if len(n) > 80:
        raise HTTPException(status_code=400, detail="Name is too long.")
    return n


def _default_parent_country_code_digits() -> str:
    """Country calling code without + (e.g. 216 for Tunisia). Override with PARENT_WHATSAPP_DEFAULT_COUNTRY_CODE."""
    raw = (os.getenv("PARENT_WHATSAPP_DEFAULT_COUNTRY_CODE") or "216").strip()
    d = re.sub(r"\D", "", raw)
    return d or "216"


def _normalize_parent_whatsapp_to_e164(raw: str) -> str:
    """
    Build E.164 (+…digits only).

    - If the value already starts with ``+`` (or ``00`` international prefix), use as international.
    - Otherwise treat input as **national** digits and prepend ``+`` + ``PARENT_WHATSAPP_DEFAULT_COUNTRY_CODE``
      (default **216**), after stripping a single leading **0** common in local formats.
    """
    s = (raw or "").strip()
    digits = re.sub(r"\D", "", s)
    if not digits:
        raise HTTPException(status_code=400, detail="Invalid parent WhatsApp number.")

    if s.startswith("+"):
        normalized = "+" + digits
    elif digits.startswith("00"):
        normalized = "+" + digits[2:]
    else:
        cc = _default_parent_country_code_digits()
        if digits.startswith(cc) and len(digits) > len(cc):
            normalized = "+" + digits
        else:
            national = digits[1:] if digits.startswith("0") else digits
            if not national:
                raise HTTPException(status_code=400, detail="Invalid parent WhatsApp number.")
            normalized = "+" + cc + national

    if len(normalized) < 11 or len(normalized) > 17:
        raise HTTPException(status_code=400, detail="Invalid parent WhatsApp number length.")
    return normalized


def _validate_parent_signup(parent_whatsapp: str, consent: bool) -> tuple[str, bool]:
    """Normalize parent number to E.164; require consent iff number is provided."""
    raw = (parent_whatsapp or "").strip()
    if raw and not consent:
        raise HTTPException(
            status_code=400,
            detail="Parent WhatsApp requires emergency-contact consent.",
        )
    if consent and not raw:
        raise HTTPException(
            status_code=400,
            detail="Parent WhatsApp number is required when consent is checked.",
        )
    if not raw:
        return "", False
    normalized = _normalize_parent_whatsapp_to_e164(raw)
    return normalized, True


def _validate_birth_date(s: str) -> str:
    raw = s.strip()
    try:
        d = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="birth_date must be YYYY-MM-DD.") from exc
    if d > date.today():
        raise HTTPException(status_code=400, detail="birth_date cannot be in the future.")
    if d.year < 1900:
        raise HTTPException(status_code=400, detail="birth_date is not valid.")
    return raw


@asynccontextmanager
async def lifespan(app: FastAPI):
    jwt_secret = (os.getenv("AUTH_JWT_SECRET") or "").strip()
    if not jwt_secret:
        jwt_secret = secrets.token_urlsafe(48)
        print(
            "WARNING: AUTH_JWT_SECRET not set; using an ephemeral JWT secret for this process only. "
            "Set AUTH_JWT_SECRET in .env for stable sessions across restarts.",
            file=sys.stderr,
        )
    configure_jwt_secret(jwt_secret)

    auth_store = AuthStore()
    auth_store.init_db()
    app.state.auth_store = auth_store

    try:
        retriever = build_retriever_from_env()
    except Exception as exc:  # pragma: no cover - environment-specific
        print(_startup_help_message(exc), file=sys.stderr)
        raise
    app.state.retriever = retriever
    app.state.session_memory = SessionMemoryStore.from_env()
    app.state.crisis_redis = CrisisRedisStore.from_env()
    app.state.keystroke = KeystrokeAnalyzer.from_artifacts(
        _PROJECT_ROOT / "artifacts" / "keystroke"
    )
    yield
    retriever.close()


app = FastAPI(title="GraphRAG Bipolar Assistant", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def get_auth_store(request: Request) -> AuthStore:
    return request.app.state.auth_store  # type: ignore[no-any-return]


def get_retriever(request: Request) -> HybridRetriever:
    return request.app.state.retriever  # type: ignore[no-any-return]


def get_session_memory(request: Request) -> SessionMemoryStore:
    return request.app.state.session_memory  # type: ignore[no-any-return]


def get_crisis_redis(request: Request) -> CrisisRedisStore:
    return request.app.state.crisis_redis  # type: ignore[no-any-return]


def get_keystroke(request: Request) -> Optional[KeystrokeAnalyzer]:
    return getattr(request.app.state, "keystroke", None)


def get_current_user(
    request: Request,
    store: AuthStore = Depends(get_auth_store),
) -> UserRecord:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    try:
        uid = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid session") from exc
    user = store.get_user_by_id(uid)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _set_auth_cookie(response: Response, token: str) -> None:
    max_age = int((os.getenv("AUTH_SESSION_DAYS") or "14").strip() or "14") * 24 * 3600
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        max_age=max_age,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=256)
    birth_date: str = Field(..., min_length=10, max_length=10, description="YYYY-MM-DD")
    parent_whatsapp: str = Field(default="", max_length=32)
    parent_contact_consent: bool = Field(
        default=False,
        description="Must be true to store parent WhatsApp for crisis alerts.",
    )


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=16000)
    session_id: Optional[str] = Field(default=None, max_length=128)
    model: str = Field(default_factory=_default_ollama_chat_model)
    include_retrieval: bool = False
    keystroke_events: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Per-keystroke timing events captured in the browser textarea: [{k, t, u}, ...]",
        max_length=4000,
    )
    keystroke_session: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Session-level typing stats: n_keystrokes, n_backspace, n_autocorrect, n_corrections, duration_ms",
    )


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    lang: Optional[str] = Field(None, max_length=16)
    voice: Optional[str] = Field(None, max_length=128)


class SessionVoiceReportRequest(BaseModel):
    session_id: Optional[str] = Field(default=None, max_length=128)


class ParentContactUpdateRequest(BaseModel):
    """Set or update parent/guardian WhatsApp for crisis alerts (existing accounts)."""

    parent_whatsapp: str = Field(default="", max_length=32)
    parent_contact_consent: bool = Field(default=False)


@app.get("/api/health")
def health(request: Request) -> dict:
    coll = (os.getenv("QDRANT_COLLECTION") or "bipolar_chunks").strip()
    mem = get_session_memory(request)
    return {
        "ok": True,
        "qdrant_collection": coll,
        "qdrant_configured": bool(
            os.getenv("QDRANT_URL", "").strip()
            or os.getenv("QDRANT_HOST", "").strip().lower().startswith(("http://", "https://"))
            or os.getenv("QDRANT_HOST", "").strip()
        ),
        "ollama_model_default": _default_ollama_chat_model(),
        "ollama_vision_model_default": default_ollama_vision_model(),
        "session_memory_available": bool(mem.available),
        "auth_cookie_secure": _cookie_secure(),
    }


@app.get("/")
def index() -> FileResponse:
    index_path = STATIC_DIR / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=500, detail="Missing static/index.html")
    return FileResponse(index_path)


@app.post("/api/auth/signup")
def auth_signup(request: Request, body: SignUpRequest, response: Response) -> dict:
    client = request.client.host if request.client else "unknown"
    _auth_rate_check(client)
    store = get_auth_store(request)
    name = _validate_name(body.name)
    email = _validate_email(body.email)
    _validate_password(body.password)
    birth = _validate_birth_date(body.birth_date)
    parent_wa, parent_ok = _validate_parent_signup(body.parent_whatsapp, body.parent_contact_consent)
    ph = hash_password(body.password)
    try:
        user = store.create_user(
            name=name,
            email=email,
            password_hash=ph,
            birth_date=birth,
            parent_whatsapp=parent_wa if parent_ok else "",
            parent_contact_consent=parent_ok,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Email already registered.") from exc
    token = create_access_token(user_id=user.id, email=user.email)
    _set_auth_cookie(response, token)
    return {
        "ok": True,
        "name": user.name,
        "email": user.email,
        "experience_mode": experience_mode_for(user),
        "parent_emergency_contact_configured": bool(
            user.parent_contact_consent and (user.parent_whatsapp or "").strip()
        ),
    }


@app.post("/api/auth/signin")
def auth_signin(request: Request, body: SignInRequest, response: Response) -> dict:
    client = request.client.host if request.client else "unknown"
    _auth_rate_check(client)
    store = get_auth_store(request)
    email = _validate_email(body.email)
    user = store.get_user_by_email(email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(user_id=user.id, email=user.email)
    _set_auth_cookie(response, token)
    return {
        "ok": True,
        "name": user.name,
        "email": user.email,
        "experience_mode": experience_mode_for(user),
        "parent_emergency_contact_configured": bool(
            user.parent_contact_consent and (user.parent_whatsapp or "").strip()
        ),
    }


@app.patch("/api/auth/parent-contact")
def auth_update_parent_contact(
    body: ParentContactUpdateRequest,
    user: UserRecord = Depends(get_current_user),
    store: AuthStore = Depends(get_auth_store),
) -> dict:
    """Save parent WhatsApp + consent for crisis WhatsApp alerts (for accounts that missed signup fields)."""
    parent_wa, parent_ok = _validate_parent_signup(body.parent_whatsapp, body.parent_contact_consent)
    updated = store.update_parent_contact(
        user.id,
        parent_whatsapp=parent_wa if parent_ok else "",
        parent_contact_consent=parent_ok,
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Could not update parent contact.")
    return {
        "ok": True,
        "parent_emergency_contact_configured": bool(
            updated.parent_contact_consent and (updated.parent_whatsapp or "").strip()
        ),
    }


@app.get("/api/auth/me")
def auth_me(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return {"authenticated": False}
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return {"authenticated": False}
    try:
        uid = int(payload["sub"])
    except (TypeError, ValueError):
        return {"authenticated": False}
    store = get_auth_store(request)
    user = store.get_user_by_id(uid)
    if user is None:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "name": user.name,
        "email": user.email,
        "experience_mode": experience_mode_for(user),
        "is_under_16": user.is_under_16(),
        "parent_emergency_contact_configured": bool(
            user.parent_contact_consent and (user.parent_whatsapp or "").strip()
        ),
    }


@app.post("/api/auth/signout")
def auth_signout(response: Response) -> dict:
    _clear_auth_cookie(response)
    return {"ok": True}


@app.post("/api/chat")
def api_chat(
    request: Request,
    body: ChatRequest,
    user: UserRecord = Depends(get_current_user),
) -> dict:
    """Text-only GraphRAG turn for users 16+ (under-16 accounts use push-to-talk /api/chat/audio)."""
    if user.is_under_16():
        raise HTTPException(
            status_code=403,
            detail="Text chat is available from age 16. Use push-to-talk voice mode.",
        )
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is empty.")

    resolved_session_id = _normalize_session_id(body.session_id)
    memory = get_session_memory(request)
    history = memory.get_recent_messages(resolved_session_id)
    session_mood = memory.get_mood_state(resolved_session_id)
    chat_model = (body.model or "").strip() or _default_ollama_chat_model()
    pid = patient_id_for(user)
    try:
        out = run_chat_turn(
            get_retriever(request),
            message,
            pid,
            user_profile={"name": user.name},
            conversation_history=history,
            model=chat_model,
            session_state=session_mood,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    memory.append_turn(resolved_session_id, user=message, assistant=out.get("answer", ""))
    data = _serialize_chat_out(out, include_retrieval=body.include_retrieval)
    data["session_id"] = resolved_session_id
    data["transcript"] = message
    analyzer = get_keystroke(request)
    if analyzer and body.keystroke_events:
        try:
            data["keystroke"] = analyzer.analyze(
                body.keystroke_events,
                body.keystroke_session or {},
            )
        except Exception as exc:  # pragma: no cover - keep chat working on analyzer errors
            logger.warning("keystroke_analysis_failed: %s", exc)
    crisis_out = handle_crisis_post_turn(
        get_auth_store(request),
        get_crisis_redis(request),
        user,
        message,
        reply_lang=str(out.get("lang") or "en"),
    )
    if crisis_out.get("crisis_support_notified"):
        data["crisis_support_notified"] = True
    return data


@app.post("/api/chat/audio")
async def api_chat_audio(
    request: Request,
    file: UploadFile = File(...),
    session_id: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    whisper_language: Optional[str] = Query(None, description="ISO language hint for Whisper, e.g. fr"),
    include_retrieval: bool = Query(False),
    user: UserRecord = Depends(get_current_user),
) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio file")
    name = file.filename or "recording.webm"
    show_voice_debug = _voice_lab_debug_allowed(request)

    monitor_payload: Dict[str, Any] = {
        "phase": "neutral",
        "confidence": 0.0,
        "raw_phase": "",
        "monitor_reached": False,
        "error_hint": "",
    }
    wav_path: Optional[str] = None
    xai_payload: Optional[Dict[str, Any]] = None
    try:
        try:
            wav_path = await asyncio.to_thread(bytes_to_wav_tempfile, raw, name)
        except Exception as exc:
            logger.warning("WAV conversion for mood monitor skipped: %s", exc)
            monitor_payload["error_hint"] = (f"WAV/ffmpeg: {exc}")[:240]

        if wav_path:
            transcript, monitor_payload = await asyncio.gather(
                asyncio.to_thread(
                    transcribe_audio_bytes,
                    raw,
                    original_filename=name,
                    language=whisper_language,
                ),
                predict_mood_from_wav_path_async(Path(wav_path)),
            )
            if monitor_payload.get("monitor_reached"):
                xai_payload = await explain_wav_async(Path(wav_path))
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

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="No speech detected; try again or use text.")

    resolved_session_id = _normalize_session_id(session_id)
    memory = get_session_memory(request)
    memory.set_mood_state(
        resolved_session_id,
        str(monitor_payload.get("phase") or "neutral"),
        float(monitor_payload.get("confidence") or 0.0),
    )
    if memory.available:
        session_mood = memory.get_mood_state(resolved_session_id)
    else:
        session_mood = {
            "mood_state": str(monitor_payload.get("phase") or "neutral"),
            "mood_confidence": float(monitor_payload.get("confidence") or 0.0),
            "last_updated": None,
        }

    history = memory.get_recent_messages(resolved_session_id)
    chat_model = model or _default_ollama_chat_model()
    pid = patient_id_for(user)
    voice_debug_out: Optional[Dict[str, Any]] = {} if show_voice_debug else None
    try:
        out = run_chat_turn(
            get_retriever(request),
            transcript,
            pid,
            user_profile={"name": user.name},
            conversation_history=history,
            model=chat_model,
            session_state=session_mood,
            voice_prompt_debug=show_voice_debug,
            voice_debug_out=voice_debug_out,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    memory.append_turn(resolved_session_id, user=transcript, assistant=out.get("answer", ""))
    data = _serialize_chat_out(out, include_retrieval=include_retrieval)
    data["transcript"] = transcript
    data["session_id"] = resolved_session_id
    data["voice_mood"] = {
        "phase": str(monitor_payload.get("phase") or "neutral"),
        "raw_phase": str(monitor_payload.get("raw_phase") or "").strip(),
        "confidence": float(monitor_payload.get("confidence") or 0.0),
        "monitor_reached": bool(monitor_payload.get("monitor_reached")),
        "error_hint": str(monitor_payload.get("error_hint") or "").strip(),
        "predict_url": predict_audio_url(),
    }
    if show_voice_debug and voice_debug_out is not None:
        data["voice_prompt_debug"] = {
            "monitor_response": dict(monitor_payload),
            "mood_injection_text": voice_debug_out.get("mood_injection_text", ""),
            "system_prompt_prefix_preview": voice_debug_out.get("system_prompt_prefix_preview", ""),
        }

    memory.append_voice_turn(
        resolved_session_id,
        {
            "phase": str(monitor_payload.get("phase") or "neutral"),
            "raw_phase": str(monitor_payload.get("raw_phase") or "").strip(),
            "confidence": float(monitor_payload.get("confidence") or 0.0),
            "monitor_reached": bool(monitor_payload.get("monitor_reached")),
            "error_hint": str(monitor_payload.get("error_hint") or "").strip(),
            "xai": xai_payload,
        },
    )
    crisis_out = handle_crisis_post_turn(
        get_auth_store(request),
        get_crisis_redis(request),
        user,
        transcript,
        reply_lang=str(out.get("lang") or "en"),
    )
    if crisis_out.get("crisis_support_notified"):
        data["crisis_support_notified"] = True
    return data


@app.post("/api/session/voice-report")
def api_session_voice_report(
    request: Request,
    body: SessionVoiceReportRequest,
    user: UserRecord = Depends(get_current_user),
) -> dict:
    """Dominant mapped phase + per-turn voice history (with XAI images when stored). Clears voice history after success."""
    resolved_session_id = _normalize_session_id(body.session_id)
    memory = get_session_memory(request)
    turns = memory.get_voice_history(resolved_session_id)
    summary = summarize_voice_phases(turns)
    n_with_monitor = sum(1 for t in turns if bool(t.get("monitor_reached")))
    out: Dict[str, Any] = {
        "ok": True,
        "session_id": resolved_session_id,
        "session_memory_available": bool(memory.available),
        "summary": summary,
        "turns": turns,
        "n_turns": len(turns),
        "n_with_monitor": n_with_monitor,
        "disclaimer": "Educational / monitoring visualization only — not a medical diagnosis.",
    }
    if memory.available:
        memory.clear_voice_history(resolved_session_id)
    return out


@app.post("/api/chat/image")
async def api_chat_image(
    request: Request,
    file: UploadFile = File(...),
    message: Optional[str] = Form(None),
    session_id: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    vision_model: Optional[str] = Query(None),
    include_retrieval: bool = Query(False),
    user: UserRecord = Depends(get_current_user),
) -> dict:
    """Photo flow: OLLAMA_VISION_MODEL (e.g. Llava) captions the image via /api/chat.

    The caption is merged with the optional user note, then run_chat_turn runs GraphRAG
    retrieval on that text and OLLAMA_CHAT_MODEL (e.g. Qwen) generates the reply via
    /api/generate. The text model never receives raw image bytes—only caption + chunks.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")
    max_bytes = _chat_image_max_bytes()
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large (max {max_bytes} bytes).",
        )
    try:
        _sniff_image_media_type(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_note = (message or "").strip()
    vm = (vision_model or "").strip() or default_ollama_vision_model()
    try:
        caption = caption_image_bytes(
            raw,
            model=vm,
            user_note=user_note,
            timeout_sec=vision_caption_read_timeout_seconds(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - network / Ollama
        raise HTTPException(status_code=502, detail=f"Image caption failed: {exc}") from exc

    try:
        merged = merge_user_note_and_image_caption(user_note, caption)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    resolved_session_id = _normalize_session_id(session_id)
    memory = get_session_memory(request)
    history = memory.get_recent_messages(resolved_session_id)
    session_mood = memory.get_mood_state(resolved_session_id)
    chat_model = model or _default_ollama_chat_model()
    pid = patient_id_for(user)
    try:
        out = run_chat_turn(
            get_retriever(request),
            merged,
            pid,
            user_profile={"name": user.name},
            conversation_history=history,
            model=chat_model,
            session_state=session_mood,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    transcript_ui = photo_turn_transcript_for_ui(user_note, caption)
    memory.append_turn(resolved_session_id, user=merged, assistant=out.get("answer", ""))
    data = _serialize_chat_out(out, include_retrieval=include_retrieval)
    data["transcript"] = transcript_ui
    data["image_caption"] = caption
    data["session_id"] = resolved_session_id
    crisis_out = handle_crisis_post_turn(
        get_auth_store(request),
        get_crisis_redis(request),
        user,
        merged,
        reply_lang=str(out.get("lang") or "en"),
    )
    if crisis_out.get("crisis_support_notified"):
        data["crisis_support_notified"] = True
    return data


@app.post("/api/tts")
async def api_tts(
    body: TtsRequest,
    user: UserRecord = Depends(get_current_user),
) -> Response:
    try:
        mp3 = await synthesize_speech_mp3(body.text, lang=body.lang, voice=body.voice)
    except ImportError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}") from exc
    return Response(content=mp3, media_type="audio/mpeg")


def main() -> None:
    import uvicorn

    host = os.getenv("WEB_HOST", "127.0.0.1")
    port = int(os.getenv("WEB_PORT", "8000"))
    uvicorn.run(
        "graphrag.web_api:app",
        host=host,
        port=port,
        reload=os.getenv("WEB_RELOAD", "").lower() in ("1", "true", "yes"),
    )


if __name__ == "__main__":
    main()
