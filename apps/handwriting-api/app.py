"""
Handwriting pipeline API (dev stub) — matches BridgingBipolar /handwriting page.

Run:  python app.py
Env:  PORT=5002 (default)

Next:  NEXT_PUBLIC_HANDWRITING_API_URL=http://localhost:5002
"""

from __future__ import annotations

import math
import os
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- in-memory onboarding progress (resets on server restart) ---
_baseline_count: Dict[str, int] = defaultdict(int)
_session_count: Dict[str, int] = defaultdict(int)
_last_questionnaire: Dict[str, Dict[str, Any]] = {}
_signup_unstable: Dict[str, bool] = defaultdict(bool)
_pending_q_session: Dict[str, int] = {}
_baseline_session_stable: Dict[str, Dict[int, bool]] = defaultdict(dict)


def _required_baseline_sessions(patient_id: str) -> List[int]:
    required = [2, 3]
    if _signup_unstable.get(patient_id, False):
        required = [1, 2, 3]
    return required


def _is_baseline_complete(patient_id: str) -> bool:
    if _session_count.get(patient_id, 0) < 3:
        return False
    required = _required_baseline_sessions(patient_id)
    stable_map = _baseline_session_stable.get(patient_id, {})
    return all(stable_map.get(s, False) for s in required)


def _path_len(pts: List[Dict[str, Any]]) -> float:
    pen = [p for p in pts if p.get("pen_down", True)]
    if len(pen) < 2:
        return 0.0
    s = 0.0
    for i in range(1, len(pen)):
        dx = float(pen[i]["x"]) - float(pen[i - 1]["x"])
        dy = float(pen[i]["y"]) - float(pen[i - 1]["y"])
        s += math.hypot(dx, dy)
    return s


def _speed_std(pts: List[Dict[str, Any]]) -> float:
    speeds: List[float] = []
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        if not (a.get("pen_down", True) and b.get("pen_down", True)):
            continue
        dx = float(b["x"]) - float(a["x"])
        dy = float(b["y"]) - float(a["y"])
        dt = max(1e-6, (float(b["t"]) - float(a["t"])) / 1000.0)
        speeds.append(math.hypot(dx, dy) / dt)
    if len(speeds) < 2:
        return 0.0
    m = sum(speeds) / len(speeds)
    v = sum((x - m) ** 2 for x in speeds) / len(speeds)
    return math.sqrt(v)


def _score_from_reps(repetitions: List[List[Dict[str, Any]]]) -> Tuple[float, float, float]:
    """Returns (anomaly_score, qc_confidence, z_robust) — heuristic stub."""
    if not repetitions or not repetitions[0]:
        return 0.1, 0.5, 0.0
    rep = repetitions[0]
    n = len(rep)
    pl = _path_len(rep)
    sv = _speed_std(rep)
    # normalize to ~0..1 range for demo
    score = min(1.8, 0.08 + (sv / 5000.0) * 2.0 + (n / 5000.0))
    qc = min(0.99, 0.55 + min(0.4, pl / 8000.0))
    z = min(3.0, max(-1.0, (score - 0.35) * 4.0))
    return float(score), float(qc), float(z)


def _stub_session_response(*, onboarding: bool, patient_id: str) -> Dict[str, Any]:
    body = request.get_json(force=True, silent=True) or {}
    reps = body.get("repetitions") or []
    score, qc_conf, z_r = _score_from_reps(reps)
    threshold = 0.55

    out: Dict[str, Any] = {
        "score": round(score, 4),
        "threshold": threshold,
        "qc_confidence": round(qc_conf, 3),
        "deviation": score > threshold,
        "alert_j1": False,
        "alert_confirmed": False,
        "consecutive_count": 0,
        "z_robust": round(z_r, 2),
        "direction_prediction": "uncertain",
        "score_manie": round(max(0, score - 0.2), 3),
        "score_depression": round(max(0, 0.5 - score), 3),
        "dre_confidence": 0.4,
        "cusum_value": 0.0,
        "cusum_alert": False,
        "status_label": "Analyse reçue",
        "clinical_label": "Profil stable (aperçu)",
        "message": (
            "Votre échantillon a bien été pris en compte. "
            "Ce résultat est un aperçu technique de démonstration — en pratique clinique, "
            "votre équipe interprétera les données complètes."
        ),
        "questionnaire_required": [],
    }

    if onboarding:
        if bool(body.get("signup_unstable")):
            _signup_unstable[patient_id] = True
        _session_count[patient_id] += 1
        session_index = _session_count[patient_id]
        _baseline_count[patient_id] = min(3, session_index)
        required_sessions = _required_baseline_sessions(patient_id)
        out["session_index"] = session_index
        out["n_baseline"] = _baseline_count[patient_id]
        out["baseline_complete"] = _is_baseline_complete(patient_id)
        out["remaining_sessions"] = max(0, 3 - session_index)
        out["model_fitted"] = out["baseline_complete"]
        out["score"] = round(0.12 + 0.04 * min(3, session_index), 4)
        out["deviation"] = False
        out["z_robust"] = 0.0

        # Baseline policy:
        # - Sessions 2 and 3 always require ASRM + PHQ-9.
        # - Session 1 requires them only if signup questionnaires were unstable.
        # - Monitoring never requires baseline questionnaires.
        if session_index in required_sessions:
            out["questionnaire_required"] = ["asrm", "phq9"]
            _pending_q_session[patient_id] = session_index
            out["status_label"] = f"Baseline — session {session_index}/3"
            out["message"] = (
                "ASRM + PHQ-9 required for baseline validation. "
                "Baseline will be accepted only if the required sessions are stable."
            )
        elif session_index >= 3 and not out["baseline_complete"]:
            out["status_label"] = "Baseline pending"
            out["message"] = (
                "Baseline is not validated yet. Complete required questionnaire sessions with stable scores."
            )
    else:
        # No ASRM/PHQ-9 in monitoring per product rule.
        out["questionnaire_required"] = []
        out["baseline_complete"] = _is_baseline_complete(patient_id)
        out["model_fitted"] = out["baseline_complete"]
        if not out["baseline_complete"]:
            out["status_label"] = "Baseline required"
            out["message"] = (
                "Baseline is not accepted yet. Complete baseline sessions with stable ASRM + PHQ-9 scores."
            )

    return out


# --- questionnaire stubs (French) ---

_SCALE_DEFS: Dict[str, Dict[str, Any]] = {
    "ymrs": {
        "instructions": "Échelle maniaque simplifiée (démo) — choisissez l’intensité.",
        "cutoff": 12,
        "max_total": 60,
        "items": [
            {
                "id": "ymrs_elevated_mood",
                "label": "Humeur anormalement élevée ?",
                "max_score": 4,
                "options": [
                    "Absent",
                    "Léger",
                    "Modéré",
                    "Sévère",
                    "Extrême",
                ],
            },
            {
                "id": "ymrs_energy",
                "label": "Énergie ou activité accrue ?",
                "max_score": 4,
                "options": ["Absent", "Léger", "Modéré", "Sévère", "Extrême"],
            },
        ],
    },
    "madrs": {
        "instructions": "Échelle dépressive simplifiée (démo).",
        "cutoff": 12,
        "max_total": 60,
        "items": [
            {
                "id": "madrs_sadness",
                "label": "Apparence de tristesse ?",
                "max_score": 6,
                "options": [
                    "Absent",
                    "Indicible",
                    "Léger",
                    "Modéré",
                    "Marqué",
                    "Sévère",
                    "Extrême",
                ],
            },
            {
                "id": "madrs_reported_sadness",
                "label": "Tristesse rapportée ?",
                "max_score": 6,
                "options": [
                    "Absent",
                    "Indicible",
                    "Léger",
                    "Modéré",
                    "Marqué",
                    "Sévère",
                    "Extrême",
                ],
            },
        ],
    },
    "asrm": {
        "instructions": (
            "ASRM — Altman Self-Rating Mania Scale · Altman et al., Biological Psychiatry 1997 · "
            "Sensibilité 85,5 % · Spécificité 87,3 %. "
            "Choisissez l'énoncé qui décrit le mieux comment vous vous êtes senti(e) au cours de la semaine écoulée. "
            "Occasionally = 1 ou 2 fois · Often = plusieurs fois · Frequently = la plupart du temps."
        ),
        "cutoff": 6,
        "max_total": 20,
        "items": [
            {
                "id": "asrm_1",
                "label": "Humeur",
                "max_score": 4,
                "options": [
                    "Je ne me sens pas plus heureux ou gai que d'habitude.",
                    "Je me sens occasionnellement plus heureux ou gai que d'habitude.",
                    "Je me sens souvent plus heureux ou gai que d'habitude.",
                    "Je me sens plus heureux ou gai que d'habitude la plupart du temps.",
                    "Je me sens plus heureux ou gai que d'habitude en permanence.",
                ],
            },
            {
                "id": "asrm_2",
                "label": "Confiance en soi",
                "max_score": 4,
                "options": [
                    "Je ne me sens pas plus confiant en moi que d'habitude.",
                    "Je me sens occasionnellement plus confiant en moi que d'habitude.",
                    "Je me sens souvent plus confiant en moi que d'habitude.",
                    "Je me sens plus confiant en moi que d'habitude.",
                    "Je me sens extrêmement confiant en moi en permanence.",
                ],
            },
            {
                "id": "asrm_3",
                "label": "Sommeil",
                "max_score": 4,
                "options": [
                    "Je n'ai pas besoin de moins dormir que d'habitude.",
                    "J'ai occasionnellement besoin de moins dormir que d'habitude.",
                    "J'ai souvent besoin de moins dormir que d'habitude.",
                    "J'ai fréquemment besoin de moins dormir que d'habitude.",
                    "Je peux passer une journée et une nuit entières sans dormir et ne pas me sentir fatigué(e).",
                ],
            },
            {
                "id": "asrm_4",
                "label": "Débit de parole",
                "max_score": 4,
                "options": [
                    "Je ne parle pas plus que d'habitude.",
                    "Je parle occasionnellement plus que d'habitude.",
                    "Je parle souvent plus que d'habitude.",
                    "Je parle fréquemment plus que d'habitude.",
                    "Je parle constamment et ne peux pas être interrompu(e).",
                ],
            },
            {
                "id": "asrm_5",
                "label": "Niveau d'activité",
                "max_score": 4,
                "options": [
                    "Je n'ai pas été plus actif(ve) (socialement, sexuellement, au travail, à la maison) que d'habitude.",
                    "J'ai occasionnellement été plus actif(ve) que d'habitude.",
                    "J'ai souvent été plus actif(ve) que d'habitude.",
                    "J'ai fréquemment été plus actif(ve) que d'habitude.",
                    "Je suis constamment actif(ve) ou en mouvement.",
                ],
            },
        ],
    },
    "phq9": {
        "instructions": (
            "PHQ-9 — Patient Health Questionnaire · Kroenke, Spitzer & Williams, JGIM 2001 · "
            "Sensibilité 88 % · Spécificité 88 %. "
            "Au cours des 2 dernières semaines, à quelle fréquence avez-vous été gêné(e) par les problèmes suivants ? "
            "0 = Jamais · 1 = Plusieurs jours · 2 = Plus de la moitié des jours · 3 = Presque tous les jours."
        ),
        "cutoff": 10,
        "max_total": 27,
        "items": [
            {
                "id": "phq9_1",
                "label": "Peu d'intérêt ou de plaisir à faire les choses",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_2",
                "label": "Se sentir déprimé(e), triste ou sans espoir",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_3",
                "label": "Difficultés à s'endormir, à rester endormi(e), ou dormir trop",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_4",
                "label": "Se sentir fatigué(e) ou manquer d'énergie",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_5",
                "label": "Manque d'appétit ou manger trop",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_6",
                "label": "Se sentir mal dans sa peau — ou se sentir nul(le), ou avoir l'impression d'avoir déçu sa famille",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_7",
                "label": "Difficultés à se concentrer (lire, regarder la télévision)",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_8",
                "label": "Bouger ou parler si lentement que les autres l'ont remarqué — ou au contraire être si agité(e) que vous vous déplaciez beaucoup plus que d'habitude",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
            {
                "id": "phq9_9",
                "label": "Penser qu'il vaudrait mieux mourir ou envisager de vous blesser d'une façon ou d'une autre",
                "max_score": 3,
                "options": ["Jamais", "Plusieurs jours", "Plus de la moitié des jours", "Presque tous les jours"],
            },
        ],
        "functional_item": {
            "id": "phq9_10",
            "label": (
                "If you checked any problems, how difficult have these made it for you to do your work, "
                "take care of things at home, or get along with other people?"
            ),
            "options": ["Not difficult at all", "Somewhat difficult", "Very difficult", "Extremely difficult"],
        },
    },
}


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"}), 200


@app.post("/score")
def score() -> Any:
    body = request.get_json(force=True, silent=True) or {}
    patient_id = (body.get("patient_id") or "").strip()
    return jsonify(_stub_session_response(onboarding=False, patient_id=patient_id)), 200


@app.post("/onboarding/<patient_id>/session")
def onboarding_session(patient_id: str) -> Any:
    return jsonify(_stub_session_response(onboarding=True, patient_id=patient_id)), 200


@app.get("/questionnaire_catalog")
def questionnaire_catalog() -> Any:
    lang = (request.args.get("lang") or "fr").lower()
    scales_raw = request.args.get("scales") or ""
    wanted = {s.strip().lower() for s in scales_raw.split(",") if s.strip()}
    scales_out: Dict[str, Any] = {}
    for sid, meta in _SCALE_DEFS.items():
        if wanted and sid not in wanted:
            continue
        scales_out[sid] = {
            "items": meta["items"],
            "cutoff": meta.get("cutoff"),
            "max_total": meta.get("max_total"),
            "instructions": meta.get("instructions"),
            "functional_item": meta.get("functional_item"),
        }
    return jsonify({"language": lang, "scales": scales_out}), 200


@app.post("/questionnaires/score")
def questionnaires_score() -> Any:
    body = request.get_json(force=True, silent=True) or {}
    patient_id = (body.get("patient_id") or "").strip()
    answers: Dict[str, Dict[str, int]] = body.get("questionnaire_answers") or {}

    def total(scale: str) -> int:
        d = answers.get(scale) or {}
        items = _SCALE_DEFS.get(scale, {}).get("items") or []
        wanted = {item["id"] for item in items if isinstance(item, dict) and item.get("id")}
        return int(sum(int(v) for k, v in d.items() if v is not None and k in wanted))

    ymrs = total("ymrs")
    madrs = total("madrs")
    asrm = total("asrm")
    phq9 = total("phq9")

    def label(val: int, hi: int, name: str) -> str:
        if val <= hi:
            return f"{name} modere"
        return f"{name} eleve"

    manic_risk = asrm >= 6
    depressive_risk = phq9 >= 10
    if manic_risk and depressive_risk:
        direction = "mixed_risk"
        clinical = "Risque mixte (ASRM et PHQ-9 eleves)"
    elif manic_risk:
        direction = "manic_risk"
        clinical = "Risque maniaque (ASRM eleve)"
    elif depressive_risk:
        direction = "depressive_risk"
        clinical = "Risque depressif (PHQ-9 eleve)"
    else:
        direction = "stable"
        clinical = "Scores stables"

    if patient_id:
        _last_questionnaire[patient_id] = {
            "asrm_total": asrm,
            "phq9_total": phq9,
            "direction": direction,
        }
        pending_session = _pending_q_session.get(patient_id)
        if pending_session is not None:
            _baseline_session_stable[patient_id][pending_session] = not (manic_risk or depressive_risk)
            _pending_q_session.pop(patient_id, None)

    baseline_complete = _is_baseline_complete(patient_id) if patient_id else False
    remaining_sessions = 0 if baseline_complete else max(0, 3 - _session_count.get(patient_id, 0))

    return jsonify(
        {
            "ymrs_total": ymrs,
            "madrs_total": madrs,
            "asrm_total": asrm,
            "phq9_total": phq9,
            "ymrs_label": label(ymrs, 12, "YMRS"),
            "madrs_label": label(madrs, 12, "MADRS"),
            "asrm_label": label(asrm, 6, "ASRM"),
            "phq9_label": label(phq9, 10, "PHQ-9"),
            "direction": direction,
            "clinical_label": clinical,
            "message": "Seuils: ASRM >= 6, PHQ-9 >= 10. Indicateur aide au suivi, pas un diagnostic.",
            "stable_for_baseline": not (manic_risk or depressive_risk),
            "baseline_complete": baseline_complete,
            "remaining_sessions": remaining_sessions,
            "model_fitted": baseline_complete,
        }
    ), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5002"))
    # 0.0.0.0 so browser requests to localhost / 127.0.0.1 both work on Windows
    app.run(host=os.environ.get("HOST", "0.0.0.0"), port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
