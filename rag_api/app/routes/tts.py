from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

router = APIRouter(tags=["tts"])


class TtsBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    lang: Optional[str] = Field(None, max_length=16)
    voice: Optional[str] = Field(None, max_length=128)


@router.post("/tts")
async def synthesize_tts(body: TtsBody) -> Response:
    from graphrag.voice_io import synthesize_speech_mp3

    try:
        mp3 = await synthesize_speech_mp3(body.text.strip(), lang=body.lang, voice=body.voice)
        return Response(content=mp3, media_type="audio/mpeg")
    except ImportError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}") from exc
