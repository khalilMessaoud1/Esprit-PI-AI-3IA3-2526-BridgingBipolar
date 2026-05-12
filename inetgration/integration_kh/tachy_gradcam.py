"""Grad-CAM for the tachyphemia CNN (mel input 128×128×1)."""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


def _last_conv2d_layer_name(model) -> str:
    from tensorflow.keras import layers

    name: Optional[str] = None
    for layer in model.layers:
        if isinstance(layer, layers.Conv2D):
            name = layer.name
    if not name:
        raise ValueError("No Conv2D layer found for Grad-CAM")
    return name


def grad_cam_heatmap(model, mel_batch: np.ndarray) -> np.ndarray:
    """
    mel_batch: shape (1, 128, 128, 1), float32, same preprocessing as inference.

    Returns 2D heatmap (H, W) in conv spatial resolution, upsampled to (128, 128), values in [0, 1].
    """
    import tensorflow as tf
    from tensorflow import keras

    if mel_batch.ndim != 4 or mel_batch.shape[-1] != 1:
        raise ValueError("mel_batch must be (1, 128, 128, 1)")

    conv_name = _last_conv2d_layer_name(model)
    conv_layer = model.get_layer(conv_name)

    grad_model = keras.Model(
        inputs=model.inputs,
        outputs=[conv_layer.output, model.output],
    )

    x = tf.cast(mel_batch, tf.float32)

    with tf.GradientTape() as tape:
        conv_out, preds = grad_model(x, training=False)
        # Scalar signal: predicted "tachyphemia" logit mass (sigmoid output)
        loss = preds[:, 0]

    grads = tape.gradient(loss, conv_out)
    if grads is None:
        return np.zeros((128, 128), dtype=np.float32)

    pooled = tf.reduce_mean(grads, axis=(1, 2))  # (batch, C)
    conv0 = conv_out[0]
    p0 = pooled[0]
    heat = tf.zeros(conv0.shape[:2], dtype=tf.float32)
    for i in range(int(conv0.shape[2])):
        heat = heat + p0[i] * conv0[:, :, i]

    heat = tf.nn.relu(heat)
    heat_np = heat.numpy()
    mx = float(np.max(heat_np)) + 1e-8
    heat_np = heat_np / mx

    h, w = heat_np.shape
    if (h, w) != (128, 128):
        heat_np = cv2.resize(heat_np, (128, 128), interpolation=cv2.INTER_LINEAR)

    return heat_np.astype(np.float32)


def frame_voice_activity_mask(S_db: np.ndarray, *, rel_peak: float = 0.012) -> np.ndarray:
    """
    Per-STFT-frame voice activity from mel power (same grid as ``S_db``).

    Frames below ``rel_peak * max(frame_energy)`` are treated as silence / padding so
    Grad-CAM saliency is not shown or time-highlighted there (the 128×128 CNN input mixes
    time and frequency, so naive CAM resize can otherwise leak into empty tail regions).
    """
    # Power ≈ 10^(dB/10); mean over mel bins -> frame energy
    p = np.power(10.0, S_db.astype(np.float64) / 10.0)
    ef = np.mean(p, axis=0)
    thr = float(rel_peak) * (float(np.max(ef)) + 1e-15)
    return (ef >= thr).astype(np.float32)


def resize_cam_to_mel_grid(cam128: np.ndarray, n_mels: int, n_frames: int) -> np.ndarray:
    """Resize (128,128) CAM to (n_mels, n_frames) to align with librosa mel grid."""
    if n_frames < 1 or n_mels < 1:
        return np.zeros((max(1, n_mels), max(1, n_frames)), dtype=np.float32)
    # cv2 dsize = (width, height) = (n_frames, n_mels) -> array shape (n_mels, n_frames)
    return cv2.resize(cam128, (n_frames, n_mels), interpolation=cv2.INTER_LINEAR).astype(np.float32)


def time_importance_curve(cam_on_mel: np.ndarray) -> np.ndarray:
    """Average saliency over mel bins -> shape (n_frames,)."""
    return np.mean(cam_on_mel, axis=0).astype(np.float32)


def salient_time_spans(
    time_curve: np.ndarray,
    sr: float,
    hop_length: int,
    n_fft: int,
    *,
    percentile: float = 72.0,
    min_span_frames: int = 2,
    valid_mask: Optional[np.ndarray] = None,
) -> list[tuple[float, float]]:
    """
    Merge consecutive frames above ``percentile`` threshold into [t0, t1] spans in seconds.

    If ``valid_mask`` is given (shape ``(n_frames,)``, >0 = voice-active), thresholds are
    computed only on active frames and inactive frames never start a span.
    """
    if time_curve.size == 0:
        return []
    tc = time_curve.astype(np.float64, copy=False)
    if valid_mask is not None and valid_mask.size == tc.size:
        vm = (valid_mask > 0.5).astype(bool)
        active_vals = tc[vm]
        if active_vals.size == 0:
            return []
        thr = float(np.percentile(active_vals, percentile))
        tc = np.where(vm, tc, 0.0)
    else:
        thr = float(np.percentile(tc, percentile))
    if thr <= 0:
        thr = float(np.max(tc)) * 0.35 + 1e-9
    mask = tc >= thr
    import librosa  # local import keeps module light for non-XAI paths

    centers = librosa.frames_to_time(
        np.arange(len(tc)),
        sr=sr,
        hop_length=hop_length,
        n_fft=n_fft,
    )
    half = (hop_length / float(sr)) * 0.55

    spans: list[tuple[float, float]] = []
    i = 0
    n = len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i >= min_span_frames:
            t0 = float(centers[i]) - half
            t1 = float(centers[j - 1]) + half
            spans.append((max(0.0, t0), t1))
        i = j

    if valid_mask is not None and valid_mask.size == len(mask):
        idx = np.where((valid_mask > 0.5).astype(bool))[0]
        if idx.size:
            t_cap = float(centers[idx[-1]] + half)
            spans = [(t0, min(t1, t_cap)) for (t0, t1) in spans if t0 < t_cap - 1e-6]

    return spans
