# Prescription OCR service (FastAPI)

Pipeline aligned with `backup.ipynb`: **EasyOCR** → text cleanup → **RxNorm / BDPM** fuzzy name correction → **Ollama** (e.g. `llama3` / `llama3.2`) structured JSON, with a **heuristic fallback** if Ollama is off.

**Pour que tout tourne :** le service Python doit écouter sur le **port 5020** (`npm run dev` à la racine du monorepo, ou `npm run dev:prescription`). Pour une extraction JSON plus fiable, gardez **`ollama serve`** actif et un modèle installé (`ollama pull llama3` ou `ollama pull llama3.2`). Le défaut du code est **`llama3.2:latest`** ; ajustez avec **`OLLAMA_MODEL`** si vous utilisez un autre tag.

## Run

```bash
cd apps/prescription-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
npm run dev
```

Default URL: `http://127.0.0.1:5020` — health: `GET /health`, analyze: `POST /parse` (multipart field `file`).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base |
| `OLLAMA_MODEL` | `llama3.2:latest` | Tag du modèle Ollama (ex. `llama3:8b`) |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Allowed browser origins |

## Nest / monorepo

`apps/api` proxies authenticated patients to this service via `POST /medication/parse`. Set `PRESCRIPTION_SERVICE_URL` in `apps/api/.env` (see `.env.example`).

From repo root, `npm run dev` starts web, API, and this service together.
