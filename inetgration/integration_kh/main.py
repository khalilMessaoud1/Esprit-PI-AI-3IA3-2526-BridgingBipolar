import os
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from tachyphymia_model import load_tachyphymia_model, predict_tachyphemia
from emotion_model import load_emotion_model, predict_emotion
from fusion_rules import determine_bipolar_phase
from predict_audio import build_predict_audio_payload
from xai_plots import build_xai_payload


class PredictAudioResponse(BaseModel):
    """LLM-oriented mood signal plus fusion label for dashboards / Swagger."""

    phase: str = Field(
        ...,
        description="Mapped bucket for prompting: depressive, neutral, or manic",
    )
    confidence: float = Field(..., ge=0.0, le=1.0, description="Numeric confidence 0–1")
    raw_phase: str = Field(
        ...,
        description="Fusion phase from rules (e.g. MANIAQUE, DEPRESSIF, NEUTRE, HYPOMANIAQUE)",
    )


class ExplainWavResponse(BaseModel):
    """Spectrogram + waveform PNG (base64) and coarse mel-band energy summary for transparency."""

    spectrogram_png_b64: str = Field(..., description="PNG image base64 (no data: prefix)")
    waveform_png_b64: str = Field(..., description="PNG image base64 (no data: prefix)")
    frequency_summary: dict = Field(
        ...,
        description="Relative energy shares in low/mid/high mel-band thirds (approximate)",
    )
    caption: str = Field(..., description="Short neutral explanation; not a diagnosis")


app = FastAPI(title="Bipolar Phase Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace with frontend URL later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


tachy_model = load_tachyphymia_model("models/tachyphemia_cnn_final.keras")
emotion_processor, emotion_model, emotion_device = load_emotion_model("models/wav2vec2-emotion_final")


def _analyze_wav_path(file_path: Path) -> dict:
    """Run tachyphemia + emotion + fusion on a WAV file already on disk."""
    tachy_result = predict_tachyphemia(str(file_path), tachy_model)
    emotion_result = predict_emotion(
        str(file_path),
        emotion_processor,
        emotion_model,
        emotion_device,
    )
    phase_result = determine_bipolar_phase(tachy=tachy_result, emo=emotion_result)
    return {
        "tachyphemia": tachy_result,
        "emotion": emotion_result,
        "phase_estimation": phase_result,
    }


@app.get("/")
def home():
    return {
        "message": "Bipolar Phase Monitor API is running",
        "input": "WAV audio file",
        "modules": [
            "CNN tachyphemia detection",
            "Wav2Vec2 emotion recognition",
            "clinical fusion rules"
        ],
        "warning": "Monitoring tool only. Not a medical diagnosis."
    }


@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Only .wav audio files are supported."
        )

    safe_filename = Path(file.filename).name
    file_path = UPLOAD_DIR / safe_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        analyzed = _analyze_wav_path(file_path)
        return {
            "filename": safe_filename,
            **analyzed,
            "ethical_warning": "This result is for monitoring only and is not a medical diagnosis.",
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )

    finally:
        if file_path.exists():
            file_path.unlink()


@app.post("/predict_audio", response_model=PredictAudioResponse)
async def predict_audio(file: UploadFile = File(...)) -> PredictAudioResponse:
    """Mood signal: mapped phase + confidence + fusion ``raw_phase`` (e.g. MANIAQUE, DEPRESSIF, NEUTRE)."""
    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Only .wav audio files are supported.",
        )

    safe_filename = Path(file.filename).name
    file_path = UPLOAD_DIR / safe_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        analyzed = _analyze_wav_path(file_path)
        payload = build_predict_audio_payload(analyzed["phase_estimation"])
        return PredictAudioResponse(
            phase=str(payload["phase"]),
            confidence=float(payload["confidence"]),
            raw_phase=str(payload.get("raw_phase") or ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e
    finally:
        if file_path.exists():
            file_path.unlink()


@app.post("/explain_wav", response_model=ExplainWavResponse)
async def explain_wav(file: UploadFile = File(...)) -> ExplainWavResponse:
    """XAI-style plots: waveform + mel spectrogram + coarse band energy summary (WAV only)."""
    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=400,
            detail="Only .wav audio files are supported.",
        )

    safe_filename = Path(file.filename).name
    file_path = UPLOAD_DIR / safe_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        payload = build_xai_payload(str(file_path), tachy_model=tachy_model)
        return ExplainWavResponse(
            spectrogram_png_b64=str(payload["spectrogram_png_b64"]),
            waveform_png_b64=str(payload["waveform_png_b64"]),
            frequency_summary=dict(payload["frequency_summary"]),
            caption=str(payload["caption"]),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explain failed: {str(e)}") from e
    finally:
        if file_path.exists():
            file_path.unlink()