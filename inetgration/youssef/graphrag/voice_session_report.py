"""Aggregate voice-phase labels across a session (dominant = plurality + confidence tie-break)."""

from __future__ import annotations

from typing import Any, Dict, List


def _valid_mapped(phase: str) -> bool:
    p = (phase or "").strip().lower()
    return p in ("depressive", "neutral", "manic")


def summarize_voice_phases(turns: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    ``turns`` items should include ``phase``, ``confidence`` (float), ``monitor_reached`` (bool).

    Returns counts, dominant_phase (or null if no votes), tie_break detail.
    """
    counts: Dict[str, int] = {"depressive": 0, "neutral": 0, "manic": 0, "unknown": 0}
    conf_sum: Dict[str, float] = {"depressive": 0.0, "neutral": 0.0, "manic": 0.0}

    for t in turns:
        ok = bool(t.get("monitor_reached"))
        phase = str(t.get("phase") or "").strip().lower()
        if not ok or not _valid_mapped(phase):
            counts["unknown"] = counts.get("unknown", 0) + 1
            continue
        counts[phase] = counts.get(phase, 0) + 1
        try:
            c = float(t.get("confidence") or 0.0)
        except (TypeError, ValueError):
            c = 0.0
        conf_sum[phase] = conf_sum.get(phase, 0.0) + max(0.0, min(1.0, c))

    voted = {k: counts[k] for k in ("depressive", "neutral", "manic")}
    max_votes = max(voted.values()) if voted else 0
    if max_votes == 0:
        return {
            "dominant_phase": None,
            "counts": counts,
            "confidence_sums": conf_sum,
            "n_voted": 0,
        }

    leaders = [p for p, v in voted.items() if v == max_votes]
    if len(leaders) == 1:
        dominant = leaders[0]
    else:
        # Tie-break: higher sum of confidences among tied phases
        best_p, best_s = leaders[0], conf_sum.get(leaders[0], 0.0)
        for p in leaders[1:]:
            s = conf_sum.get(p, 0.0)
            if s > best_s:
                best_p, best_s = p, s
            elif s == best_s:
                # Prefer neutral, then alphabetical
                order = {"neutral": 0, "depressive": 1, "manic": 2}
                if order.get(p, 99) < order.get(best_p, 99):
                    best_p = p
        dominant = best_p

    return {
        "dominant_phase": dominant,
        "counts": counts,
        "confidence_sums": conf_sum,
        "n_voted": sum(voted.values()),
    }
