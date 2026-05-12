"""Send Twilio WhatsApp messages (parent crisis alert). Do not include user self-harm text.

Env (required for sends):
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_WHATSAPP_FROM          e.g. whatsapp:+14155238886

WhatsApp Content / template (recommended for sandbox + production):
  TWILIO_WHATSAPP_CONTENT_SID     e.g. HXb5b62575e6e4ff6129ad7c8efe1f983e
  TWILIO_WHATSAPP_CONTENT_VARIABLES   optional JSON string for {{1}}, {{2}}, ...
    If omitted, defaults: {"1": name, "2": urgent line about suicidal thoughts + reach out now}.

  TWILIO_CRISIS_MESSAGE_BODY   optional override for the full free-text body (no Content SID).
    Use {name} or {Name} for the account holder's display name.

Aliases for content SID (first non-empty wins):
  TWILIO_CRISIS_CONTENT_SID, TWILIO_CONTENT_SID, CRISIS_ALERT_TEMPLATE_SID

When TWILIO_WHATSAPP_CONTENT_SID (or an alias) is set, ``messages.create`` uses
``content_sid`` + ``content_variables`` only (no ``body``), matching Twilio's API.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)


def _strip_env_quotes(val: str) -> str:
    """Strip wrapping quotes from .env values (e.g. 'AC…' or \"token\")."""
    s = (val or "").strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        return s[1:-1].strip()
    return s


def _twilio_configured() -> bool:
    sid = _strip_env_quotes(os.getenv("TWILIO_ACCOUNT_SID") or "")
    token = _strip_env_quotes(os.getenv("TWILIO_AUTH_TOKEN") or "")
    from_n = _strip_env_quotes(os.getenv("TWILIO_WHATSAPP_FROM") or "")
    return bool(sid and token and from_n)


def _to_whatsapp_address(e164: str) -> str:
    raw = (e164 or "").strip().replace(" ", "")
    if raw.lower().startswith("whatsapp:"):
        return raw
    if not raw.startswith("+"):
        raw = "+" + raw.lstrip("+")
    return f"whatsapp:{raw}"


def _parent_urgent_message(display: str, lang: str) -> str:
    """Urgent, personalized parent text (name = person using the app)."""
    name = (display or "your friend").strip() or "your friend"
    tpl = (os.getenv("TWILIO_CRISIS_MESSAGE_BODY") or "").strip()
    if tpl:
        return tpl.replace("{name}", name).replace("{Name}", name)[:1600]
    lang_l = (lang or "en").lower()
    if lang_l.startswith("fr"):
        return (
            f"Urgent ! Vérifiez {name} : il/elle pourrait avoir des pensées suicidaires "
            "(signalé par l'application compagnon). Contactez-le/la tout de suite. "
            "En cas de danger immédiat, appelez les secours."
        )
    return (
        f"Urgent! Check on {name} — they may be having suicidal thoughts "
        "(flagged by the companion support app). Please reach them now. "
        "If you believe they are in immediate danger, call emergency services."
    )


def _resolve_content_sid() -> str:
    for key in (
        "TWILIO_WHATSAPP_CONTENT_SID",
        "TWILIO_CRISIS_CONTENT_SID",
        "TWILIO_CONTENT_SID",
        "CRISIS_ALERT_TEMPLATE_SID",
    ):
        v = _strip_env_quotes(os.getenv(key) or "")
        if v:
            return v
    return ""


def _build_content_variables(display: str, lang: str) -> str:
    """JSON string for Twilio ``content_variables`` (numbered placeholders {{1}}, {{2}}, …)."""
    env_raw = (
        (os.getenv("TWILIO_WHATSAPP_CONTENT_VARIABLES") or "").strip()
        or (os.getenv("TWILIO_CRISIS_CONTENT_VARIABLES_JSON") or "").strip()
    )
    if env_raw:
        return env_raw

    display_safe = (display or "your friend").strip()[:200] or "your friend"
    lang_l = (lang or "en").lower()
    # Many WhatsApp templates use {{1}} = name, {{2}} = second line of the alert.
    if lang_l.startswith("fr"):
        v2 = (
            f"il/elle pourrait avoir des pensées suicidaires (application compagnon). "
            f"Contactez {display_safe} tout de suite. En danger immédiat : secours."
        )
    else:
        v2 = (
            f"they may be having suicidal thoughts (companion app). "
            f"Please reach {display_safe} now. If they are in immediate danger, call emergency services."
        )
    return json.dumps({"1": display_safe, "2": v2[:500]}, ensure_ascii=False)


def send_parent_crisis_alert(
    *,
    to_e164: str,
    user_display: str,
    lang: str = "en",
) -> bool:
    """
    Notify parent/guardian via Twilio WhatsApp.

    Uses the same pattern as Twilio's Python example: ``Client`` + ``messages.create`` with
    ``from_``, ``to``, and when configured, ``content_sid`` + ``content_variables``.
    """
    if not _twilio_configured():
        logger.warning("Twilio WhatsApp skipped: missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM")
        return False

    try:
        from twilio.rest import Client
    except ImportError:
        logger.warning("Twilio WhatsApp skipped: twilio package not installed")
        return False

    account_sid = _strip_env_quotes(os.getenv("TWILIO_ACCOUNT_SID") or "")
    auth_token = _strip_env_quotes(os.getenv("TWILIO_AUTH_TOKEN") or "")
    from_whatsapp = _strip_env_quotes(os.getenv("TWILIO_WHATSAPP_FROM") or "")
    to_whatsapp = _to_whatsapp_address(to_e164)

    display = (user_display or "Someone").strip()[:80] or "Someone"
    lang_l = (lang or "en").lower()[:8]

    body = _parent_urgent_message(display, lang_l)

    content_sid = _resolve_content_sid()

    try:
        client = Client(account_sid, auth_token)
        if content_sid:
            content_variables = _build_content_variables(display, lang_l)
            client.messages.create(
                from_=from_whatsapp,
                to=to_whatsapp,
                content_sid=content_sid,
                content_variables=content_variables,
            )
        else:
            client.messages.create(
                from_=from_whatsapp,
                to=to_whatsapp,
                body=body,
            )
        logger.info("Twilio parent crisis WhatsApp queued to=%s", to_whatsapp[:22] + "…")
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning("Twilio WhatsApp send failed: %s", exc)
        return False
