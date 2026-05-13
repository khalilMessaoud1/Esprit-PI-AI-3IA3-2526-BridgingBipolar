from _future_ import annotations

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.bootstrap import ensure_graphrag_path, graphrag_project_root, youssef_root
from app.deps import cors_origins, require_rag_api_key

# Must run before importing routes that use services.* under inetgration/youssef
ensure_graphrag_path()

from app.routes import chat, health, image, tts, voice

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(_name_)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Render needs the app to open a port quickly.
    So we DO NOT build the RAG retriever here.
    The retriever will be loaded later, only when the chat endpoint needs it.
    """
    ensure_graphrag_path()

    from graphrag.crisis_redis import CrisisRedisStore
    from graphrag.keystroke_analyzer import KeystrokeAnalyzer
    from graphrag.session_memory import SessionMemoryStore

    youssef = youssef_root()
    load_dotenv(youssef / ".env")

    # Lazy loading: retriever is not loaded during startup
    app.state.retriever = None

    try:
        app.state.session_memory = SessionMemoryStore.from_env()
        logger.info("SessionMemoryStore loaded successfully.")
    except Exception as exc:
        logger.warning("SessionMemoryStore not loaded: %s", exc)
        app.state.session_memory = None

    try:
        app.state.crisis_redis = CrisisRedisStore.from_env()
        logger.info("CrisisRedisStore loaded successfully.")
    except Exception as exc:
        logger.warning("CrisisRedisStore not loaded: %s", exc)
        app.state.crisis_redis = None

    artifacts = youssef / "artifacts" / "keystroke"

    try:
        app.state.keystroke = KeystrokeAnalyzer.from_artifacts(artifacts)
    except Exception as exc:
        logger.warning("KeystrokeAnalyzer not loaded: %s", exc)
        app.state.keystroke = None

    if app.state.keystroke is None:
        logger.warning("KeystrokeAnalyzer not loaded; missing artifacts under %s", artifacts)
    else:
        logger.info("KeystrokeAnalyzer loaded successfully.")

    logger.info("FastAPI startup finished. Retriever will be loaded lazily.")

    yield

    retriever = getattr(app.state, "retriever", None)
    if retriever is not None:
        try:
            retriever.close()
            logger.info("Retriever closed successfully.")
        except Exception as exc:
            logger.warning("Failed to close retriever: %s", exc)


def get_or_create_retriever(app: FastAPI):
    """
    Lazy loader for GraphRAG retriever.
    Call this inside routes when you need the retriever.
    """
    if getattr(app.state, "retriever", None) is None:
        ensure_graphrag_path()
        from graphrag.chat_pipeline import build_retriever_from_env

        youssef = youssef_root()
        load_dotenv(youssef / ".env")

        logger.info("Loading GraphRAG retriever lazily...")
        app.state.retriever = build_retriever_from_env()
        logger.info("GraphRAG retriever loaded successfully.")

    return app.state.retriever


def create_app() -> FastAPI:
    # Load .env before imports that read os.environ at import time
    root = graphrag_project_root()
    load_dotenv(root / "inetgration" / "youssef" / ".env")
    ensure_graphrag_path()

    app = FastAPI(
        title="BridgingBipolar RAG API",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)

    # Serves inetgration/youssef/graphrag/static at /static
    static_dir = youssef_root() / "graphrag" / "static"
    if static_dir.is_dir():
        app.mount(
            "/static",
            StaticFiles(directory=str(static_dir)),
            name="graphrag_static",
        )

    dep = [Depends(require_rag_api_key)]

    app.include_router(chat.router, dependencies=dep)
    app.include_router(voice.router, dependencies=dep)
    app.include_router(image.router, dependencies=dep)
    app.include_router(tts.router, dependencies=dep)

    return app


app = create_app()