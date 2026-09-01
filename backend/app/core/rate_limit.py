"""
Central rate limiter (slowapi / limits), applied selectively to the
endpoints that can otherwise be used to run up real money — paid
upstream API calls (Groq, Sarvam, Sarv, ValueFirst, Meta) — or to brute
force/enumerate the unauthenticated webhook and signed-download routes.

This is deliberately not applied blanket-wide to every route: most of the
app's endpoints are already behind Firebase auth + RBAC, and rate-limiting
every single one adds complexity for little extra protection. The ones
decorated with @limiter.limit(...) in each router are the ones that are
either public (webhooks) or trigger a paid/external side effect.
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _key_func(request: Request) -> str:
    uid = getattr(request.state, "uid", None)
    return uid or get_remote_address(request)


limiter = Limiter(key_func=_key_func, enabled=settings.rate_limit_enabled)
