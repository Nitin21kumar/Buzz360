import secrets
from datetime import datetime, timezone

from firebase_admin import auth as firebase_auth

from app.auth.firebase_client import get_firebase_app
from app.auth.permissions import ASSIGNABLE_ROLES, MODULE_CATALOG, catalog_response
from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError, UpstreamServiceError, ValidationError
from app.modules.users import repository


def to_public(profile: dict) -> dict:
    return {
        "uid": profile["uid"],
        "email": profile["email"],
        "name": profile.get("name", ""),
        "role": profile["role"],
        "modules": profile.get("modules", []),
        "services": profile.get("services", []),
        "fields": profile.get("fields", []),
        "active": profile.get("active", True),
        "created_at": profile.get("created_at"),
    }


def _assert_valid_grants(modules: list[str], services: list[str], fields: list[str]) -> None:
    for m in modules:
        if m not in MODULE_CATALOG:
            raise ValidationError(f"Unknown module '{m}'")
    for s in services:
        mod = s.split(":")[0]
        if mod not in MODULE_CATALOG or s.split(":", 1)[1] not in MODULE_CATALOG[mod]["services"]:
            raise ValidationError(f"Unknown service '{s}'")
    for f in fields:
        mod = f.split(":")[0]
        if mod not in MODULE_CATALOG or f.split(":", 1)[1] not in MODULE_CATALOG[mod]["fields"]:
            raise ValidationError(f"Unknown field '{f}'")


def _assert_can_assign_role(actor: dict, target_role: str) -> None:
    if target_role not in ASSIGNABLE_ROLES.get(actor["role"], []):
        raise PermissionDeniedError(f"Your role ({actor['role']}) can't assign the '{target_role}' role.")


def _assert_can_manage(actor: dict, target_profile: dict) -> None:
    if target_profile["uid"] == actor["uid"]:
        raise ValidationError("Use your own profile settings to change your own account.")
    if target_profile["role"] not in ASSIGNABLE_ROLES.get(actor["role"], []):
        raise PermissionDeniedError("You don't have permission to manage this user.")


def get_me(user: dict) -> dict:
    return {"profile": to_public(user), "catalog": catalog_response()}


def list_users(actor: dict) -> list[dict]:
    manageable_roles = ASSIGNABLE_ROLES.get(actor["role"], []) + [actor["role"]]
    return [to_public(d) for d in repository.list_by_roles(manageable_roles)]


def create_user(actor: dict, payload) -> dict:
    _assert_can_assign_role(actor, payload.role)
    _assert_valid_grants(payload.modules, payload.services, payload.fields)

    try:
        get_firebase_app()
    except RuntimeError as e:
        raise UpstreamServiceError(str(e))

    temp_password = secrets.token_urlsafe(12)
    try:
        fb_user = firebase_auth.create_user(email=payload.email, password=temp_password, display_name=payload.name)
    except firebase_auth.EmailAlreadyExistsError:
        raise ConflictError("A user with this email already exists.")

    profile = {
        "uid": fb_user.uid,
        "email": payload.email,
        "name": payload.name,
        "role": payload.role,
        "modules": payload.modules,
        "services": payload.services,
        "fields": payload.fields,
        "active": True,
        "created_by": actor["uid"],
        "created_at": datetime.now(timezone.utc),
    }
    repository.insert(profile)

    reset_link = None
    try:
        reset_link = firebase_auth.generate_password_reset_link(payload.email)
    except Exception:
        pass

    return {"user": to_public(profile), "password_reset_link": reset_link}


def update_user(actor: dict, uid: str, payload) -> dict:
    target = repository.find_by_uid(uid)
    if not target:
        raise NotFoundError("User not found")
    _assert_can_manage(actor, target)

    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.role is not None:
        _assert_can_assign_role(actor, payload.role)
        updates["role"] = payload.role
    if payload.modules is not None or payload.services is not None or payload.fields is not None:
        modules = payload.modules if payload.modules is not None else target.get("modules", [])
        services = payload.services if payload.services is not None else target.get("services", [])
        fields = payload.fields if payload.fields is not None else target.get("fields", [])
        _assert_valid_grants(modules, services, fields)
        updates["modules"], updates["services"], updates["fields"] = modules, services, fields
    if payload.active is not None:
        updates["active"] = payload.active
        try:
            get_firebase_app()
            firebase_auth.update_user(uid, disabled=not payload.active)
        except RuntimeError:
            pass

    repository.update(uid, updates)
    return to_public(repository.find_by_uid(uid))


def delete_user(actor: dict, uid: str) -> None:
    target = repository.find_by_uid(uid)
    if not target:
        raise NotFoundError("User not found")
    _assert_can_manage(actor, target)

    repository.delete(uid)
    try:
        get_firebase_app()
        firebase_auth.delete_user(uid)
    except Exception:
        pass
