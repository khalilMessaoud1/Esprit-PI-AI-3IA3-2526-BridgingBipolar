# Fiche de soumission GitHub ESPRIT — BridgingBipolar

> Document de travail à recopier dans `Fiche_Soumission_GitHub_ESPRIT.docx`.  
> Année universitaire **2025-2026**.

---

## 1. Informations sur l'équipe

| Champ | Valeur |
|-------|--------|
| **Classe** | 3IA3 |
| **Groupe** | Alpha |
| **Tuteur(s)** | Dr. Jihene HLEL · Mrs. Wided ASKRI · Mr. Fedi BACCAR |
| **Adresse e-mail étudiant vis-à-vis** | khalil.messaoud@esprit.tn |

**Membres de l'équipe :** Khalil MESSAOUD · Roua ZEKRI · Med Khalil HAOUARI · Youssef BOUHAMED · Oumeima WAHADA · Med Yassine MAALEJ

---

## 2. Informations sur le projet

| Champ | Valeur |
|-------|--------|
| **Nom du projet** | `Esprit-PI-AI-3IA3-2526-BridgingBipolar` |
| **Lien GitHub** | https://github.com/khalilMessaoud1/Esprit-PI-AI-3IA3-2526-BridgingBipolar |
| **Technologies utilisées** | Next.js 14, React, Tailwind CSS, NestJS, Prisma, PostgreSQL, Python (FastAPI / Flask), Ollama, Qdrant, GraphRAG, Docker Compose, scikit-learn, Whisper |
| **Type de projet** | Web + IA |
| **Commande de lancement** | `npm install` → `.\scripts\setup-env.ps1` → `npm run dev:deps` → `.\scripts\start-dev.ps1` |
| **Temps d'installation estimé** | ~10 min (web + API) · ~20–40 min (stack IA complète + Ollama) |
| **Lien de déploiement** | Non disponible |
| **Modèles IA (annexe A)** | https://huggingface.co/khalil0101/BridgingBipolar-models — `.\scripts\download-models.ps1` |
| **Démo visuelle** | `demo/screenshots/` (10 captures) · vidéo : https://youtu.be/jfptvoVh6F4 |

### Commande minimale (évaluateur pressé)

```powershell
git clone https://github.com/khalilMessaoud1/Esprit-PI-AI-3IA3-2526-BridgingBipolar.git
cd Esprit-PI-AI-3IA3-2526-BridgingBipolar
npm install
.\scripts\setup-env.ps1
npm run dev:deps
npm run dev
```

→ http://localhost:3000 (inscription patient + dashboard)

---

## 3. Checklist obligatoire

| Élément à vérifier | Réponse |
|--------------------|---------|
| Nom du dépôt conforme au format `Esprit-[PI]-[Classe]-2526-...` | **Oui** |
| Dépôt public sur GitHub | **Oui** |
| README.md complet | **Oui** |
| Fichier `.gitignore` présent | **Oui** |
| Fichier `.env.example` présent | **Oui** (racine + apps/services) |
| Dossier `docs/` présent | **Oui** |
| Le projet se lance sans aide externe | **Oui** (README autonome ; Ollama requis uniquement pour chat/voix/OCR) |
| Base de données fournie (script/migration) | **Oui** — Docker Postgres + `prisma migrate deploy` via `npm run dev:deps` |
| Aucun credential / clé API dans le dépôt | **Confirmé** |

---

## 4. Prérequis techniques

| Technologie / Outil | Version requise |
|---------------------|-----------------|
| Node.js | 20+ |
| npm | 10+ |
| Python | 3.11+ |
| Docker Desktop | Requis (PostgreSQL, Qdrant) |
| Ollama | Optionnel — requis pour companion, vision, OCR ordonnances |
| PowerShell | 5+ (Windows — scripts fournis) |

**Modèles Ollama (stack complète) :** `ollama pull llama3.2:3b` · `ollama pull llava:7b`

---

## 5. Déclaration et signature

> Je certifie que le projet soumis est fonctionnel, que le dépôt ne contient aucune donnée sensible, et que toutes les exigences du guide ESPRIT GitHub ont été respectées.

| Champ | Valeur |
|-------|--------|
| **Date de soumission** | 08/06/2026 |
| **Signature de l'étudiant** | Khalil MESSAOUD |

---

## Points encore à finaliser avant envoi

- [x] **Groupe** (Alpha) et **e-mail** de contact dans la fiche Word
- [x] **Lien vidéo démo** — https://youtu.be/jfptvoVh6F4
- [ ] Pousser les **captures d'écran** (`demo/screenshots/`) sur GitHub si pas encore fait
- [ ] Demande de publication sur l'**organisation ESPRIT** (e-mail encadrants)
