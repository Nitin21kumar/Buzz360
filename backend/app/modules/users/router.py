from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user, require_permission
from app.auth.permissions import catalog_response
from app.modules.users import service
from app.modules.users.schemas import UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return service.get_me(user)


@router.get("/catalog")
def get_catalog(user: dict = Depends(require_permission("users", "view"))):
    return catalog_response()


@router.get("")
def list_users(user: dict = Depends(require_permission("users", "view"))):
    return service.list_users(user)


@router.post("")
def create_user(payload: UserCreate, actor: dict = Depends(require_permission("users", "create"))):
    return service.create_user(actor, payload)


@router.patch("/{uid}")
def update_user(uid: str, payload: UserUpdate, actor: dict = Depends(require_permission("users", "edit"))):
    return service.update_user(actor, uid, payload)


@router.delete("/{uid}")
def delete_user(uid: str, actor: dict = Depends(require_permission("users", "delete"))):
    service.delete_user(actor, uid)
    return {"deleted": True}
