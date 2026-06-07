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
import threading
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
_drug_db_lock = threading.Lock()

MATCH_THRESHOLD = 82

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:latest")
OLLAMA_NUM_PREDICT = int(os.environ.get("PRESCRIPTION_OLLAMA_NUM_PREDICT", "320"))
OLLAMA_NUM_CTX = int(os.environ.get("PRESCRIPTION_OLLAMA_NUM_CTX", "2048"))
USE_OLLAMA = os.environ.get("PRESCRIPTION_USE_OLLAMA", "1").strip().lower() in ("1", "true", "yes")
OCR_MAX_VARIANTS = max(1, min(5, int(os.environ.get("PRESCRIPTION_OCR_MAX_VARIANTS", "2"))))
OCR_MAX_SIDE = int(os.environ.get("PRESCRIPTION_MAX_IMAGE_SIDE", "1600"))
OCR_EARLY_EXIT_SCORE = float(os.environ.get("PRESCRIPTION_OCR_EARLY_EXIT_SCORE", "14"))
DRUG_DB_ONLINE = os.environ.get("PRESCRIPTION_DRUG_DB_ONLINE", "1").strip().lower() in ("1", "true", "yes")
FUZZY_MAX_WORDS = int(os.environ.get("PRESCRIPTION_FUZZY_MAX_WORDS", "35"))

BUILTIN_DRUGS = {
    "Lithium", "Quetiapine", "Quétiapine", "Lamotrigine", "Valproate", "Valproate de sodium",
    "Olanzapine", "Aripiprazole", "Risperidone", "Rispéridone", "Sertraline", "Fluoxétine",
    "Fluoxetine", "Escitalopram", "Paroxetine", "Paroxétine", "Lorazepam", "Lorazépam",
    "Clonazepam", "Clonazépam", "Zolpidem", "Trazodone", "Bupropion", "Venlafaxine",
    "Amoxicilline", "Amoxicillin", "Paracétamol", "Paracetamol", "Ibuprofène", "Ibuprofen",
    "Oméprazole", "Omeprazole", "Metformine", "Metformin", "Doliprane", "Spasfon",
    "Levothyrox", "Levothyroxine", "Bisoprolol", "Amlodipine", "Ramipril", "Atorvastatine",
}


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


def _cache_dir() -> str:
    path = os.environ.get(
        "PRESCRIPTION_CACHE_DIR",
        os.path.join(tempfile.gettempdir(), "bb_prescription_cache"),
    )
    os.makedirs(path, exist_ok=True)
    return path


def _drug_db_cache_path() -> str:
    return os.path.join(_cache_dir(), "drug_db.json")


def load_rxnorm_names(max_names: int = 2500) -> list[str]:
    names: set[str] = set()
    try:
        url = "https://rxnav.nlm.nih.gov/REST/allconcepts.json?tty=IN+PIN+BN+SCDC+SBD"
        resp = requests.get(url, timeout=15)
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
        resp = requests.get(bdpm_url, timeout=15)
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


def _load_drug_db_from_cache() -> list[str] | None:
    path = _drug_db_cache_path()
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list) and len(data) >= 50:
            return [str(d) for d in data if isinstance(d, str) and 4 <= len(d) <= 80]
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return None


def _save_drug_db_cache(names: list[str]) -> None:
    try:
        with open(_drug_db_cache_path(), "w", encoding="utf-8") as fh:
            json.dump(names[:12000], fh)
    except OSError:
        pass


def _fetch_drug_database_online() -> list[str]:
    rx = load_rxnorm_names()
    bd = load_bdpm_names()
    merged = list(set(rx + bd + list(BUILTIN_DRUGS)))
    return [d for d in merged if 4 <= len(d) <= 80]


def get_drug_database() -> list[str]:
    global _drug_database
    if _drug_database is not None:
        return _drug_database

    with _drug_db_lock:
        if _drug_database is not None:
            return _drug_database

        cached = _load_drug_db_from_cache()
        if cached:
            _drug_database = cached
            if DRUG_DB_ONLINE:
                threading.Thread(target=_refresh_drug_db_background, daemon=True).start()
            return _drug_database

        _drug_database = sorted(BUILTIN_DRUGS)
        if DRUG_DB_ONLINE:
            try:
                _drug_database = _fetch_drug_database_online()
                _save_drug_db_cache(_drug_database)
            except Exception:
                pass
            threading.Thread(target=_refresh_drug_db_background, daemon=True).start()
        return _drug_database


def _refresh_drug_db_background() -> None:
    global _drug_database
    if not DRUG_DB_ONLINE:
        return
    try:
        fresh = _fetch_drug_database_online()
        if len(fresh) >= 50:
            _save_drug_db_cache(fresh)
            _drug_database = fresh
    except Exception:
        pass


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
    candidates = sorted(candidates, key=len, reverse=True)[:FUZZY_MAX_WORDS]
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


def _resize_if_needed(img: np.ndarray, max_side: int | None = None) -> np.ndarray:
    limit = max_side if max_side is not None else OCR_MAX_SIDE
    h, w = img.shape[:2]
    m = max(h, w)
    if m <= limit:
        return img
    scale = limit / float(m)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def prepare_ocr_images(image_bytes: bytes) -> list[np.ndarray]:
    try:
        base = _resize_if_needed(image_bytes_to_bgr(image_bytes))
    except Exception as exc:
        raise ValueError("Impossible de lire l'image") from exc
    variants: list[np.ndarray] = []

    gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 9, 75, 75)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    norm = clahe.apply(blur)

    thr = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 10)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharp = cv2.filter2D(base, -1, kernel)
    up = cv2.resize(base, None, fx=1.4, fy=1.4, interpolation=cv2.INTER_CUBIC)
    all_variants = [base, norm, thr, sharp, up]
    return all_variants[:OCR_MAX_VARIANTS]


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
    """Run EasyOCR on one image variant (numpy first — faster than temp files)."""
    try:
        return reader.readtext(img, detail=1, paragraph=False)
    except Exception as exc:
        last_exc = exc
    tmp_path: str | None = None
    try:
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
    except Exception as exc2:
        raise ValueError(f"{last_exc}; fallback-file: {exc2}") from exc2
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

    for idx, img in enumerate(variants):
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
        if score >= OCR_EARLY_EXIT_SCORE and (idx == 0 or score >= OCR_EARLY_EXIT_SCORE * 1.35):
            break

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
    clipped = text[:3500]
    return f"""Extract medications from this prescription OCR text. Return ONLY valid JSON, no markdown.

Schema:
{{"patient":null,"prescriber":null,"date":null,"remarks":null,"medications":[{{"name":"","dose":"","frequency":"","duration":null,"route":null,"instructions":null}}]}}

Text:
{clipped}
JSON:"""


def call_ollama(text: str, model: str = OLLAMA_MODEL, timeout: int = 90) -> str:
    payload = {
        "model": model,
        "prompt": build_prompt(text),
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "temperature": 0.05,
            "num_predict": OLLAMA_NUM_PREDICT,
            "num_ctx": OLLAMA_NUM_CTX,
        },
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


def _heuristic_is_usable(data: dict[str, Any]) -> bool:
    meds = data.get("medications")
    if not isinstance(meds, list) or not meds:
        return False
    for med in meds:
        if not isinstance(med, dict):
            continue
        name = str(med.get("name") or "").strip()
        dose = str(med.get("dose") or "").strip()
        if name and name != "À compléter manuellement" and dose:
            return True
    return False


def warmup() -> None:
    """Preload OCR + drug cache (+ optional Ollama ping) at service startup."""
    get_reader()
    get_drug_database()
    if not USE_OLLAMA:
        return
    try:
        ok, llama_ok, _ = check_ollama_status()
        if ok and llama_ok:
            requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": "ok",
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {"num_predict": 1, "num_ctx": 512},
                },
                timeout=45,
            )
    except requests.RequestException:
        pass


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
    heuristic = heuristic_medications(corr)

    if _heuristic_is_usable(heuristic):
        structured = heuristic
        result["structured_source"] = "heuristic"
    elif USE_OLLAMA and ollama_ok and llama3_ok:
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
        structured = heuristic
        result["structured_source"] = "heuristic"
    elif result.get("structured_source") is None:
        result["structured_source"] = "ollama"

    result["structured"] = structured
    return result
