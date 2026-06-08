# BridgingBipolar

Plateforme de suivi du trouble bipolaire (multimodal : humeur, voix, sommeil, écriture, questionnaires, chat IA).  
Projet **Challenge-Based Learning (CBL) — Esprit School of Engineering**, année **2025-2026**.

> **Règle d'or (publication ESPRIT)** : une personne externe doit pouvoir lancer le projet en suivant **uniquement ce README**.  
> **Parcours minimal** (web + API + inscription) : ~10 min · **Stack complète** (IA + Ollama) : ~20–40 min selon la connexion.

---

## Description

BridgingBipolar aide patients et médecins entre les consultations : check-ins quotidiens, rapports hebdomadaires visuels, analyse vocale, OCR d'ordonnances, companion GraphRAG, et indices de stabilité de l'humeur.  
Les modèles IA (Ollama, Whisper, scikit-learn) tournent **en local** ; aucun fichier de modèle entraîné n'est versionné dans Git.

---

## Technologies

| Couche | Stack |
|--------|--------|
| Frontend | Next.js 14, React, Tailwind CSS, Recharts |
| Backend API | NestJS, Prisma, PostgreSQL |
| Services IA | Python (FastAPI / Flask), Ollama, Qdrant, GraphRAG |
| OCR ordonnances | EasyOCR, Ollama (`llama3.2`) |
| Voix / phase | Whisper, service phase-monitor |
| Infra locale | Docker Compose (Postgres, Qdrant) |

**Python** : 3.11+ (services ML) · **Node.js** : 20+

---

## Prérequis

- [Node.js 20+](https://nodejs.org/) et npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Postgres + Qdrant)
- [Ollama](https://ollama.com/) (modèles locaux — stack complète uniquement)
- [Python 3.11+](https://www.python.org/) (services ML / RAG)
- Windows : PowerShell 5+ (scripts fournis) · Linux/macOS : adapter les commandes

### Modèles Ollama (stack complète — chat / vision / ordonnances)

```bash
ollama pull llama3.2:3b
ollama pull llava:7b
ollama pull llama3.2:latest
```

Gardez `ollama serve` actif (port **11434**).

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/khalilMessaoud1/Esprit-PI-AI-3IA3-2526-BridgingBipolar.git
cd Esprit-PI-AI-3IA3-2526-BridgingBipolar
```

Nom ESPRIT : `Esprit-PI-AI-3IA3-2526-BridgingBipolar`

### 2. Installer les dépendances Node

```bash
npm install
```

### 3. Variables d'environnement

```powershell
# Windows
.\scripts\setup-env.ps1
```

Puis éditez si besoin :

- `apps/web/.env`
- `apps/api/.env`
- `apps/prescription-service/.env`
- `inetgration/youssef/.env`

Voir `.env.example` à la racine pour la liste complète. **Ne jamais committer de vrais secrets.**

### 4. Base de données (Docker + migrations)

```bash
npm run dev:deps
```

Démarre **PostgreSQL** (5432) et **Qdrant** (6333), puis applique les migrations Prisma.

### 5. Environnement Python RAG (une fois — stack complète)

```powershell
cd rag_api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-lite.txt
cd ..
```

### 6. (Optionnel) Index GraphRAG

Pour le companion avec base de connaissances bipolarité :

```bash
npm run rag:ingest
```

### 7. Modèles entraînés (annexe ESPRIT — section A)

Les poids **`.keras`, `.joblib`, etc.** ne sont **pas** dans Git. Téléchargez-les :

```powershell
.\scripts\download-models.ps1
```

Ou entraînez les modèles clavier en local :

```powershell
.\scripts\download-models.ps1 -TrainKeystroke
```

| Source | Lien / commande |
|--------|------------------|
| **Manifest + script** | [`models/manifest.json`](models/manifest.json) · [`models/README.md`](models/README.md) |
| **Hugging Face Hub** | https://huggingface.co/khalil0101/BridgingBipolar-models |
| **Ollama** (chat, vision, OCR) | `ollama pull llama3.2:3b` · `ollama pull llava:7b` |

---

## Lancement

### Stack complète (recommandé — Windows)

```powershell
.\scripts\start-dev.ps1
```

Ouvre plusieurs fenêtres : Web, API, RAG, ML, handwriting, phase-monitor.

| Service | URL |
|---------|-----|
| **Application web** | http://localhost:3000 |
| **API Nest** | http://localhost:4001 |
| **RAG / Companion** | http://localhost:8090 |
| **ML (sommeil / activité)** | http://localhost:5000 |
| **Handwriting** | http://127.0.0.1:5002 |
| **Prescription OCR** | http://localhost:5020 |
| **Phase monitor (voix)** | http://localhost:8001 |

> **Prescription OCR** : non inclus dans `start-dev.ps1`. Dans un terminal séparé :  
> `npm run dev:prescription`

### Lancement minimal (web + API — ~10 min)

```bash
npm run dev:deps
npm run dev
```

Inscription patient, dashboard et API fonctionnent. Chat, voix, OCR et companion nécessitent la stack complète + Ollama.

### Docker (services partiels)

```bash
docker compose up -d postgres qdrant
```

Puis lancez web/api localement avec `npm run dev`.

---

## Test utilisateur externe

```powershell
git clone https://github.com/khalilMessaoud1/Esprit-PI-AI-3IA3-2526-BridgingBipolar.git
cd Esprit-PI-AI-3IA3-2526-BridgingBipolar
npm install
.\scripts\setup-env.ps1
npm run dev:deps
.\scripts\download-models.ps1   # modèles HF (voix, keystroke) — non inclus dans start-dev.ps1
.\scripts\start-dev.ps1
```

> **Modèles Hugging Face** : `download-models.ps1` n’est **pas** lancé automatiquement par `setup-env.ps1` ni `start-dev.ps1`.  
> Obligatoire pour l’analyse vocale (phase-monitor) et le comportement digital ; **optionnel** pour inscription + dashboards web/API seuls.  
> **Ollama** (companion, OCR) : `ollama pull llama3.2:3b` et `ollama pull llava:7b` si vous testez la stack IA complète.

Vérifiez :

- [ ] Inscription patient + acceptation des CGU
- [ ] Check-in sommeil / humeur
- [ ] Dashboard médecin (rapport hebdomadaire)
- [ ] README suffisant sans appel oral

---

## Variables d'environnement

| Fichier | Rôle |
|---------|------|
| `apps/web/.env.example` | URL API, ML, handwriting, RAG |
| `apps/api/.env.example` | JWT, Postgres, Twilio (optionnel), URLs services |
| `apps/prescription-service/.env.example` | Ollama OCR ordonnances |
| `inetgration/youssef/.env.example` | GraphRAG, Qdrant, Ollama vision/chat |

---

## Documentation

- [Architecture](docs/architecture.md)
- [API & ports](docs/api.md)
- [IA & modèles (annexe ESPRIT)](docs/ai-models.md)
- [Checklist publication ESPRIT](docs/PUBLICATION_ESPRIT.md)

---

## Démo

Captures d'écran et [vidéo démo](https://youtu.be/jfptvoVh6F4) : voir le dossier [`demo/`](demo/README.md).

---

## Structure du dépôt

```
BridgingBipolar/
├── apps/
│   ├── web/                 # Next.js (patient, médecin, companion)
│   ├── api/                 # NestJS + Prisma
│   ├── ml-service/          # Sommeil / activité (FastAPI)
│   ├── handwriting-api/     # Analyse écriture (Flask)
│   └── prescription-service/# OCR ordonnances
├── rag_api/                 # Adapter GraphRAG (FastAPI)
├── inetgration/             # GraphRAG, phase monitor, notebooks
├── docs/                    # Documentation technique
├── demo/                    # Captures / vidéo démo
├── scripts/                 # setup-env.ps1, start-dev.ps1
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Projet IA — conformité ESPRIT

### A. Modèles entraînés (non versionnés)

- Aucun `.pkl`, `.pt`, `.h5`, `.keras`, `.joblib` dans le dépôt (voir `.gitignore`)
- **Hébergement** : [BridgingBipolar-models sur Hugging Face](https://huggingface.co/khalil0101/BridgingBipolar-models)
- **Téléchargement** : `.\scripts\download-models.ps1` ou `npm run models:download`
- **Documentation** : [`models/README.md`](models/README.md) · [`models/manifest.json`](models/manifest.json)

### B. Modèles runtime (Ollama / Hugging Face auto)

- Modèles via **Ollama** (`ollama pull …`) ou Hugging Face au 1er lancement
- `requirements.txt` dans chaque service Python
- Docker Compose pour Postgres / Qdrant
- Détails : [docs/ai-models.md](docs/ai-models.md)

---

## Auteurs

- **Khalil MESSAOUD**
- **Roua ZEKRI**
- **Med Khalil HAOUARI**
- **Youssef BOUHAMED**
- **Oumeima WAHADA**
- **Med Yassine MAALEJ**

**Classe / PI** : 3IA3 — PI AI · **Année** : 2025-2026

**Encadrants** : Dr. Jihene HLEL, Mrs. Wided ASKRI, Mr. Fedi BACCAR — Esprit School of Engineering

---

## Licence

Projet académique — Esprit School of Engineering. Usage pédagogique et de recherche.
