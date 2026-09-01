from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from firebase_admin import auth as firebase_auth

from app.auth.firebase_client import get_firebase_app
from app.auth.permissions import default_permissions_for_role
from app.db.collections import users_collection
from app.db.postgres_store import DuplicateKeyError


def _extract_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    return header[len("Bearer "):].strip()


def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(401, "Your session was revoked. Please sign in again.")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception:
        raise HTTPException(401, "Invalid or expired session. Please sign in again.")

    uid = decoded["uid"]
    profile = users_collection.find_one({"uid": uid})

    if profile is None:
        is_first_user_ever = users_collection.count_documents({}) == 0
        role = "super_admin" if is_first_user_ever else "user"
        perms = default_permissions_for_role(role)
        profile = {
            "uid": uid,
            "email": decoded.get("email", ""),
            "name": decoded.get("name") or (decoded.get("email", "").split("@")[0]),
            "role": role,
            "modules": perms["modules"],
            "services": perms["services"],
            "fields": perms["fields"],
            "active": True,
            "created_by": "self:bootstrap" if is_first_user_ever else "self:signup",
            "created_at": datetime.now(timezone.utc),
        }
        try:
            users_collection.insert_one(profile)
        except DuplicateKeyError:
            profile = users_collection.find_one({"uid": uid})

    if not profile.get("active", True):
        raise HTTPException(403, "This account has been deactivated. Contact your admin.")

    profile["_id"] = str(profile["_id"])
    return profile


def has_permission(user: dict, module: str, service: str | None = None) -> bool:
    if user["role"] in ("super_admin", "admin"):
        return True
    if module not in (user.get("modules") or []):
        return False
    if service is None:
        return True
    return f"{module}:{service}" in (user.get("services") or [])


def require_role(*roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "You don't have permission to do this.")
        return user
    return dependency


def require_permission(module: str, service: str | None = None):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, module, service):
            raise HTTPException(403, f"You don't have access to {module}" + (f":{service}" if service else "") + ".")
        return user
    return dependency


def require_any_permission(*checks: tuple[str, str | None]):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not any(has_permission(user, module, service) for module, service in checks):
            names = ", ".join(f"{m}:{s}" if s else m for m, s in checks)
            raise HTTPException(403, f"You don't have access to any of: {names}.")
        return user
    return dependency


def owner_filter(user: dict) -> dict:
    if user["role"] in ("super_admin", "admin"):
        return {}
    return {"created_by": user["uid"]}


def assert_owns_or_admin(user: dict, doc: dict | None):
    if doc is None:
        raise HTTPException(404, "Not found")
    if user["role"] in ("super_admin", "admin"):
        return
    if doc.get("created_by") != user["uid"]:
        raise HTTPException(404, "Not found")
