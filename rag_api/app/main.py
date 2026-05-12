from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.bootstrap import ensure_graphrag_path, graphrag_project_root, youssef_root
from app.deps import cors_origins, require_rag_api_key

# Must run before importing routes that use `services.*` (under inetgration/youssef).
ensure_graphrag_path()

from app.routes import chat, health, image, tts, voice

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_graphrag_path()
    from graphrag.chat_pipeline import build_retriever_from_env
    from graphrag.crisis_redis import CrisisRedisStore
    from graphrag.keystroke_analyzer import KeystrokeAnalyzer
    from graphrag.session_memory import SessionMemoryStore

    youssef = youssef_root()
    load_dotenv(youssef / ".env")

    try:
        retriever = build_retriever_from_env()
    except Exception as exc:
        logger.exception("retriever_startup_failed: %s", exc)
        raise
    app.state.retriever = retriever
    app.state.session_memory = SessionMemoryStore.from_env()
    app.state.crisis_redis = CrisisRedisStore.from_env()
    artifacts = youssef / "artifacts" / "keystroke"
    app.state.keystroke = KeystrokeAnalyzer.from_artifacts(artifacts)
    if app.state.keystroke is None:
        logger.warning("KeystrokeAnalyzer not loaded (missing artifacts under %s)", artifacts)

    yield
    retriever.close()


def create_app() -> FastAPI:
    # Load .env before imports that read os.environ at import time
    root = graphrag_project_root()
    load_dotenv(root / "inetgration" / "youssef" / ".env")
    ensure_graphrag_path()

    app = FastAPI(title="BridgingBipolar RAG API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    # Serves `inetgration/youssef/graphrag/static` at `/static` — used by Next `/graphrag-static/*` rewrites (VRM, etc.)
    static_dir = youssef_root() / "graphrag" / "static"
    if static_dir.is_dir():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="graphrag_static")

    dep = [Depends(require_rag_api_key)]
    app.include_router(chat.router, dependencies=dep)
    app.include_router(voice.router, dependencies=dep)
    app.include_router(image.router, dependencies=dep)
    app.include_router(tts.router, dependencies=dep)
    return app


app = create_app()
