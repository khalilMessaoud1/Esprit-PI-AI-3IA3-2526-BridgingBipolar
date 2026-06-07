import asyncio
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.pipeline import process_prescription_bytes, warmup

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002").split(",")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    def _warm() -> None:
        try:
            warmup()
        except Exception as exc:
            print(f"[prescription-service] warmup failed: {exc}")

    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(title="BridgingBipolar Prescription Parser", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ocr-status")
def ocr_status():
    """Returns whether EasyOCR models are loaded and ready."""
    from app.pipeline import _reader

    ready = _reader is not None
    return {"easyocr_loaded": ready, "status": "ready" if ready else "not_loaded"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Envoyez une image (JPEG, PNG, WebP, etc.)")
    image_bytes = await file.read()
    if len(image_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 15 Mo)")
    try:
        loop = asyncio.get_running_loop()
        payload = await loop.run_in_executor(None, process_prescription_bytes, image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return payload
