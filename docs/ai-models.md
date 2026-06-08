# IA & modèles (annexe ESPRIT)

Ce projet est classé **projet avec IA intégrée**. Règles appliquées :

## A. Modèles entraînés — hébergement externe

Conformément au guide ESPRIT, les fichiers entraînés **ne sont jamais poussés dans Git**.

| Modèle | Fichiers | Emplacement local | Obtention |
|--------|----------|-------------------|-----------|
| Phase monitor (voix) | `tachyphemia_cnn_final.keras`, `wav2vec2-emotion_final/` | `inetgration/integration_kh/models/` | Hugging Face + `download-models.ps1` |
| Keystroke / souris | `*.joblib`, `meta.json` | `inetgration/youssef/artifacts/keystroke/` | Hugging Face **ou** `npm run models:train-keystroke` |

### Téléchargement automatique

```powershell
.\scripts\download-models.ps1
# ou
npm run models:download
```

Configuration : [`models/manifest.json`](../models/manifest.json) · guide : [`models/README.md`](../models/README.md)

**Lien Hugging Face** : https://huggingface.co/khalil0101/BridgingBipolar-models

---

## B. Modèles — non versionnés dans Git

Les fichiers suivants sont **interdits** dans le dépôt (`.gitignore`) :

- `.pkl`, `.joblib`, `.h5`, `.pt`, `.pth`, `.onnx`, `.bin`, `.safetensors`
- Dossiers `inetgration/integration_kh/models/`, `inetgration/youssef/artifacts/`, `checkpoints/`

## C. Modèles runtime (téléchargement auto)

| Usage | Modèle | Obtention |
|-------|--------|-----------|
| Chat companion | `llama3.2:3b` | `ollama pull llama3.2:3b` |
| Vision (photos chat) | `llava:7b` | `ollama pull llava:7b` |
| OCR ordonnances | `llama3.2:latest` | `ollama pull llama3.2:latest` |
| Transcription voix | Whisper `base` | Téléchargé au 1er run (env `WHISPER_MODEL`) |
| Embeddings RAG | `sentence-transformers` | Téléchargé via Hugging Face au 1er run |
| Reranker (optionnel) | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Hugging Face |
| EasyOCR | weights OCR | Cache local au 1er scan ordonnance |

## Python & versions

- **Python 3.11+** pour tous les microservices
- Fichiers `requirements.txt` :
  - `rag_api/requirements-lite.txt`
  - `apps/ml-service/requirements.txt`
  - `apps/handwriting-api/requirements.txt`
  - `apps/prescription-service/requirements.txt`

Environnement virtuel RAG :

```powershell
cd rag_api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-lite.txt
```

## GPU (optionnel)

- Ollama utilise le GPU si disponible (CUDA)
- Sans GPU : fonctionnement CPU possible mais plus lent (vision, OCR)

## Ingestion GraphRAG

```bash
npm run rag:ingest
```

Indexe les documents bipolarité dans Qdrant (nécessite Qdrant + dépendances Python).

## Critère d'acceptation ESPRIT (IA)

Une personne externe peut :

- lancer via **README + Ollama + Docker** en ~20 min (stack complète), ou
- tester le **web + API** en ~10 min (mode minimal)

+ consulter une **démo** dans `demo/` (captures ou vidéo).
