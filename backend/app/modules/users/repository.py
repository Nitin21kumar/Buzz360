from app.core.exceptions import ConflictError
from app.db.collections import users_collection
from app.db.postgres_store import DuplicateKeyError


def find_by_uid(uid: str) -> dict | None:
    return users_collection.find_one({"uid": uid})


def find_by_email(email: str) -> dict | None:
    return users_collection.find_one({"email": email})


def list_by_roles(roles: list[str]) -> list[dict]:
    return list(users_collection.find({"role": {"$in": roles}}).sort("created_at", -1))


def insert(profile: dict) -> None:
    try:
        users_collection.insert_one(profile)
    except DuplicateKeyError as exc:
        raise ConflictError("A user with this uid or email already exists.") from exc


def update(uid: str, updates: dict) -> None:
    if updates:
        users_collection.update_one({"uid": uid}, {"$set": updates})


def delete(uid: str) -> None:
    users_collection.delete_one({"uid": uid})
