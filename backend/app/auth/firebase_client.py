import firebase_admin
from firebase_admin import credentials

from app.core.config import settings

_app = None
_init_error: str | None = None


def get_firebase_app():
    global _app, _init_error
    if _app is not None:
        return _app
    if _init_error is not None:
        raise RuntimeError(_init_error)
    path = settings.firebase_service_account_path
    if not path:
        _init_error = (
            "FIREBASE_SERVICE_ACCOUNT_PATH is not configured. Download the service "
            "account key from Firebase Console > Project Settings > Service Accounts "
            "and point FIREBASE_SERVICE_ACCOUNT_PATH at it (env var / secrets manager) — "
            "never commit it to the repo."
        )
        raise RuntimeError(_init_error)
    cred = credentials.Certificate(path)
    _app = firebase_admin.initialize_app(cred)
    return _app
