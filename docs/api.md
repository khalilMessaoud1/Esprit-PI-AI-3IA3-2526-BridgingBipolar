# API & ports

## NestJS — `apps/api` (port 4001)

Base URL locale : `http://localhost:4001`

| Route | Description |
|-------|-------------|
| `POST /auth/signup` | Inscription (patient / médecin / proche) |
| `POST /auth/login` | Connexion |
| `GET /user/me` | Profil connecté |
| `POST /activity` | Check-in sommeil / activité |
| `GET /doctor/patients` | Liste patients (médecin) |
| `GET /doctor/patients/:id` | Fiche + rapport hebdomadaire |
| `POST /chat/*` | Proxy vers RAG (companion) |
| `POST /upload/file` | Avatar / fichiers |

Documentation complète : lancer l'API et explorer les controllers dans `apps/api/src/`.

## Services Python

| Service | Port | Health |
|---------|------|--------|
| ML (sommeil) | 5000 | `GET /health` |
| Handwriting | 5002 | `GET /health` |
| Prescription | 5020 | `GET /health` |
| RAG | 8090 | `GET /health` |
| Phase monitor | 8001 | `GET /docs` (FastAPI) |

## Variables front (`apps/web/.env`)

- `NEXT_PUBLIC_API_URL` → Nest API
- `NEXT_PUBLIC_ML_URL` → ML service
- `NEXT_PUBLIC_HANDWRITING_API_URL` → Handwriting
- `RAG_SERVICE_URL` → RAG (proxy Next pour assets statiques)
