from __future__ import annotations

import logging

from dotenv import load_dotenv
from fastapi import FastAPI

from app.bootstrap import ensure_graphrag_path, youssef_root

logger = logging.getLogger(__name__)


def get_or_create_retriever(app: FastAPI):
    if getattr(app.state, "retriever", None) is None:
        ensure_graphrag_path()
        from graphrag.chat_pipeline import build_retriever_from_env

        youssef = youssef_root()
        load_dotenv(youssef / ".env")

        logger.info("Loading GraphRAG retriever lazily...")
        app.state.retriever = build_retriever_from_env()
        logger.info("GraphRAG retriever loaded successfully.")

    return app.state.retriever
