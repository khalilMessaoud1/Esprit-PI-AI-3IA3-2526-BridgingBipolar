"""Convert arbitrary browser audio bytes to 16 kHz mono WAV for the phase monitor API."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def _ffmpeg_executable() -> str:
    """Prefer system ``ffmpeg``; otherwise use the wheel-bundled binary from ``imageio-ffmpeg``."""
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError(
            "ffmpeg is required for WebM→WAV. Either install ffmpeg on PATH, or run: pip install imageio-ffmpeg"
        ) from exc

# Matches integration_kh/audio_processing.TARGET_SR_EMOTION (16 kHz).
MONITOR_WAV_SAMPLE_RATE = 16000


def bytes_to_wav_tempfile(audio_bytes: bytes, original_filename: str = "recording.webm") -> str:
    """
    Return path to a temporary ``.wav`` file. Caller must delete the path when done.

    Non-WAV inputs are converted with ffmpeg: system PATH first, else the binary from
    the ``imageio-ffmpeg`` package (``pip install imageio-ffmpeg``).
    """
    if len(audio_bytes) == 0:
        raise ValueError("Empty audio")

    suffix = Path(original_filename).suffix.lower() or ".webm"
    if suffix == ".wav":
        fd, out_path = tempfile.mkstemp(suffix=".wav")
        try:
            os.write(fd, audio_bytes)
        finally:
            os.close(fd)
        return out_path

    fd_in, in_path = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd_in, audio_bytes)
    finally:
        os.close(fd_in)

    fd_out, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd_out)
    try:
        ffmpeg_bin = _ffmpeg_executable()
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                in_path,
                "-ac",
                "1",
                "-ar",
                str(MONITOR_WAV_SAMPLE_RATE),
                out_path,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
    except RuntimeError:
        try:
            os.unlink(out_path)
        except OSError:
            pass
        raise
    except subprocess.CalledProcessError as exc:
        try:
            os.unlink(out_path)
        except OSError:
            pass
        err = (exc.stderr or b"").decode("utf-8", errors="replace")[:500]
        logger.warning("ffmpeg failed: %s", err)
        raise RuntimeError("Audio conversion failed; try WAV or install ffmpeg.") from exc
    finally:
        try:
            os.unlink(in_path)
        except OSError:
            pass

    return out_path
