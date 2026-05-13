"""One-shot trainer for the keystroke / typing-bipolarity models.

Ports the relevant cells from
``maalej/bipolarity_keyboard_analyzer_IMPROVED.ipynb`` and persists the
fitted estimators + metadata so the FastAPI runtime
(``KeystrokeAnalyzer``) can do inference without retraining.

Run from the ``youssef`` directory:

    python -m graphrag.keystroke_train

Outputs (under ``youssef/artifacts/keystroke/``):
- ``m3_knn.joblib``    : M3 KNN classifier (Normal / Manic / Depressed motor proxy)
- ``m3_ridge.joblib``  : M3 Ridge regressor predicting MSS in [0, 1]
- ``m2_rf.joblib``     : M2 RandomForest classifier driving ICI
- ``meta.json``        : feature column order, label map, ref stats, MSS scaler
"""

from __future__ import annotations

import io
import json
import logging
import sys
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd
import requests

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import (
    GridSearchCV,
    GroupShuffleSplit,
    RandomizedSearchCV,
    StratifiedKFold,
    train_test_split,
)
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, StandardScaler

logger = logging.getLogger("keystroke_train")

RANDOM_STATE = 42
LABEL_MAP = {"normal": 0, "manic": 1, "depressed": 2}
LABEL_NAMES = ["Normal", "Manic", "Depressed"]

H_COLS = [
    "H.period", "H.t", "H.i", "H.e", "H.five",
    "H.Shift.r", "H.o", "H.a", "H.n", "H.l",
]
UD_COLS = [
    "UD.period.t", "UD.t.i", "UD.i.e", "UD.e.five",
    "UD.five.Shift.r", "UD.Shift.r.o", "UD.o.a", "UD.a.n", "UD.n.l",
]
DD_COLS = [
    "DD.period.t", "DD.t.i", "DD.i.e", "DD.e.five",
    "DD.five.Shift.r", "DD.Shift.r.o", "DD.o.a", "DD.a.n", "DD.n.l",
]

M3_FEAT_COLS = [
    "std_flight", "iqr_flight", "skew_flight", "kurt_flight",
    "mean_hold", "std_hold", "p10_hold", "p90_hold",
    "mean_digraph", "std_digraph",
    "rhythm_cv", "burst_count", "slow_count", "hold_flight_ratio",
]

M2_FEAT_COLS = [
    "backspace_rate", "autocorrect_rate", "net_error_rate",
    "correction_delay_s", "inter_key_ms", "burst_ratio", "correction_efficiency",
    "typo_spike_flag", "error_load", "correction_ratio",
    "speed_error_ix", "burst_error_ix",
    "log_correction_delay", "log_inter_key_ms",
    "errors_per_100ks", "speed_deviation",
    "extreme_speed_flag", "high_burst_flag", "error_consistency",
]

ERROR_PROFILES = {
    "normal":    dict(ks=(320, 80),  br=(0.08, 0.03), ar=(0.06, 0.03), cd=(1.5, 0.8), ik=(180, 50), burst=(0.10, 0.05)),
    "manic":     dict(ks=(480, 120), br=(0.15, 0.06), ar=(0.10, 0.04), cd=(0.9, 0.5), ik=(120, 45), burst=(0.20, 0.08)),
    "depressed": dict(ks=(220, 70),  br=(0.12, 0.05), ar=(0.08, 0.03), cd=(2.5, 1.0), ik=(280, 70), burst=(0.08, 0.04)),
}

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts" / "keystroke"
BUFFALO_LOCAL_PATH = ARTIFACTS_DIR / "DSL-StrongPasswordData.csv"
BUFFALO_URL = "https://www.cs.cmu.edu/~keystroke/DSL-StrongPasswordData.csv"


def load_buffalo() -> pd.DataFrame:
    """Buffalo loader with local cache → public CMU URL → synthetic fallback."""
    if BUFFALO_LOCAL_PATH.exists():
        df = pd.read_csv(BUFFALO_LOCAL_PATH)
        logger.info("Loaded Buffalo CSV from local cache: %s (%d x %d)",
                    BUFFALO_LOCAL_PATH, df.shape[0], df.shape[1])
        return df
    try:
        resp = requests.get(BUFFALO_URL, timeout=20)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        BUFFALO_LOCAL_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(BUFFALO_LOCAL_PATH, index=False)
        logger.info("Downloaded Buffalo CSV from %s and cached to %s (%d x %d)",
                    BUFFALO_URL, BUFFALO_LOCAL_PATH, df.shape[0], df.shape[1])
        return df
    except Exception as exc:  # pragma: no cover - network specific
        logger.warning("Could not access public CMU URL (%s); using synthetic fallback.", exc)
        return _synthetic_buffalo_fallback()


def _synthetic_buffalo_fallback(n_subjects: int = 51, n_reps: int = 400) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)
    rows = []
    for subj_idx in range(n_subjects):
        subj_id = f"subj{subj_idx + 1:03d}"
        speed_factor = rng.uniform(0.6, 1.6)
        for rep in range(n_reps):
            row = {"subject": subj_id, "sessionIndex": rep // 8 + 1, "rep": rep % 8 + 1}
            for col in H_COLS:
                row[col] = max(0.01, float(rng.normal(0.12 / speed_factor, 0.03)))
            for col in UD_COLS:
                row[col] = max(0.001, float(rng.normal(0.09 / speed_factor, 0.025)))
            for col in DD_COLS:
                row[col] = max(0.01, float(rng.normal(0.21 / speed_factor, 0.04)))
            rows.append(row)
    df = pd.DataFrame(rows)
    logger.info("Synthetic Buffalo fallback in use: %d x %d", df.shape[0], df.shape[1])
    return df


def extract_timing_features(df: pd.DataFrame) -> pd.DataFrame:
    """Per-subject timing feature vectors (ported from notebook cell 12)."""
    records = []
    for subj, grp in df.groupby("subject"):
        ht_ms = grp[H_COLS].values.flatten() * 1000
        ud_ms = grp[UD_COLS].values.flatten() * 1000
        dd_ms = grp[DD_COLS].values.flatten() * 1000
        ud_ms = ud_ms[ud_ms > 0]
        ht_ms = ht_ms[ht_ms > 0]
        dd_ms = dd_ms[dd_ms > 0]
        records.append({
            "subject":           subj,
            "mean_flight":       float(np.mean(ud_ms)),
            "std_flight":        float(np.std(ud_ms)),
            "median_flight":     float(np.median(ud_ms)),
            "p10_flight":        float(np.percentile(ud_ms, 10)),
            "p90_flight":        float(np.percentile(ud_ms, 90)),
            "iqr_flight":        float(np.percentile(ud_ms, 75) - np.percentile(ud_ms, 25)),
            "skew_flight":       float(pd.Series(ud_ms).skew()),
            "kurt_flight":       float(pd.Series(ud_ms).kurt()),
            "mean_hold":         float(np.mean(ht_ms)),
            "std_hold":          float(np.std(ht_ms)),
            "p10_hold":          float(np.percentile(ht_ms, 10)),
            "p90_hold":          float(np.percentile(ht_ms, 90)),
            "mean_digraph":      float(np.mean(dd_ms)),
            "std_digraph":       float(np.std(dd_ms)),
            "rhythm_cv":         float(np.std(ud_ms) / (np.mean(ud_ms) + 1e-6)),
            "burst_count":       int((ud_ms < 40).sum()),
            "slow_count":        int((ud_ms > 300).sum()),
            "hold_flight_ratio": float(np.mean(ht_ms) / (np.mean(ud_ms) + 1e-6)),
        })
    return pd.DataFrame(records).fillna(0)


def generate_error_sessions(state: str, n_sessions: int = 150,
                             id_offset: int = 0, n_users: int = 24) -> pd.DataFrame:
    """Synthetic per-session keyboard error logs (ported from notebook cell 6)."""
    p = ERROR_PROFILES[state]
    n = n_sessions
    rng = np.random.default_rng(seed=id_offset + RANDOM_STATE)
    user_pool = np.array([f"u{id_offset // 1000:01d}{u:03d}" for u in range(1, n_users + 1)])
    user_id = rng.choice(user_pool, size=n, replace=True)
    user_speed = {u: float(rng.normal(1.0, 0.12)) for u in user_pool}
    user_error = {u: float(rng.normal(1.0, 0.15)) for u in user_pool}
    tod = rng.choice(["morning", "afternoon", "evening", "night"], size=n)
    tod_speed = {"morning": 1.08, "afternoon": 1.00, "evening": 0.95, "night": 0.88}
    tod_error = {"morning": 0.90, "afternoon": 1.00, "evening": 1.05, "night": 1.15}

    ks = np.abs(rng.normal(*p["ks"], size=n)).astype(int).clip(10)
    br = np.clip(rng.normal(*p["br"], size=n), 0, 1)
    ar = np.clip(rng.normal(*p["ar"], size=n), 0, 1)
    cd = np.abs(rng.normal(*p["cd"], size=n))
    ik = np.abs(rng.normal(*p["ik"], size=n))
    bst = np.clip(rng.normal(*p["burst"], size=n), 0, 1)

    for i, (u, t) in enumerate(zip(user_id, tod)):
        ef = user_error[u] * tod_error[t]
        sf = user_speed[u] * tod_speed[t]
        br[i] = np.clip(br[i] * ef + rng.normal(0, 0.015), 0, 1)
        ar[i] = np.clip(ar[i] * ef + rng.normal(0, 0.012), 0, 1)
        cd[i] = np.abs(cd[i] * (2 - sf) + rng.normal(0, 0.25))
        ik[i] = np.abs(ik[i] * (2 - sf) + rng.normal(0, 18.0))
        bst[i] = np.clip(bst[i] * ef + rng.normal(0, 0.020), 0, 1)

    n_back = (ks * br).astype(int)
    n_auto = (ks * ar).astype(int)
    n_corr = (n_back * rng.uniform(0.65, 0.98, size=n)).astype(int)
    net_err = np.clip((n_back - n_corr) / ks, 0, 1)

    return pd.DataFrame({
        "session_id":            np.arange(n) + id_offset,
        "user_id":               user_id,
        "time_of_day":           tod,
        "n_keystrokes":          ks,
        "backspace_rate":        br.round(4),
        "autocorrect_rate":      ar.round(4),
        "n_backspace":           n_back,
        "n_autocorrect":         n_auto,
        "n_corrections":         n_corr,
        "net_error_rate":        net_err.round(4),
        "correction_delay_s":    cd.round(3),
        "inter_key_ms":          ik.round(2),
        "burst_ratio":           bst.round(4),
        "correction_efficiency": (n_corr / n_back.clip(1)).round(3),
        "state":                 state,
        "label":                 LABEL_MAP[state],
    })


def build_error_features(df: pd.DataFrame, ref_stats: Dict[str, float] | None = None) -> pd.DataFrame:
    """Engineer interpretable M2 features (ported from notebook cell 15)."""
    df = df.copy()
    if ref_stats is None:
        global_mean_br = df["backspace_rate"].mean()
        global_std_br = df["backspace_rate"].std()
    else:
        global_mean_br = ref_stats["mean_backspace_rate"]
        global_std_br = ref_stats["std_backspace_rate"]

    df["typo_spike_flag"] = (df["backspace_rate"] > global_mean_br + 1.5 * global_std_br).astype(int)
    df["error_load"] = df["backspace_rate"] + df["autocorrect_rate"]
    df["correction_ratio"] = df["n_corrections"] / df["n_backspace"].clip(1)
    df["speed_error_ix"] = df["inter_key_ms"] * df["backspace_rate"]
    df["burst_error_ix"] = df["burst_ratio"] * df["net_error_rate"]
    df["errors_per_100ks"] = (df["n_backspace"] / df["n_keystrokes"].clip(1)) * 100
    df["log_correction_delay"] = np.log1p(df["correction_delay_s"])
    df["log_inter_key_ms"] = np.log1p(df["inter_key_ms"])
    median_ik_ms = 180
    df["speed_deviation"] = np.abs(df["inter_key_ms"] - median_ik_ms)
    df["extreme_speed_flag"] = ((df["inter_key_ms"] < 80) | (df["inter_key_ms"] > 350)).astype(int)
    df["high_burst_flag"] = (df["burst_ratio"] > 0.15).astype(int)
    df["error_consistency"] = 1.0 / df["backspace_rate"].clip(0.01)
    return df


def train_m3(df_timing: pd.DataFrame) -> tuple[Pipeline, Pipeline, dict]:
    """Train M3 KNN classifier + Ridge MSS regressor."""
    X3_full = df_timing[M3_FEAT_COLS].values
    mean_flight_all = df_timing["mean_flight"].values

    q33_global = float(np.quantile(mean_flight_all, 0.33))
    q67_global = float(np.quantile(mean_flight_all, 0.67))
    y3_global = np.where(mean_flight_all < q33_global, LABEL_MAP["manic"],
                         np.where(mean_flight_all > q67_global, LABEL_MAP["depressed"],
                                  LABEL_MAP["normal"])).astype(int)

    idx = np.arange(len(df_timing))
    idx_tr, idx_te = train_test_split(idx, test_size=0.25, stratify=y3_global, random_state=RANDOM_STATE)

    q33_tr = float(np.quantile(mean_flight_all[idx_tr], 0.33))
    q67_tr = float(np.quantile(mean_flight_all[idx_tr], 0.67))

    def _label_from_flight(mf: np.ndarray) -> np.ndarray:
        out = np.full(mf.shape, LABEL_MAP["normal"], dtype=int)
        out[mf < q33_tr] = LABEL_MAP["manic"]
        out[mf > q67_tr] = LABEL_MAP["depressed"]
        return out

    y3_tr = _label_from_flight(mean_flight_all[idx_tr])
    y3_te = _label_from_flight(mean_flight_all[idx_te])
    X3_tr, X3_te = X3_full[idx_tr], X3_full[idx_te]

    knn_pipe = Pipeline([
        ("sc", StandardScaler()),
        ("knn", KNeighborsClassifier(metric="euclidean")),
    ])
    grid = GridSearchCV(
        knn_pipe,
        {"knn__n_neighbors": [3, 5, 7, 9, 11]},
        cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE),
        scoring="f1_macro",
        n_jobs=-1,
    )
    grid.fit(X3_tr, y3_tr)
    best_knn: Pipeline = grid.best_estimator_
    test_acc = float((best_knn.predict(X3_te) == y3_te).mean())
    logger.info("M3 KNN best k=%s | CV F1-macro=%.3f | test acc=%.3f",
                grid.best_params_["knn__n_neighbors"], grid.best_score_, test_acc)

    mss_raw = 1.0 / (mean_flight_all + 1e-6)
    mss_scaler = MinMaxScaler()
    mss_norm = mss_scaler.fit_transform(mss_raw.reshape(-1, 1)).flatten()
    y_reg_tr, y_reg_te = mss_norm[idx_tr], mss_norm[idx_te]

    ridge_pipe = Pipeline([
        ("sc", StandardScaler()),
        ("ridge", RidgeCV(alphas=[0.01, 0.1, 1, 10, 100], cv=5)),
    ])
    ridge_pipe.fit(X3_tr, y_reg_tr)
    pred = np.clip(ridge_pipe.predict(X3_te), 0, 1)
    mae = float(np.mean(np.abs(pred - y_reg_te)))
    logger.info("M3 Ridge MSS MAE=%.4f", mae)

    mss_meta = {
        "raw_min": float(mss_raw.min()),
        "raw_max": float(mss_raw.max()),
        "scale": float(mss_scaler.scale_[0]),
        "min": float(mss_scaler.min_[0]),
        "q33_train_ms": q33_tr,
        "q67_train_ms": q67_tr,
    }
    return best_knn, ridge_pipe, mss_meta


def train_m2(df_errors: pd.DataFrame) -> tuple[RandomForestClassifier, dict]:
    """Train M2 RandomForest with grouped split (no user leakage)."""
    base_cols = [
        "session_id", "user_id", "state", "label",
        "n_keystrokes", "backspace_rate", "autocorrect_rate",
        "n_backspace", "n_autocorrect", "n_corrections",
        "net_error_rate", "correction_delay_s", "inter_key_ms",
        "burst_ratio", "correction_efficiency",
    ]
    df_base = df_errors[base_cols].copy()
    groups = df_base["user_id"].values
    y_all = df_base["label"].values.astype(int)

    gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=RANDOM_STATE)
    tr_idx, te_idx = next(gss.split(df_base, y_all, groups=groups))
    df_tr_base = df_base.iloc[tr_idx].copy()
    df_te_base = df_base.iloc[te_idx].copy()

    ref_stats = {
        "mean_backspace_rate": float(df_tr_base["backspace_rate"].mean()),
        "std_backspace_rate":  float(df_tr_base["backspace_rate"].std()),
    }
    df_tr = build_error_features(df_tr_base, ref_stats=ref_stats)
    df_te = build_error_features(df_te_base, ref_stats=ref_stats)

    X2_tr = df_tr[M2_FEAT_COLS].values
    X2_te = df_te[M2_FEAT_COLS].values
    y2_tr = df_tr["label"].values.astype(int)
    y2_te = df_te["label"].values.astype(int)

    rf_grid = {
        "n_estimators":     [200, 400],
        "max_depth":        [None, 15, 25],
        "min_samples_leaf": [1, 2, 4],
        "max_features":     ["sqrt", "log2"],
        "class_weight":     ["balanced", "balanced_subsample"],
    }
    search = RandomizedSearchCV(
        RandomForestClassifier(random_state=RANDOM_STATE, n_jobs=-1),
        param_distributions=rf_grid,
        n_iter=15,
        scoring="f1_macro",
        cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE),
        n_jobs=-1,
        random_state=RANDOM_STATE,
        verbose=0,
    )
    search.fit(X2_tr, y2_tr)
    rf: RandomForestClassifier = search.best_estimator_
    test_acc = float((rf.predict(X2_te) == y2_te).mean())
    logger.info("M2 RF best params=%s | CV F1-macro=%.3f | test acc=%.3f",
                search.best_params_, search.best_score_, test_acc)
    return rf, ref_stats


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("=== Training keystroke models ===")
    df_buffalo = load_buffalo()
    df_timing = extract_timing_features(df_buffalo)
    logger.info("Timing matrix: %d subjects x %d features", df_timing.shape[0], len(M3_FEAT_COLS))

    knn, ridge, mss_meta = train_m3(df_timing)

    df_errors = pd.concat([
        generate_error_sessions("normal",    150, id_offset=0,    n_users=24),
        generate_error_sessions("manic",     150, id_offset=1000, n_users=24),
        generate_error_sessions("depressed", 150, id_offset=2000, n_users=24),
    ], ignore_index=True)
    rf, ref_stats = train_m2(df_errors)

    joblib.dump(knn,   ARTIFACTS_DIR / "m3_knn.joblib")
    joblib.dump(ridge, ARTIFACTS_DIR / "m3_ridge.joblib")
    joblib.dump(rf,    ARTIFACTS_DIR / "m2_rf.joblib")

    meta = {
        "label_map":     LABEL_MAP,
        "label_names":   LABEL_NAMES,
        "m3_feat_cols":  M3_FEAT_COLS,
        "m2_feat_cols":  M2_FEAT_COLS,
        "ref_stats":     ref_stats,
        "mss":           mss_meta,
        "median_ik_ms":  180,
        "version":       1,
    }
    (ARTIFACTS_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    logger.info("Saved artifacts to %s", ARTIFACTS_DIR)
    for name in ("m3_knn.joblib", "m3_ridge.joblib", "m2_rf.joblib", "meta.json"):
        path = ARTIFACTS_DIR / name
        logger.info("  %-20s  %d bytes", name, path.stat().st_size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
