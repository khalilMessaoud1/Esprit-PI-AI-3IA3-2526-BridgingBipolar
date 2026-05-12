"""
Dev ML API for mouse rhythm + sleep/activity pages.

Default port 5000 (override with PORT=5001). Set in web:
  NEXT_PUBLIC_ML_URL=http://localhost:5000

This is a lightweight stub with real descriptive stats for sleep/activity;
replace with your LSTM/Ollama pipeline when ready.
"""

from __future__ import annotations

import math
import os
import statistics
from typing import Any, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="BridgingBipolar ML service", version="0.1.0")

DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ]
)

app.add_middleware(
    CORSMiddleware,
    # Local development: allow all origins so any Next dev port can reach the ML service.
    # This service is only used in local/dev setup.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DayRow(BaseModel):
    day_num: int
    day_of_week: int
    sleep_hours: float
    activity_mims: float
    wake_minutes: float


class SleepAnalyzeIn(BaseModel):
    days: List[DayRow] = Field(min_length=1)


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: List[float]) -> float:
    if len(xs) < 2:
        return 0.0
    return float(statistics.stdev(xs))


def _linear_trend(y: List[float]) -> float:
    """Least-squares slope per step (index 0..n-1)."""
    n = len(y)
    if n < 2:
        return 0.0
    x = list(range(n))
    mx = _mean([float(v) for v in x])
    my = _mean(y)
    num = sum((float(x[i]) - mx) * (y[i] - my) for i in range(n))
    den = sum((float(x[i]) - mx) ** 2 for i in range(n))
    return num / den if den else 0.0


def _corr(a: List[float], b: List[float]) -> float:
    if len(a) != len(b) or len(a) < 2:
        return 0.0
    ma, mb = _mean(a), _mean(b)
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb = math.sqrt(sum((x - mb) ** 2 for x in b))
    if sa < 1e-9 or sb < 1e-9:
        return 0.0
    return sum((a[i] - ma) * (b[i] - mb) for i in range(len(a))) / (sa * sb)


def generate_sleep_activity_report(
    *,
    n_days: int,
    risk: str,
    _anomaly_score: float,
    alert: bool,
    sleep_mean: float,
    sleep_std: float,
    sleep_min: float,
    sleep_max: float,
    wake_mean: float,
    wake_std: float,
    act_mean: float,
    act_std: float,
    act_min: float,
    act_max: float,
    sleep_trend: float,
    act_trend: float,
    social_jet_lag: float,
    relative_amplitude: float,
    corr_sleep_activity: float,
    sleep_iv: float,
) -> str:
    """
    Patient-ready letter: plain paragraphs (split with blank lines for the UI).
    No section headers or spreadsheet jargon—same thresholds as the rest of the tool.
    """
    paras: List[str] = []

    paras.append(
        f"Here is a short summary of the {n_days} day{'s' if n_days != 1 else ''} you shared. "
        f"You averaged about {sleep_mean:.1f} hours of sleep per night. "
        f"Your lightest night was around {sleep_min:.1f} hours and your best night about {sleep_max:.1f} hours. "
        f"From one night to the next, sleep tended to differ by about {sleep_std:.1f} hours from that average. "
        f"The time awake at night you wrote down averaged about {wake_mean:.0f} minutes, "
        f"and those values bounced by roughly {wake_std:.0f} minutes across nights. "
        f"Your daily movement entries averaged about {act_mean:.0f} (same units as in your file), "
        f"from about {act_min:.0f} on the quietest day to about {act_max:.0f} on the busiest."
    )

    if social_jet_lag >= 0.25:
        paras.append(
            f"When we compare weekend and weekday sleep in your file, they differ by about {social_jet_lag:.1f} hours on average. "
            "That often goes hand in hand with feeling “off” after weekends or irregular days off."
        )
    else:
        paras.append(
            f"Weekend and weekday sleep in your file are close (about {social_jet_lag:.1f} hours apart on average), "
            "so there is no big weekend shift showing up in these numbers."
        )

    observations: List[str] = []
    if sleep_std > 1.5:
        observations.append(
            f"Sleep length changed quite a bit between nights (about {sleep_std:.1f} hours of spread)."
        )
    if sleep_iv > 2:
        observations.append(
            "The minutes awake at night swung more than usual from day to day, which can line up with lighter or more broken sleep."
        )
    if relative_amplitude < 0.5:
        observations.append(
            "Your days and nights look a little less distinct in movement than we often see—like a softer day–night rhythm in this window."
        )
    if sleep_trend < -0.3:
        observations.append(
            f"Across the days in order, sleep hours drifted down by about {abs(sleep_trend):.2f} hours per day on average."
        )
    elif sleep_trend > 0.3:
        observations.append(
            f"Across the days in order, sleep hours crept up by about {sleep_trend:.2f} hours per day on average."
        )
    if act_trend > 500:
        observations.append(
            f"Movement scores rose across the week by about {act_trend:.0f} units per day on average."
        )
    elif act_trend < -500:
        observations.append(
            f"Movement scores eased downward across the week by about {abs(act_trend):.0f} units per day on average."
        )
    if corr_sleep_activity < -0.3:
        observations.append(
            "On days when sleep was shorter, movement tended to be a bit higher—like busier days after shorter nights."
        )
    elif corr_sleep_activity > 0.35:
        observations.append(
            "Sleep and movement tended to move together a little more than usual in this stretch—both up or both down."
        )

    if observations:
        paras.append(
            "A few things stood out when we read your week as a whole: " + " ".join(observations)
        )
    else:
        paras.append(
            "Taken together, nothing in this upload jumps out as extreme—the week looks fairly even on these measures."
        )

    risk_voice = {
        "Normal": "For this upload, the overall picture is calm: your sleep and activity look steady for the days we saw.",
        "Watch": "For this upload, the overall picture is “worth a second look”: a few patterns suggest paying gentle attention to how you feel day to day.",
        "At Risk": "For this upload, the overall picture suggests talking with a clinician soon: several sleep and activity signals line up in a way that deserves a conversation.",
        "Alert": "For this upload, the overall picture is strong enough that we encourage you to reach out to a clinician or crisis resource, especially if you already feel unwell. This is not a diagnosis by itself.",
    }.get(risk, "If you are unsure how to read these results, ask a clinician you trust.")

    paras.append(
        f'We group this week as "{risk}" when sleep and movement are read together. {risk_voice}'
    )

    if alert:
        paras.append(
            "Because several signals lined up at once, this week is also flagged for extra attention. "
            "That is a prompt to check in with someone on your care team if you have been feeling off—it is still not a medical label on its own."
        )

    paras.append(
        "*This text is for learning and self-reflection only. It does not replace medical advice. "
        "If you feel unsafe or very unwell, contact emergency services or your regular clinician.*"
    )

    return "\n\n".join(paras)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze_mouse(body: dict[str, Any]) -> dict[str, Any]:
    """Dashboard mouse tracker — reflects actual movement speed in real time."""
    events = body.get("events") or []
    n = len(events)
    if n < 5:
        return {
            "state": "pending",
            "score": 0.0,
            "level": "Low",
            "window_count": n,
            "anomaly_pct": 0.0,
        }

    # Analyse the most RECENT events so the score reflects current behaviour,
    # not a stale window that accumulated over the last 10 minutes.
    recent = events[max(0, n - 900):]

    speeds: List[float] = []
    for i in range(1, len(recent)):
        a, b = recent[i - 1], recent[i]
        try:
            dx = float(b.get("x", 0)) - float(a.get("x", 0))
            dy = float(b.get("y", 0)) - float(a.get("y", 0))
            dt = (float(b.get("timestamp", 0)) - float(a.get("timestamp", 0))) / 1000.0
            # Accept gaps between 1 ms and 2 s; skip same-tick duplicates and
            # huge gaps caused by idle periods.
            if 0.001 <= dt <= 2.0:
                speeds.append(math.sqrt(dx * dx + dy * dy) / dt)
        except (TypeError, ValueError):
            continue

    if not speeds:
        return {
            "state": "pending",
            "score": 0.0,
            "level": "Low",
            "window_count": n,
            "anomaly_pct": 0.0,
        }

    speeds.sort()

    # Use the MEDIAN (p50) — far more stable than p75/p90.
    # p75 over-weights natural bursts of fast movement (scrolling, clicking)
    # that are perfectly normal, causing false "elevated" readings during
    # regular computer use.
    median_speed = speeds[len(speeds) // 2]

    # Log-ratio normalisation calibrated for real desktop mouse use:
    #   REF_LOW  =    5 px/s  → essentially idle / tremor noise
    #   REF_HIGH = 1500 px/s  → sustained very fast movement (manic territory)
    #
    # Expected score ranges by typical median speed:
    #   idle / depressed  :   5–20 px/s  → 0.00–0.18
    #   light/deliberate  :  20–80 px/s  → 0.18–0.39
    #   normal browsing   :  80–250 px/s → 0.39–0.58  ← "normal" band
    #   active / fast     : 250–500 px/s → 0.58–0.75
    #   manic pattern     : 500+ px/s    → 0.75–1.00
    REF_LOW = 5.0
    REF_HIGH = 1500.0
    v = max(REF_LOW, median_speed)
    speed_score = min(1.0, math.log(v / REF_LOW) / math.log(REF_HIGH / REF_LOW))

    # Tiny rate component (5 % weight) — distinguishes "moving fast"
    # from "moving fast AND constantly" without dominating the score.
    r_start = float(recent[0].get("timestamp", 0))
    r_end = float(recent[-1].get("timestamp", r_start))
    r_dur = max(1.0, (r_end - r_start) / 1000.0)
    event_rate = min(8.0, len(recent) / r_dur)
    rate_score = min(1.0, math.log1p(event_rate) / math.log1p(8.0))

    score = float(min(1.0, max(0.0, 0.95 * speed_score + 0.05 * rate_score)))

    if score > 0.80:
        state = "manic"
    elif score < 0.28:
        state = "depressed"
    else:
        state = "normal"

    if score > 0.80:
        level = "High"
    elif score > 0.62:
        level = "Moderate"
    elif score > 0.42:
        level = "Mild"
    else:
        level = "Low"

    return {
        "state": state,
        "score": round(score, 4),
        "level": level,
        "window_count": n,
        "anomaly_pct": round(min(100.0, score * 100), 1),
    }


@app.post("/sleep-activity/analyze")
def sleep_activity_analyze(inp: SleepAnalyzeIn) -> dict[str, Any]:
    days = inp.days
    sh = [d.sleep_hours for d in days]
    am = [d.activity_mims for d in days]
    wm = [d.wake_minutes for d in days]
    dow = [d.day_of_week for d in days]

    sleep_mean = _mean(sh)
    sleep_std = _std(sh)
    sleep_min = min(sh)
    sleep_max = max(sh)
    sleep_range = sleep_max - sleep_min
    sleep_IV = _std(wm) / 100.0 if wm else 0.0

    weekend = [sh[i] for i in range(len(days)) if dow[i] in (6, 7)]
    weekday = [sh[i] for i in range(len(days)) if dow[i] not in (6, 7)]
    social_jet_lag = abs(_mean(weekend) - _mean(weekday)) if weekend and weekday else 0.0

    sleep_trend = _linear_trend(sh)
    act_mean = _mean(am)
    act_std = _std(am)
    act_min = min(am)
    act_max = max(am)
    act_range = act_max - act_min
    ra_num = act_max - act_min
    ra_den = act_max + act_min
    relative_amplitude = ra_num / ra_den if ra_den > 1e-6 else 0.0
    act_trend = _linear_trend(am)
    corr_sleep_activity = _corr(sh, am)

    features = {
        "sleep_mean": sleep_mean,
        "sleep_std": sleep_std,
        "sleep_min": sleep_min,
        "sleep_max": sleep_max,
        "sleep_range": sleep_range,
        "sleep_IV": sleep_IV,
        "social_jet_lag": social_jet_lag,
        "sleep_trend": sleep_trend,
        "act_mean": act_mean,
        "act_std": act_std,
        "act_min": act_min,
        "act_max": act_max,
        "act_range": act_range,
        "relative_amplitude": relative_amplitude,
        "act_trend": act_trend,
        "corr_sleep_activity": corr_sleep_activity,
    }

    # Heuristic anomaly (dev stub — not clinical LSTM)
    z_sleep = sleep_std / 1.2
    z_act = act_std / 2500.0
    anomaly_score = min(2.5, 0.15 * z_sleep + 0.12 * z_act + 0.2 * abs(sleep_trend) * 10)
    global_threshold = 0.12
    reconstruction_error = anomaly_score * 0.04 + 0.01
    alert = anomaly_score > 1.0

    if anomaly_score < 0.35:
        risk = "Normal"
    elif anomaly_score < 0.65:
        risk = "Watch"
    elif anomaly_score < 1.0:
        risk = "At Risk"
    else:
        risk = "Alert"

    wake_mean = _mean(wm) if wm else 0.0
    wake_std = _std(wm) if wm else 0.0

    llm_report = generate_sleep_activity_report(
        n_days=len(days),
        risk=risk,
        _anomaly_score=anomaly_score,
        alert=alert,
        sleep_mean=sleep_mean,
        sleep_std=sleep_std,
        sleep_min=sleep_min,
        sleep_max=sleep_max,
        wake_mean=wake_mean,
        wake_std=wake_std,
        act_mean=act_mean,
        act_std=act_std,
        act_min=act_min,
        act_max=act_max,
        sleep_trend=sleep_trend,
        act_trend=act_trend,
        social_jet_lag=social_jet_lag,
        relative_amplitude=relative_amplitude,
        corr_sleep_activity=corr_sleep_activity,
        sleep_iv=sleep_IV,
    )

    return {
        "reconstruction_error": reconstruction_error,
        "global_threshold": global_threshold,
        "anomaly_score": anomaly_score,
        "alert": alert,
        "risk_level": risk,
        "features": features,
        "llm_report": llm_report,
    }
