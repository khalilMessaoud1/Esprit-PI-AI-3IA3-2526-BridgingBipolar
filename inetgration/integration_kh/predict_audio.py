"""Map fusion phase labels to coarse mood buckets for downstream LLM steering."""

from __future__ import annotations

from typing import Any, Dict


def phase_label_to_mood_bucket(phase: str) -> str:
    p = (phase or "").strip().upper()
    if p in ("DEPRESSIF", "DEPRESSIF_LEGER"):
        return "depressive"
    if p in ("MANIAQUE", "HYPOMANIAQUE", "IRRITABILITE_RESIDUELLE", "MIXTE"):
        return "manic"
    return "neutral"


def fusion_confidence_word_to_float(confidence_word: str, emotion_confidence: float) -> float:
    w = (confidence_word or "").lower()
    if "lev" in w or "élev" in w:
        base = 0.85
    elif "moyen" in w:
        base = 0.55
    elif "faib" in w:
        base = 0.35
    else:
        base = 0.5
    try:
        em = float(emotion_confidence)
    except (TypeError, ValueError):
        em = 0.0
    em = max(0.0, min(1.0, em))
    out = 0.7 * base + 0.3 * em
    return round(max(0.0, min(1.0, out)), 4)


def build_predict_audio_payload(phase_estimation: Dict[str, Any]) -> Dict[str, Any]:
    raw_phase = str(phase_estimation.get("phase") or "")
    bucket = phase_label_to_mood_bucket(raw_phase)
    conf_word = str(phase_estimation.get("confidence") or "")
    emo_conf = phase_estimation.get("emotion_confidence")
    if emo_conf is None:
        emo_conf = 0.0
    score = fusion_confidence_word_to_float(conf_word, float(emo_conf))
    return {"phase": bucket, "confidence": score, "raw_phase": raw_phase}
