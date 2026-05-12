"""Conservative multilingual heuristics for suicidal ideation / wanting to die (not clinical)."""

from __future__ import annotations

import re
from typing import Pattern

# Strong phrases (user expressing intent about self, not third-person statistics alone).
_PATTERNS: tuple[tuple[Pattern[str], str], ...] = (
    # English
    (re.compile(r"\b(kill|hurt)\s+myself\b", re.I), "en_self_harm"),
    (re.compile(r"\bwant\s+to\s+die\b", re.I), "en_want_die"),
    (re.compile(r"\bgoing\s+to\s+(kill\s+myself|end\s+it|end\s+my\s+life)\b", re.I), "en_plan"),
    (re.compile(r"\bend\s+my\s+life\b", re.I), "en_end_life"),
    (re.compile(r"\bsuicid\w*\b.*\b(myself|me)\b|\b(myself|me)\b.*\bsuicid", re.I | re.S), "en_suicide_self"),
    (re.compile(r"\b(can'?t|cannot)\s+go\s+on\s+(living|like\s+this)\b", re.I), "en_cannot_go_on"),
    (re.compile(r"\bno\s+reason\s+to\s+live\b", re.I), "en_no_reason"),
    # French
    (re.compile(r"\bme\s+suicid", re.I), "fr_me_suicide"),
    (re.compile(r"\benvie\s+de\s+mourir\b", re.I), "fr_want_die"),
    (re.compile(r"\bje\s+veux\s+mourir\b", re.I), "fr_want_die2"),
    (re.compile(r"\bje\s+veux\s+(me\s+)?suicid", re.I), "fr_want_suicide"),
    (re.compile(r"\bfinir\s+(avec\s+)?ma\s+vie\b", re.I), "fr_end_life"),
    (re.compile(r"\b(je\s+)?vais\s+me\s+suicid", re.I), "fr_will_suicide"),
    (re.compile(r"\bplus\s+aucune\s+raison\s+de\s+vivre\b", re.I), "fr_no_reason"),
    # Arabic (common phrases; script + some transliteration)
    (re.compile(r"أريد\s+أن\s+أموت|بدي\s+أموت|بدي\s+اموت", re.I), "ar_want_die"),
    (re.compile(r"انتحر|الانتحار\s+بنفسي|حأنتحر|سأنتحر", re.I), "ar_suicide"),
    (re.compile(r"مو\s+عايز\s+اعيش|مش\s+عايز\s+اعيش|ما\s+بدي\s+عيش", re.I), "ar_dont_want_live"),
)

# If matched, require absence of these "educational / third person" windows to reduce FP.
_EDU_NEG = re.compile(
    r"\b(statistics|research|study|article|according\s+to|definition\s+of|what\s+is)\b",
    re.I,
)


def is_crisis_self_harm_turn(text: str) -> bool:
    """
    True when the user message likely expresses acute self-harm / suicidal ideation about themselves.

    Heuristic only; false negatives and positives are possible. Prefer triggering support flows
    only together with policy (e.g. strike counts + human review).
    """
    raw = (text or "").strip()
    if len(raw) < 6:
        return False
    blob = raw.lower()
    # Skip obvious "talking about suicide as a topic" if very weak signal — only applies with edu cue
    if _EDU_NEG.search(raw) and not re.search(
        r"\b(i|i'|i’|je|me|myself|moi|نفسي|حالي)\b.*\b(die|suicid|mourir|موت|انتحر)|"
        r"\b(die|suicid|mourir|موت|انتحر)\b.*\b(i|je|me|myself|moi|نفسي)\b",
        blob,
        re.I,
    ):
        return False

    for rx, _tag in _PATTERNS:
        if rx.search(raw):
            return True
    return False
