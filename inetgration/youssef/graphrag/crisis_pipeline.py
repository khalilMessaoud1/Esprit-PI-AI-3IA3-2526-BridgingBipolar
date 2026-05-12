"""After a chat turn: detect crisis, update Redis strikes, optionally notify parent via Twilio."""

from __future__ import annotations

import logging
from typing import Any, Dict

from graphrag.auth_store import AuthStore, UserRecord
from graphrag.crisis_detector import is_crisis_self_harm_turn
from graphrag.crisis_redis import CrisisRedisStore
from services.twilio_whatsapp import send_parent_crisis_alert

logger = logging.getLogger(__name__)


def handle_crisis_post_turn(
    store: AuthStore,
    crisis: CrisisRedisStore,
    user: UserRecord,
    user_text_for_crisis: str,
    *,
    reply_lang: str = "en",
) -> Dict[str, Any]:
    """
    Run crisis detection and parent WhatsApp flow. Never logs raw crisis user text.

    Returns optional keys for API JSON (no PII).
    """
    out: Dict[str, Any] = {}
    text = (user_text_for_crisis or "").strip()
    if len(text) < 6:
        return out

    if not is_crisis_self_harm_turn(text):
        return out

    fresh = store.get_user_by_id(user.id)
    if fresh is None:
        return out

    if not fresh.parent_contact_consent or not (fresh.parent_whatsapp or "").strip():
        logger.warning(
            "crisis_signal user_id=%s whatsapp_skipped=no_parent_contact "
            "(configure parent WhatsApp + consent: signup or PATCH /api/auth/parent-contact)",
            user.id,
        )
        return out

    if not crisis.available:
        logger.warning("crisis_signal user_id=%s redis_unavailable=no_strike_count", user.id)
        return out

    strikes = crisis.incr_crisis_strike(user.id)
    out["crisis_strike_incremented"] = True
    out["crisis_strikes"] = strikes

    threshold = crisis.strike_threshold
    if strikes < threshold:
        logger.info("crisis_signal user_id=%s strikes=%s threshold=%s", user.id, strikes, threshold)
        return out

    if crisis.parent_alert_sent_recently(user.id):
        logger.info("crisis_signal user_id=%s parent_notify_skip=cooldown", user.id)
        return out

    ok = send_parent_crisis_alert(
        to_e164=fresh.parent_whatsapp.strip(),
        user_display=fresh.name or "User",
        lang=reply_lang,
    )
    if ok:
        crisis.mark_parent_alert_sent(user.id)
        crisis.reset_strikes(user.id)
        out["crisis_support_notified"] = True
        logger.info("crisis_parent_whatsapp_sent user_id=%s", user.id)
    else:
        logger.warning("crisis_parent_whatsapp_failed user_id=%s", user.id)

    return out
