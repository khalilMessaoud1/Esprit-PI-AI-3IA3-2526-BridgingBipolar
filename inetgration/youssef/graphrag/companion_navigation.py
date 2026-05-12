"""Heuristic in-chat navigation hints for the BridgingBipolar web app (paths are Next.js routes)."""

from __future__ import annotations

import re
from typing import Optional

# Next.js app routes (see apps/web/app)
PATH_PRESCRIPTION = "/medications/new"
PATH_SLEEP_ACTIVITIES = "/sleep-activities"

_RX_PRESCRIPTION = re.compile(
    r"(ordonnance|prescription|médicament\s+prescrit|medicament\s+prescrit)",
    re.IGNORECASE,
)
_RX_PRESCRIPTION_INTENT = re.compile(
    r"(trait|traiter|traitement|traitait|traitée|traiter\s+ma|traiter\s+mon|"
    r"scanner|saisir|saisie|ajouter|upload|télévers|televers|"
    r"add|scan|parse|analy|fill|enter|remplir|enregistrer|ocr|digit|"
    r"want\s+to\s+(add|upload|scan|enter|fill|use|trait|traiter)|"
    r"i\s+have\s+a\s+prescription)",
    re.IGNORECASE,
)

_RX_SLEEP = re.compile(
    r"(sleep[\s-]?activities|sleep\s+and\s+activities|mood\s+and\s+activities|"
    r"mood\s+activities|sleep\s+mood|"
    r"journal\s+(sommeil|d.?activit)|suivi\s+(sommeil|activit)|"
    r"(sommeil|sleep).*?(activit|journal|suivi|rapport|semaine)|"
    r"(activit|journal).*?(sommeil|sleep)|"
    r"week\s+in\s+words|ma\s+semaine|voir\s+mes\s+activit)",
    re.IGNORECASE,
)


def detect_companion_navigate_path(user_text: str) -> Optional[str]:
    """
    If the user clearly asks to use prescription handling or sleep/activities, return a web path.
    Prescription takes precedence when both could match.
    """
    t = (user_text or "").strip()
    if len(t) < 6:
        return None

    if _RX_PRESCRIPTION.search(t) and _RX_PRESCRIPTION_INTENT.search(t):
        return PATH_PRESCRIPTION
    if _RX_SLEEP.search(t):
        return PATH_SLEEP_ACTIVITIES
    return None
