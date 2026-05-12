# BridgingBipolar RAG API

FastAPI adapter around the existing GraphRAG package in `../inetgration/youssef` (no edits to `graphrag/`).

## Setup

1. Use the same Python environment as youssef (or create a venv and `pip install -r requirements.txt` from this folder).
2. Copy or reuse `../inetgration/youssef/.env` (Neo4j, Qdrant, Ollama, `REDIS_URL`, optional `BIPOLAR_MONITOR_URL`, Twilio, Whisper, etc.).
3. Optional: set `RAG_API_KEY` — if set, send header `X-RAG-API-KEY` on `/chat`, `/voice`, `/chat/image`.
4. Optional: `CORS_ORIGINS` comma-separated list (defaults include `http://localhost:3000`).

## Run

From this directory:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8090
```

## Endpoints

- `GET /health` — liveness (no API key).
- `POST /chat` — JSON body (see Nest `ChatService` for the shape Nest sends).
- `POST /voice` — multipart form (see Nest proxy).
- `POST /chat/image` — multipart image + form fields.

Nest defaults: `RAG_SERVICE_URL=http://127.0.0.1:8090`, `RAG_API_KEY` optional.
