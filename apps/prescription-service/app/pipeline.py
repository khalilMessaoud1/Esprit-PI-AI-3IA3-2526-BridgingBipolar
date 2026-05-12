"""
Prescription pipeline aligned with backup.ipynb:
EasyOCR → text cleaning → fuzzy drug-name correction (RxNorm + BDPM fallbacks)
→ structured JSON via Ollama (optional) → heuristic fallback.
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import tempfile
import traceback
from typing import Any

import cv2
import numpy as np
import requests
from PIL import Image
from rapidfuzz import fuzz, process as fuzz_process

# --- Lazy singletons ---
_reader = None
_drug_database: list[str] | None = None

MATCH_THRESHOLD = 82

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
# Default matches common installs; override with OLLAMA_MODEL (e.g. llama3:8b).
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:latest")


def _ensure_utf8_console() -> None:
    """Prevent EasyOCR download progress from crashing on cp1252 terminals."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="ignore")
            except Exception:
                pass


def get_reader():
    global _reader
    if _reader is None:
        _ensure_utf8_console()
        import easyocr
        # Use a stable local directory for EasyOCR models on Windows.
        # This avoids occasional [Errno 22] path issues with default locations.
        model_dir = os.environ.get(
            "EASYOCR_MODEL_DIR",
            os.path.join(tempfile.gettempdir(), "bb_easyocr_models"),
        )
        os.makedirs(model_dir, exist_ok=True)
        # Try bilingual first; fall back to English-only (smaller model, easier to download).
        try:
            _reader = easyocr.Reader(
                ["fr", "en"],
                gpu=False,
                model_storage_directory=model_dir,
                verbose=False,
            )
        except Exception:
            try:
                _reader = easyocr.Reader(
                    ["en"],
                    gpu=False,
                    model_storage_directory=model_dir,
                    verbose=False,
                )
            except Exception as exc:
                raise RuntimeError(
                    f"EasyOCR impossible à initialiser : {exc}. "
                    "Vérifiez que le package est installé ('pip install easyocr') "
                    "et que la première exécution peut télécharger les modèles (~150 Mo)."
                ) from exc
    return _reader


def load_rxnorm_names(max_names: int = 6000) -> list[str]:
    names: set[str] = set()
    try:
        url = "https://rxnav.nlm.nih.gov/REST/allconcepts.json?tty=IN+PIN+BN+SCDC+SBD"
        resp = requests.get(url, timeout=45)
        resp.raise_for_status()
        data = resp.json()
        concepts = data.get("minConceptGroup", {}).get("minConcept", [])
        for c in concepts[:max_names]:
            name = (c.get("name") or "").strip()
            if name and len(name) >= 3:
                names.add(name)
                first_word = name.split()[0]
                if len(first_word) >= 4:
                    names.add(first_word)
    except requests.RequestException:
        names = {
            "Amoxicillin",
            "Paracetamol",
            "Ibuprofen",
            "Omeprazole",
            "Metformin",
            "Lithium",
            "Quetiapine",
            "Lamotrigine",
            "Valproate",
            "Olanzapine",
            "Sertraline",
            "Lorazepam",
        }
    return list(names)


def load_bdpm_names() -> list[str]:
    names: set[str] = set()
    bdpm_url = "https://base-donnees-publique.medicaments.gouv.fr/telechargement.php?fichier=CIS_bdpm.txt"
    try:
        resp = requests.get(bdpm_url, timeout=45)
        resp.raise_for_status()
        content = resp.content.decode("latin-1")
        for line in content.strip().split("\n"):
            cols = line.split("\t")
            if len(cols) >= 2:
                full_name = cols[1].strip()
                if full_name:
                    names.add(full_name)
                    dci = re.split(r"[\s,]", full_name)[0]
                    if len(dci) >= 4:
                        names.add(dci.title())
                        names.add(dci.upper())
    except requests.RequestException:
        names = {
            "Amoxicilline",
            "Paracétamol",
            "Ibuprofène",
            "Oméprazole",
            "Metformine",
            "Lithium",
            "Quétiapine",
            "Lamotrigine",
            "Valproate",
            "Doliprane",
        }
    return list(names)


def get_drug_database() -> list[str]:
    global _drug_database
    if _drug_database is None:
        rx = load_rxnorm_names()
        bd = load_bdpm_names()
        merged = list(set(rx + bd))
        _drug_database = [d for d in merged if 4 <= len(d) <= 80]
    return _drug_database


def clean_ocr_text(text: str) -> str:
    text = re.sub(r"[^\x00-\x7F\u00C0-\u024F]+", " ", text)
    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        if len(line) < 3:
            continue
        if re.fullmatch(r"[\d\s.\-/]+", line):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def extract_word_candidates(text: str) -> list[str]:
    candidates = re.findall(r"\b[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]{4,}\b", text)
    return list(set(candidates))


def fuzzy_correct(text: str, database: list[str], threshold: int = MATCH_THRESHOLD) -> tuple[str, list[tuple[str, str, float]]]:
    candidates = extract_word_candidates(text)
    corrected = text
    corrections: list[tuple[str, str, float]] = []
    for word in candidates:
        result = fuzz_process.extractOne(word, database, scorer=fuzz.WRatio, score_cutoff=threshold)
        if result:
            best_match, score, _ = result
            if word.lower() != best_match.lower():
                corrections.append((word, best_match, round(float(score), 1)))
                corrected = re.sub(
                    r"(?<![A-Za-zÀ-ÿ])" + re.escape(word) + r"(?![A-Za-zÀ-ÿ0-9])",
                    best_match,
                    corrected,
                )
    return corrected, corrections


def image_bytes_to_bgr(image_bytes: bytes) -> np.ndarray:
    img = None
    try:
        arr = np.asarray(bytearray(image_bytes), dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except cv2.error:
        img = None
    if img is None or img.size == 0:
        try:
            pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise ValueError("Image invalide ou illisible") from exc
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img


def _resize_if_needed(img: np.ndarray, max_side: int = 2200) -> np.ndarray:
    h, w = img.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return img
    scale = max_side / float(m)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def prepare_ocr_images(image_bytes: bytes) -> list[np.ndarray]:
    try:
        base = _resize_if_needed(image_bytes_to_bgr(image_bytes))
    except Exception as exc:
        raise ValueError("Impossible de lire l'image") from exc
    variants: list[np.ndarray] = [base]

    gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 9, 75, 75)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    norm = clahe.apply(blur)
    variants.append(norm)

    thr = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 10)
    variants.append(thr)

    # Light sharpening for faint scans
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharp = cv2.filter2D(base, -1, kernel)
    variants.append(sharp)

    # Slight upscale for small text
    up = cv2.resize(base, None, fx=1.4, fy=1.4, interpolation=cv2.INTER_CUBIC)
    variants.append(up)

    return variants


def _score_ocr_output(raw: list[list[Any]]) -> float:
    if not raw:
        return 0.0
    total_conf = 0.0
    char_count = 0
    for detection in raw:
        try:
            text = str(detection[1])
            conf = float(detection[2])
        except (IndexError, ValueError, TypeError):
            continue
        total_conf += conf
        char_count += len(text)
    return total_conf + (char_count * 0.015)


def _ocr_variant(reader: Any, img: np.ndarray) -> list[list[Any]]:
    """Run EasyOCR on one image variant with Windows-safe fallbacks.

    Some setups fail on file paths, others fail on numpy arrays; try both.
    """
    tmp_path: str | None = None
    last_exc: Exception | None = None
    try:
        # Try file-path mode first in a dedicated local temp directory.
        temp_dir = os.environ.get(
            "PRESCRIPTION_OCR_TEMP_DIR",
            os.path.join(tempfile.gettempdir(), "bb_ocr_tmp"),
        )
        os.makedirs(temp_dir, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(suffix=".png", dir=temp_dir)
        os.close(fd)
        if not cv2.imwrite(tmp_path, img):
            raise ValueError("Impossible d'écrire l'image temporaire OCR")
        return reader.readtext(tmp_path, detail=1, paragraph=False)
    except Exception as exc:
        last_exc = exc
        # Fallback: direct numpy array.
        try:
            return reader.readtext(img, detail=1, paragraph=False)
        except Exception as exc2:
            raise ValueError(f"{last_exc}; fallback-array: {exc2}") from exc2
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def run_ocr(image_bytes: bytes) -> tuple[list[dict[str, Any]], str]:
    reader = get_reader()
    variants = prepare_ocr_images(image_bytes)
    best_raw: list[list[Any]] = []
    best_score = 0.0
    last_exc: Exception | None = None
    error_samples: list[str] = []

    for img in variants:
        try:
            raw = _ocr_variant(reader, img)
        except Exception as exc:
            last_exc = exc
            if len(error_samples) < 3:
                error_samples.append(repr(exc))
            continue
        score = _score_ocr_output(raw)
        if score > best_score:
            best_score = score
            best_raw = raw

    if not best_raw:
        details = f" Détails: {' | '.join(error_samples)}" if error_samples else ""
        raise ValueError(
            f"OCR : {last_exc or 'aucun texte détecté — vérifiez que les modèles EasyOCR sont téléchargés'}{details}"
        )

    lines_raw: list[dict[str, Any]] = []
    for detection in best_raw:
        try:
            bbox, text, confidence = detection[0], str(detection[1]), float(detection[2])
        except (IndexError, ValueError, TypeError):
            continue
        if not text.strip():
            continue
        y_center = float(np.mean([p[1] for p in bbox]))
        lines_raw.append({"text": text, "confidence": round(confidence, 3), "y_center": y_center})

    if not lines_raw:
        raise ValueError("Aucun texte détecté sur l'image")

    lines_raw.sort(key=lambda x: x["y_center"])
    raw_text = "\n".join(line["text"] for line in lines_raw)
    return lines_raw, raw_text


def check_ollama_status() -> tuple[bool, bool, list[str]]:
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        llama3_ok = any("llama3" in m for m in models)
        return True, llama3_ok, models
    except requests.RequestException:
        return False, False, []


def build_prompt(text: str) -> str:
    return f"""You are a clinical pharmacist AI. Extract all medications from this prescription text.
Return ONLY valid JSON. No explanation. No markdown. No extra text.

Required JSON schema:
{{
  "patient":    "patient name or null",
  "prescriber": "doctor name or null",
  "date":       "date in YYYY-MM-DD or null",
  "remarks":    "non-medication notes for the patient or null",
  "medications": [
    {{
      "name":         "official drug name",
      "dose":         "dose with unit (e.g. 500mg, 1g)",
      "frequency":    "how often (e.g. 3x/day, twice daily, every 8h)",
      "duration":     "duration (e.g. 7 days) or null",
      "route":        "route of administration (oral, IV, etc.) or null",
      "instructions": "special instructions or null"
    }}
  ]
}}

Prescription text:
---
{text}
---
JSON:"""


def call_ollama(text: str, model: str = OLLAMA_MODEL, timeout: int = 120) -> str:
    payload = {
        "model": model,
        "prompt": build_prompt(text),
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 800},
    }
    resp = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=timeout)
    resp.raise_for_status()
    return str(resp.json().get("response", ""))


def parse_llm_json(raw_response: str | None) -> dict[str, Any] | None:
    if not raw_response:
        return None
    try:
        return json.loads(raw_response.strip())
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw_response)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    cleaned = re.sub(r"```json|```", "", raw_response).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def validate_structured(data: dict[str, Any] | None) -> tuple[bool, list[str]]:
    if not isinstance(data, dict):
        return False, ["La réponse n'est pas un objet JSON"]
    if "medications" not in data:
        return False, ["Champ 'medications' manquant"]
    if not isinstance(data["medications"], list):
        return False, ["'medications' doit être une liste"]
    issues: list[str] = []
    for i, med in enumerate(data["medications"]):
        if not isinstance(med, dict):
            issues.append(f"Médicament {i + 1} : objet invalide")
            continue
        for field in ("name", "dose", "frequency"):
            if field not in med:
                issues.append(f"Médicament {i + 1} : champ '{field}' manquant")
    return len(issues) == 0, issues


def heuristic_medications(text: str) -> dict[str, Any]:
    """Fallback extraction when Ollama is unavailable or JSON invalid."""
    meds: list[dict[str, Any]] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or len(line) < 4:
            continue
        dm = re.search(r"(\d[\d.,]*\s*(?:mg|g|ml|UI|ui|µg|mcg))\b", line, re.I)
        if not dm:
            continue
        dose = dm.group(1).replace(" ", "")
        name_part = line[: dm.start()].strip()
        name = re.sub(r"^[\d.\-\s]+", "", name_part).strip(" -,")
        if not name or len(name) < 2:
            name = line[: dm.start()].strip() or "Médicament (à vérifier)"
        freq_m = re.search(
            r"\b(\d+\s*[x×]\s*/?\s*jour|matin|soir|midi|coucher|b\.?i\.?d\.?|t\.?i\.?d\.?|quotidien|daily|toutes les\s*\d+\s*h)\b",
            line,
            re.I,
        )
        freq = freq_m.group(1) if freq_m else "Selon prescription"
        meds.append(
            {
                "name": name[:160],
                "dose": dose,
                "frequency": freq,
                "duration": None,
                "route": "oral",
                "instructions": line[dm.end() :].strip() or None,
            }
        )
    if not meds:
        snippet = " ".join(text.split())[:400]
        meds.append(
            {
                "name": "À compléter manuellement",
                "dose": "",
                "frequency": "À préciser",
                "duration": None,
                "route": None,
                "instructions": snippet or None,
            }
        )
    return {
        "patient": None,
        "prescriber": None,
        "date": None,
        "remarks": "Extraction heuristique — vérifiez chaque champ.",
        "medications": meds[:15],
    }


def process_prescription_bytes(image_bytes: bytes) -> dict[str, Any]:
    errors: list[str] = []
    result: dict[str, Any] = {
        "ocr_lines": [],
        "raw_text": "",
        "cleaned_text": "",
        "corrected_text": "",
        "corrections": [],
        "llm_response": None,
        "structured": None,
        "structured_source": None,
        "errors": errors,
    }

    try:
        ocr_lines, raw_text = run_ocr(image_bytes)
        result["ocr_lines"] = ocr_lines
        result["raw_text"] = raw_text
    except Exception as e:
        # OCR failed — record the detailed reason and still attempt heuristic
        # extraction on an empty string so the UI always gets a usable skeleton.
        errors.append(
            f"OCR: {type(e).__name__}: {e!r}  |  Trace: {traceback.format_exc(limit=1).strip()}  |  Conseils : (1) vérifiez que 'pip install easyocr' a été "
            "exécuté dans l'environnement du service ; (2) lors du premier lancement, "
            "EasyOCR télécharge ~150 Mo de modèles (connexion internet requise) ; "
            "(3) redémarrez le service après installation."
        )
        result["structured"] = heuristic_medications("")
        result["structured_source"] = "heuristic"
        return result

    try:
        cleaned = clean_ocr_text(raw_text)
        result["cleaned_text"] = cleaned
    except Exception as e:
        errors.append(f"Nettoyage: {e}")
        result["cleaned_text"] = raw_text
        cleaned = raw_text

    try:
        db = get_drug_database()
        corr, corrections = fuzzy_correct(cleaned, db)
        result["corrected_text"] = corr
        result["corrections"] = [{"from": a, "to": b, "score": c} for a, b, c in corrections]
    except Exception as e:
        errors.append(f"Fuzzy: {e}")
        result["corrected_text"] = cleaned
        corr = cleaned

    ollama_ok, llama3_ok, _ = check_ollama_status()
    structured = None
    llm_raw = None
    if ollama_ok and llama3_ok:
        try:
            llm_raw = call_ollama(corr)
            result["llm_response"] = llm_raw
            structured = parse_llm_json(llm_raw)
            ok, issues = validate_structured(structured)
            if not ok:
                errors.append("LLM JSON incomplet: " + "; ".join(issues))
                structured = None
            elif not structured.get("medications"):
                errors.append("LLM: liste de médicaments vide")
                structured = None
        except Exception as e:
            errors.append(f"LLM: {e}")

    if structured is None:
        structured = heuristic_medications(corr)
        result["structured_source"] = "heuristic"
    else:
        result["structured_source"] = "ollama"

    result["structured"] = structured
    return result
