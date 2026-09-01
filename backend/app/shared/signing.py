"""
Short-lived HMAC signatures for the two audio-download routes that must
stay reachable without a Firebase bearer token:

  - /api/campaigns/{id}/audio            (Sarv's phone system fetches this
                                           mid-call — it can't send our
                                           login header)
  - /api/tts/download/{folder}/{filename} (same, for per-language TTS
                                           recordings, and used directly in
                                           <audio src>/<a href> tags in the
                                           frontend)

Previously these were "public forever if you know the (unguessable) Mongo
ObjectId". That's fine as a floor, but the ID we hand to Sarv ends up
sitting in a third party's logs/systems indefinitely. Signing that specific
outbound link with a short expiry means even if it leaks from Sarv's side
later, it stops working.

The frontend's own direct <audio>/<a> usage (which can't attach an
Authorization header) keeps working exactly as before: routes accept an
unsigned request too, gated only by the same unguessable ID as before, so
no frontend changes are required. Only the links we generate for Sarv
carry a real signature + expiry.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.core.config import settings


def _sign(resource: str, expires_at: int) -> str:
    payload = f"{resource}:{expires_at}".encode()
    return hmac.new(settings.resolved_download_signing_secret.encode(), payload, hashlib.sha256).hexdigest()


def build_signed_query(resource: str, ttl_seconds: int | None = None) -> str:
    """Returns a `exp=...&sig=...` query string for the given resource key."""
    expires_at = int(time.time()) + (ttl_seconds or settings.download_link_ttl_seconds)
    signature = _sign(resource, expires_at)
    return f"exp={expires_at}&sig={signature}"


def verify_signed_params(resource: str, exp: str | None, sig: str | None) -> bool:
    """True only if exp/sig are both present, not expired, and match the
    resource key. Callers should treat "no params at all" as a *separate*
    case (fall back to normal auth or the pre-existing unguessable-ID
    behaviour) rather than calling this with None/None and trusting True."""
    if not exp or not sig:
        return False
    try:
        expires_at = int(exp)
    except (TypeError, ValueError):
        return False
    if expires_at < int(time.time()):
        return False
    expected = _sign(resource, expires_at)
    return hmac.compare_digest(expected, sig)
