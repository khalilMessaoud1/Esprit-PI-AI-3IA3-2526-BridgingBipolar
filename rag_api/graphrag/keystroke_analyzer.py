"""Runtime keystroke analyzer for the GraphRAG web API.

Loads the joblib artifacts produced by ``keystroke_train`` and exposes an
``analyze()`` method that takes browser-captured keystroke events plus a
small session-stats blob and returns MSS / ICI / CBS + a risk level.

The browser is expected to POST a payload like::

    {
      "keystroke_events": [
        {"k": "h", "t": 12.4,  "u": 110.6},
        {"k": "e", "t": 145.2, "u": 222.0},
        ...
      ],
      "keystroke_session": {
        "n_keystrokes":  142,
        "n_backspace":   8,
        "n_autocorrect": 1,
        "n_corrections": 5,
        "duration_ms":   23814
      }
    }

``t`` is the keydown offset in ms from the textarea's first key; ``u`` is
the matching keyup offset. Missing ``u`` values are tolerated.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def compute_cbs(mss: float, ici: float, alpha: float = 0.5) -> float:
    """Composite Bipolarity Score (ported from notebook cell 34)."""
    mss_dysreg = abs(float(mss) - 0.5) * 2.0
    cbs = alpha * mss_dysreg + (1.0 - alpha) * float(ici)
    return float(np.clip(cbs, 0.0, 1.0))


def interpret_cbs(cbs: float) -> Dict[str, str]:
    """Map CBS to clinical risk level (no emojis; UI maps the icon key to color)."""
    if cbs < 0.25:
        return {"level": "Euthymic",                "icon": "ok"}
    if cbs < 0.50:
        return {"level": "Mild Dysregulation",      "icon": "warning"}
    if cbs < 0.70:
        return {"level": "Moderate - Monitor",      "icon": "elevated"}
    return {"level": "High - Clinical Review",      "icon": "alert"}


def _safe_skew(x: np.ndarray) -> float:
    if x.size < 3:
        return 0.0
    s = pd.Series(x).skew()
    return float(0.0 if (s is None or math.isnan(s)) else s)


def _safe_kurt(x: np.ndarray) -> float:
    if x.size < 4:
        return 0.0
    k = pd.Series(x).kurt()
    return float(0.0 if (k is None or math.isnan(k)) else k)


@dataclass
class KeystrokeAnalyzer:
    """Loads trained models + meta and computes a per-session bipolarity report."""

    knn: Any
    ridge: Any
    rf: Any
    meta: Dict[str, Any]
    label_names: List[str] = field(default_factory=lambda: ["Normal", "Manic", "Depressed"])

    @classmethod
    def from_artifacts(cls, artifacts_dir: Path) -> Optional["KeystrokeAnalyzer"]:
        """Load all artifacts; return None (and log a hint) if anything is missing."""
        artifacts_dir = Path(artifacts_dir)
        meta_path = artifacts_dir / "meta.json"
        files = {
            "m3_knn":   artifacts_dir / "m3_knn.joblib",
            "m3_ridge": artifacts_dir / "m3_ridge.joblib",
            "m2_rf":    artifacts_dir / "m2_rf.joblib",
        }
        missing = [name for name, p in files.items() if not p.is_file()]
        if missing or not meta_path.is_file():
            logger.warning(
                "KeystrokeAnalyzer artifacts missing in %s (missing=%s, meta=%s). "
                "Run `python -m graphrag.keystroke_train` from the youssef/ folder to enable typing analysis.",
                artifacts_dir, missing, meta_path.is_file(),
            )
            return None
        try:
            import joblib
            knn = joblib.load(files["m3_knn"])
            ridge = joblib.load(files["m3_ridge"])
            rf = joblib.load(files["m2_rf"])
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - environment specific
            logger.warning("KeystrokeAnalyzer failed to load artifacts: %s", exc)
            return None
        names = list(meta.get("label_names") or ["Normal", "Manic", "Depressed"])
        logger.info("KeystrokeAnalyzer loaded from %s", artifacts_dir)
        return cls(knn=knn, ridge=ridge, rf=rf, meta=meta, label_names=names)

    def _timing_arrays(self, events: List[Dict[str, Any]]) -> Dict[str, np.ndarray]:
        """Convert raw {k,t,u} events into hold/flight/digraph (ms) arrays.

        - hold     = u - t (only when both present)
        - flight   = t[i+1] - u[i] (gap between key-up and next key-down)
        - digraph  = t[i+1] - t[i] (down-to-down latency)
        Non-positive values are filtered as logging artifacts.
        """
        if not events:
            return {"hold": np.array([]), "flight": np.array([]), "digraph": np.array([])}

        clean = []
        for e in events:
            t = e.get("t")
            if t is None:
                continue
            try:
                t = float(t)
            except (TypeError, ValueError):
                continue
            u_raw = e.get("u")
            try:
                u = float(u_raw) if u_raw is not None else None
            except (TypeError, ValueError):
                u = None
            clean.append({"t": t, "u": u})
        if not clean:
            return {"hold": np.array([]), "flight": np.array([]), "digraph": np.array([])}

        clean.sort(key=lambda e: e["t"])
        ts = np.array([e["t"] for e in clean], dtype=float)
        us = np.array([e["u"] if e["u"] is not None else np.nan for e in clean], dtype=float)

        hold = us - ts
        hold = hold[np.isfinite(hold) & (hold > 0)]

        if ts.size >= 2:
            digraph = np.diff(ts)
            digraph = digraph[digraph > 0]
            valid_pair = np.isfinite(us[:-1]) & np.isfinite(ts[1:])
            flight = ts[1:][valid_pair] - us[:-1][valid_pair]
            flight = flight[flight > 0]
        else:
            digraph = np.array([])
            flight = np.array([])

        return {"hold": hold, "flight": flight, "digraph": digraph}

    def _normalize_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Accept multiple browser payload formats and normalize to {k,t,u}.

        Supported inputs:
        - canonical: {"k": "...", "t": ms, "u": ms?}
        - fallback:  {"key": "...", "ts": ms, "type": "keydown"|"keyup"}
        """
        normalized: List[Dict[str, Any]] = []
        if not events:
            return normalized

        # First pass: keep canonical shape directly when present.
        for e in events:
            if isinstance(e, dict) and ("t" in e or "u" in e):
                normalized.append({"k": e.get("k") or e.get("key") or "", "t": e.get("t"), "u": e.get("u")})

        if normalized:
            return normalized

        # Fallback shape: pair keydown/keyup from {ts,key,type}.
        down_stack: Dict[str, List[Dict[str, Any]]] = {}
        for e in events:
            if not isinstance(e, dict):
                continue
            key = str(e.get("key") or e.get("k") or "")
            ts = e.get("ts", e.get("t"))
            if ts is None:
                continue
            typ = str(e.get("type") or "keydown").lower()
            if typ == "keyup":
                stack = down_stack.get(key) or []
                if stack:
                    last = stack.pop()
                    last["u"] = ts
                continue
            item = {"k": key, "t": ts, "u": None}
            normalized.append(item)
            down_stack.setdefault(key, []).append(item)
        return normalized

    def _build_timing_vector(self, arrays: Dict[str, np.ndarray]) -> np.ndarray:
        """14 M3 features in the order ``meta["m3_feat_cols"]``."""
        flight = arrays["flight"]
        hold = arrays["hold"]
        dg = arrays["digraph"]

        if flight.size == 0:
            flight = np.array([180.0])
        if hold.size == 0:
            hold = np.array([100.0])
        if dg.size == 0:
            dg = np.array([200.0])

        std_flight = float(np.std(flight))
        iqr_flight = float(np.percentile(flight, 75) - np.percentile(flight, 25))
        skew_flight = _safe_skew(flight)
        kurt_flight = _safe_kurt(flight)
        mean_hold = float(np.mean(hold))
        std_hold = float(np.std(hold))
        p10_hold = float(np.percentile(hold, 10))
        p90_hold = float(np.percentile(hold, 90))
        mean_digraph = float(np.mean(dg))
        std_digraph = float(np.std(dg))
        rhythm_cv = float(std_flight / (np.mean(flight) + 1e-6))
        burst_count = int((flight < 40).sum())
        slow_count = int((flight > 300).sum())
        hold_flight_ratio = float(mean_hold / (np.mean(flight) + 1e-6))

        feats = {
            "std_flight": std_flight,
            "iqr_flight": iqr_flight,
            "skew_flight": skew_flight,
            "kurt_flight": kurt_flight,
            "mean_hold": mean_hold,
            "std_hold": std_hold,
            "p10_hold": p10_hold,
            "p90_hold": p90_hold,
            "mean_digraph": mean_digraph,
            "std_digraph": std_digraph,
            "rhythm_cv": rhythm_cv,
            "burst_count": burst_count,
            "slow_count": slow_count,
            "hold_flight_ratio": hold_flight_ratio,
        }
        cols = list(self.meta["m3_feat_cols"])
        return np.array([feats[c] for c in cols], dtype=float).reshape(1, -1)

    def _build_error_vector(
        self,
        arrays: Dict[str, np.ndarray],
        session_stats: Dict[str, Any],
    ) -> np.ndarray:
        """19 M2 features in the order ``meta["m2_feat_cols"]``."""
        flight = arrays["flight"]
        n_keystrokes = max(1, int(session_stats.get("n_keystrokes") or len(arrays["digraph"]) + 1 or 1))
        n_backspace = max(0, int(session_stats.get("n_backspace") or 0))
        n_autocorrect = max(0, int(session_stats.get("n_autocorrect") or 0))
        n_corrections = max(0, int(session_stats.get("n_corrections") or 0))
        correction_delay_s = float(session_stats.get("correction_delay_s") or 0.0)

        backspace_rate = min(1.0, n_backspace / max(1, n_keystrokes))
        autocorrect_rate = min(1.0, n_autocorrect / max(1, n_keystrokes))
        net_error_rate = max(0.0, min(1.0, (n_backspace - n_corrections) / max(1, n_keystrokes)))

        if flight.size:
            inter_key_ms = float(np.mean(flight))
            q25 = float(np.percentile(flight, 25))
            burst_ratio = float((flight < q25).mean()) if flight.size > 1 else 0.0
        else:
            inter_key_ms = 180.0
            burst_ratio = 0.0
        correction_efficiency = float(n_corrections / max(1, n_backspace))

        ref = self.meta.get("ref_stats") or {}
        mean_br_ref = float(ref.get("mean_backspace_rate", backspace_rate))
        std_br_ref = float(ref.get("std_backspace_rate", 0.0)) or 0.0
        typo_spike_flag = int(backspace_rate > mean_br_ref + 1.5 * std_br_ref)

        error_load = backspace_rate + autocorrect_rate
        correction_ratio = float(n_corrections / max(1, n_backspace))
        speed_error_ix = inter_key_ms * backspace_rate
        burst_error_ix = burst_ratio * net_error_rate
        errors_per_100ks = (n_backspace / max(1, n_keystrokes)) * 100.0
        log_correction_delay = float(np.log1p(correction_delay_s))
        log_inter_key_ms = float(np.log1p(inter_key_ms))

        median_ik = float(self.meta.get("median_ik_ms", 180))
        speed_deviation = float(abs(inter_key_ms - median_ik))
        extreme_speed_flag = int((inter_key_ms < 80) or (inter_key_ms > 350))
        high_burst_flag = int(burst_ratio > 0.15)
        error_consistency = float(1.0 / max(0.01, backspace_rate))

        feats = {
            "backspace_rate": backspace_rate,
            "autocorrect_rate": autocorrect_rate,
            "net_error_rate": net_error_rate,
            "correction_delay_s": correction_delay_s,
            "inter_key_ms": inter_key_ms,
            "burst_ratio": burst_ratio,
            "correction_efficiency": correction_efficiency,
            "typo_spike_flag": typo_spike_flag,
            "error_load": error_load,
            "correction_ratio": correction_ratio,
            "speed_error_ix": speed_error_ix,
            "burst_error_ix": burst_error_ix,
            "log_correction_delay": log_correction_delay,
            "log_inter_key_ms": log_inter_key_ms,
            "errors_per_100ks": errors_per_100ks,
            "speed_deviation": speed_deviation,
            "extreme_speed_flag": extreme_speed_flag,
            "high_burst_flag": high_burst_flag,
            "error_consistency": error_consistency,
        }
        cols = list(self.meta["m2_feat_cols"])
        return np.array([feats[c] for c in cols], dtype=float).reshape(1, -1)

    @staticmethod
    def _compute_ici(proba: np.ndarray) -> float:
        if proba.ndim == 1:
            proba = proba.reshape(1, -1)
        if proba.shape[1] < 3:
            return 0.0
        return float(0.5 * proba[0, 1] + 0.5 * proba[0, 2])

    def _final_decision(self, m3_proba: np.ndarray, m2_proba: np.ndarray) -> str:
        """Single mood class from both models (Normal/Manic/Depressed).

        We average class probabilities from M3 (timing) and M2 (error profile),
        then pick argmax for a stable one-line decision.
        """
        if m3_proba.ndim != 1:
            m3_proba = m3_proba.reshape(-1)
        if m2_proba.ndim != 1:
            m2_proba = m2_proba.reshape(-1)
        n = min(len(m3_proba), len(m2_proba), len(self.label_names))
        if n <= 0:
            return "Normal"
        merged = (m3_proba[:n] + m2_proba[:n]) / 2.0
        idx = int(np.argmax(merged))
        return str(self.label_names[idx] if idx < len(self.label_names) else "Normal")

    def analyze(
        self,
        events: List[Dict[str, Any]],
        session_stats: Optional[Dict[str, Any]] = None,
        *,
        alpha: float = 0.5,
    ) -> Dict[str, Any]:
        """Run the full hybrid inference and return a JSON-serializable dict."""
        session_stats = dict(session_stats or {})
        norm_events = self._normalize_events(events or [])
        arrays = self._timing_arrays(norm_events)

        timing_vec = self._build_timing_vector(arrays)
        error_vec = self._build_error_vector(arrays, session_stats)

        mss = float(np.clip(self.ridge.predict(timing_vec)[0], 0.0, 1.0))
        m3_proba = self.knn.predict_proba(timing_vec)[0]
        m3_pred_idx = int(np.argmax(m3_proba))

        m2_proba = self.rf.predict_proba(error_vec)[0]
        m2_pred_idx = int(np.argmax(m2_proba))
        ici = self._compute_ici(m2_proba)
        final_decision = self._final_decision(m3_proba, m2_proba)

        cbs = compute_cbs(mss, ici, alpha=alpha)
        interp = interpret_cbs(cbs)

        n_events = int(len(norm_events))
        n_keystrokes = int(session_stats.get("n_keystrokes") or n_events)

        return {
            "mss": round(mss, 3),
            "ici": round(ici, 3),
            "cbs": round(cbs, 3),
            "alpha": float(alpha),
            "risk_level": interp["level"],
            "risk_icon": interp["icon"],
            "decision": final_decision,
            "m3_pred": self.label_names[m3_pred_idx] if m3_pred_idx < len(self.label_names) else str(m3_pred_idx),
            "m3_proba": [round(float(p), 3) for p in m3_proba.tolist()],
            "m2_pred": self.label_names[m2_pred_idx] if m2_pred_idx < len(self.label_names) else str(m2_pred_idx),
            "m2_proba": [round(float(p), 3) for p in m2_proba.tolist()],
            "n_events": n_events,
            "n_keystrokes": n_keystrokes,
            "engine": "trained",
        }
