# Modèles entraînés (annexe ESPRIT — section A)

Les fichiers **`.pkl`, `.joblib`, `.h5`, `.keras`, `.pt`, `.onnx`, `.bin`** ne sont **pas** dans Git (voir `.gitignore`).

## Téléchargement automatique

```powershell
# Windows
.\scripts\download-models.ps1
```

```bash
python scripts/download_models.py
```

Liste des artefacts : [`manifest.json`](manifest.json)

## Modèles entraînés à héberger (équipe)

| Bundle | Fichiers | Dossier local |
|--------|----------|---------------|
| **phase-monitor-voice** | `tachyphemia_cnn_final.keras`, dossier `wav2vec2-emotion_final/` | `inetgration/integration_kh/models/` |
| **keystroke-artifacts** | `m3_knn.joblib`, `m3_ridge.joblib`, `m2_rf.joblib`, `meta.json` | `inetgration/youssef/artifacts/keystroke/` |

### Publier sur Hugging Face Hub (recommandé)

1. Créez un repo public, ex. `khalilMessaoud1/BridgingBipolar-models`
2. Uploadez la structure :

```
phase-monitor/
  tachyphemia_cnn_final.keras
  wav2vec2-emotion_final/
    config.json
    model.safetensors
    preprocessor_config.json
keystroke/
  m3_knn.joblib
  m3_ridge.joblib
  m2_rf.joblib
  meta.json
```

3. Mettez à jour `base_url` dans `models/manifest.json` :

```json
"base_url": "https://huggingface.co/khalil0101/BridgingBipolar-models/resolve/main"
```

4. Relancez `.\scripts\download-models.ps1`

### Alternative — Google Drive / Kaggle

Ajoutez une URL directe par fichier dans `manifest.json` :

```json
{
  "name": "tachyphemia_cnn_final.keras",
  "url": "https://drive.google.com/uc?export=download&id=VOTRE_ID"
}
```

### Alternative — entraîner les modèles clavier en local

Sans Hugging Face :

```powershell
.\scripts\download-models.ps1 -TrainKeystroke
```

(Exécute `python -m graphrag.keystroke_train` dans `inetgration/youssef`.)

## Modèles téléchargés automatiquement au runtime (pas dans Git)

| Modèle | Méthode |
|--------|---------|
| Ollama (`llama3.2`, `llava`) | `ollama pull …` |
| Whisper | 1er appel API voix |
| sentence-transformers | `npm run rag:ingest` |
| EasyOCR | 1er scan ordonnance |

Détails : [docs/ai-models.md](../docs/ai-models.md)
