# Checklist publication — Organisation ESPRIT GitHub

Guide source : *Guide Étudiant GitHub ESPRIT* (2025-2026).

## Étape 1 — Dépôt propre

- [ ] Nom du repo : `Esprit-[PI]-[Classe]-2526-BridgingBipolar`
- [ ] Branche principale : `main`
- [ ] Pas de `node_modules/`, `.next/`, `dist/`, `.venv/` commités
- [ ] Pas de `.env` réels (Twilio, Redis, AWS…) — uniquement `.env.example`
- [x] Pas de modèles ML lourds (`.pkl`, `.pt`, …) — script `download-models.ps1` + [`models/manifest.json`](../models/manifest.json)

## Étape 2 — Fichiers obligatoires

- [x] `README.md` (installation + lancement < 10 min)
- [x] `.gitignore`
- [x] `.env.example` (+ templates par service)
- [x] `docs/` (architecture, API, IA)
- [x] `demo/` — 10 captures PNG + vidéo https://youtu.be/jfptvoVh6F4
- [x] `package.json` (monorepo)

## Étape 3 — Projet lançable

- [ ] `npm install` OK
- [ ] `npm run dev:deps` OK (Docker)
- [ ] `.\scripts\setup-env.ps1` puis édition `.env`
- [ ] `ollama pull llama3.2:3b` + `llava:7b`
- [ ] `.\scripts\start-dev.ps1` → http://localhost:3000

## Étape 4 — Test externe

Cloner dans un dossier vide et suivre **uniquement** le README :

- [ ] Inscription patient fonctionne
- [ ] Dashboard médecin accessible
- [ ] Aucune étape orale requise

## Annexe IA

- [x] Modèles via Ollama / Hugging Face (pas dans Git)
- [x] `docs/ai-models.md`
- [x] `requirements.txt` par service Python
- [ ] Lien démo en ligne (optionnel : Hugging Face Spaces / Streamlit)

## Causes de rejet à éviter

- [ ] README vide ou incomplet
- [ ] Secrets dans le repo
- [ ] Projet ne démarre pas
- [ ] Plagiat

## Actions restantes (équipe)

1. Remplir **Auteurs / Classe / PI** dans `README.md`
2. ~~Ajouter **3–5 captures** dans `demo/screenshots/`~~ ✓ (10 captures)
3. ~~Enregistrer une **vidéo démo**~~ ✓ https://youtu.be/jfptvoVh6F4
4. Créer le repo GitHub public et pousser
5. Demander la publication sur l'organisation ESPRIT
