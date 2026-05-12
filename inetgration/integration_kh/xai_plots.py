"""Human-readable spectrogram + waveform, Grad-CAM overlay, and coarse mel-band summary (XAI-style, not clinical diagnosis)."""

from __future__ import annotations

import base64
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

import numpy as np

from audio_processing import HOP_LENGTH, N_FFT, compute_mel_pipeline_for_xai


def _fig_to_png_b64(fig) -> str:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=72, bbox_inches="tight", pad_inches=0.08)
    buf.seek(0)
    b64 = base64.standard_b64encode(buf.read()).decode("ascii")
    buf.close()
    return b64


def _mel_band_energy_shares(S_db: np.ndarray) -> Tuple[Dict[str, float], str]:
    """
    S_db shape (n_mels, frames). Split mel rows into low / mid / high thirds by index
    (proxy for coarse frequency bands).
    """
    n_mels = S_db.shape[0]
    if n_mels < 3:
        return {"low": 0.33, "mid": 0.34, "high": 0.33}, "Insufficient mel resolution for band split."
    third = n_mels // 3
    low_e = float(np.mean(np.exp(S_db[:third, :] / 20.0)))  # soft positive energy proxy
    mid_e = float(np.mean(np.exp(S_db[third : 2 * third, :] / 20.0)))
    high_e = float(np.mean(np.exp(S_db[2 * third :, :] / 20.0)))
    s = low_e + mid_e + high_e + 1e-9
    shares = {
        "low_band": round(low_e / s, 4),
        "mid_band": round(mid_e / s, 4),
        "high_band": round(high_e / s, 4),
    }
    dom = max(shares, key=shares.get)  # type: ignore[arg-type]
    caption = (
        "Relative mel-band energy (low / mid / high thirds of the mel axis; educational visualization only): "
        f"low={shares['low_band']:.0%}, mid={shares['mid_band']:.0%}, high={shares['high_band']:.0%}. "
        f"Largest share: {dom.replace('_', ' ')}. This is not a diagnosis."
    )
    return shares, caption


def build_xai_payload(wav_path: str, tachy_model: Optional[Any] = None) -> Dict[str, Any]:
    """
    Return dict with base64 PNGs and frequency_summary + caption.
    When ``tachy_model`` is set, adds Grad-CAM overlay on the mel plot and highlights salient
    time regions on the waveform (tachyphemia CNN saliency; educational only).
    """
    import librosa.display
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import Normalize

    y, sr, S_db, _mel_norm, mel_cnn = compute_mel_pipeline_for_xai(wav_path)
    n_mels, n_frames = S_db.shape

    shares, band_caption = _mel_band_energy_shares(S_db)

    cam_on_mel: Optional[np.ndarray] = None
    spans: list[tuple[float, float]] = []
    if tachy_model is not None:
        try:
            from tachy_gradcam import (
                frame_voice_activity_mask,
                grad_cam_heatmap,
                resize_cam_to_mel_grid,
                salient_time_spans,
                time_importance_curve,
            )

            cam128 = grad_cam_heatmap(tachy_model, np.expand_dims(mel_cnn, axis=0))
            cam_on_mel = resize_cam_to_mel_grid(cam128, n_mels, n_frames)
            # CNN sees 128×128 mel (time and frequency mixed); resizing CAM back can mis-place
            # saliency onto padded/silent tail — zero CAM where mel frame energy is near silence.
            voice_m = frame_voice_activity_mask(S_db)
            cam_on_mel = cam_on_mel * voice_m[np.newaxis, :]
            tc = time_importance_curve(cam_on_mel)
            spans = salient_time_spans(
                tc, float(sr), HOP_LENGTH, N_FFT, valid_mask=voice_m
            )
        except Exception:
            cam_on_mel = None
            spans = []

    # Waveform (compact width) + salient spans from Grad-CAM time projection
    fig1, ax1 = plt.subplots(figsize=(7.0, 1.8), constrained_layout=True)
    times = np.arange(len(y)) / float(sr)
    ax1.plot(times, y, color="#2a6f97", linewidth=0.35)
    for t0, t1 in spans:
        ax1.axvspan(t0, t1, alpha=0.3, color="#c94c4c", linewidth=0)
    ax1.set_xlabel("Time (s)")
    ax1.set_ylabel("Amplitude (norm.)")
    title_wf = "Waveform (first segment)"
    if spans:
        title_wf += " — shaded: CNN salient time (Grad-CAM projection)"
    ax1.set_title(title_wf)
    ax1.set_xlim(0, times[-1] if len(times) else 0)
    wf_b64 = _fig_to_png_b64(fig1)
    plt.close(fig1)

    # Mel spectrogram + optional Grad-CAM superposition
    fig2, ax2 = plt.subplots(figsize=(7.0, 3.2), constrained_layout=True)
    img = librosa.display.specshow(
        S_db,
        x_axis="time",
        y_axis="mel",
        sr=sr,
        hop_length=HOP_LENGTH,
        ax=ax2,
        cmap="magma",
    )
    fig2.colorbar(img, ax=ax2, format="%+2.0f dB", shrink=0.65)
    if cam_on_mel is not None:
        x0, x1 = ax2.get_xlim()
        y0, y1 = ax2.get_ylim()
        pos = cam_on_mel[cam_on_mel > 1e-9]
        vmax = float(np.percentile(pos, 98.0)) if pos.size else 0.0
        vmax = max(vmax, float(np.max(cam_on_mel)) * 0.25, 1e-6)
        ax2.imshow(
            cam_on_mel,
            cmap="jet",
            norm=Normalize(vmin=0.0, vmax=max(vmax, 1e-6)),
            alpha=0.42,
            origin="lower",
            aspect=ax2.get_aspect(),
            extent=(x0, x1, y0, y1),
            interpolation="bilinear",
        )
        ax2.set_title("Mel spectrogram + Grad-CAM overlay (tachyphemia CNN, educational)")
    else:
        ax2.set_title("Mel spectrogram (same STFT settings as monitoring pipeline)")

    spec_b64 = _fig_to_png_b64(fig2)
    plt.close(fig2)

    caption = band_caption
    if cam_on_mel is not None:
        caption += (
            " Grad-CAM highlights regions that most influenced the tachyphemia CNN score; "
            "red shading on the waveform marks salient intervals (masked to frames with real mel "
            "energy so silent padding is not highlighted). Educational visualization only — not a diagnosis."
        )

    return {
        "spectrogram_png_b64": spec_b64,
        "waveform_png_b64": wf_b64,
        "frequency_summary": shares,
        "caption": caption,
    }
