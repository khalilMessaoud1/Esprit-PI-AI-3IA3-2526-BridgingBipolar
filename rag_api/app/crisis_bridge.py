"""Crisis detection + Redis strikes + Twilio — Nest supplies parent fields (no AuthStore)."""

from __future__ import annotations

import logging
import zlib
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def crisis_redis_user_key(user_id: str) -> int:
    """Stable positive int from string user id for CrisisRedisStore keys."""
    x = zlib.crc32(user_id.encode("utf-8")) & 0xFFFFFFFF
    n = x % (2**31 - 2)
    return n if n > 0 else 1


def run_friend_crisis_post_turn(
    crisis: Any,
    *,
    user_id: str,
    user_text_for_crisis: str,
    reply_lang: str = "en",
    parent_whatsapp_e164: Optional[str] = None,
    parent_contact_consent: bool = False,
    display_name: str = "User",
) -> Dict[str, Any]:
    from graphrag.crisis_detector import is_crisis_self_harm_turn
    from services.twilio_whatsapp import send_parent_crisis_alert

    out: Dict[str, Any] = {}
    text = (user_text_for_crisis or "").strip()
    if len(text) < 6:
        return out
    if not is_crisis_self_harm_turn(text):
        return out

    if not parent_contact_consent or not (parent_whatsapp_e164 or "").strip():
        logger.warning(
            "crisis_signal user_id=%s whatsapp_skipped=no_parent_contact",
            user_id[:12],
        )
        return out

    if not getattr(crisis, "available", False):
        logger.warning("crisis_signal user_id=%s redis_unavailable=no_strike_count", user_id[:12])
        return out

    uid = crisis_redis_user_key(user_id)
    strikes = crisis.incr_crisis_strike(uid)
    out["crisis_strike_incremented"] = True
    out["crisis_strikes"] = strikes

    threshold = crisis.strike_threshold
    if strikes < threshold:
        logger.info(
            "crisis_signal user_id=%s strikes=%s threshold=%s",
            user_id[:12],
            strikes,
            threshold,
        )
        return out

    if crisis.parent_alert_sent_recently(uid):
        logger.info("crisis_signal user_id=%s parent_notify_skip=cooldown", user_id[:12])
        return out

    ok = send_parent_crisis_alert(
        to_e164=parent_whatsapp_e164.strip(),
        user_display=(display_name or "User").strip()[:80] or "User",
        lang=reply_lang,
    )
    if ok:
        crisis.mark_parent_alert_sent(uid)
        crisis.reset_strikes(uid)
        out["crisis_support_notified"] = True
        logger.info("crisis_parent_whatsapp_sent user_id=%s", user_id[:12])
    else:
        logger.warning("crisis_parent_whatsapp_failed user_id=%s", user_id[:12])

    return out
