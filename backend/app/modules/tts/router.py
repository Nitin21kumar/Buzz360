from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.auth.dependencies import get_current_user, has_permission, require_any_permission, require_permission
from app.core.rate_limit import limiter
from app.modules.tts import service
from app.modules.tts.schemas import FolderCreate, GenerateRequest
from app.shared.audio import range_response
from app.shared.mongo import to_object_id
from app.shared.signing import verify_signed_params

router = APIRouter(prefix="/api/tts", tags=["text-to-speech"])


@router.post("/folders")
def create_folder(payload: FolderCreate, user: dict = Depends(require_permission("voices", "create"))):
    doc = service.create_folder(payload.name)
    return {"id": str(doc["_id"]), "name": doc["name"], "created_at": doc["created_at"]}


@router.get("/folders")
def list_folders(user: dict = Depends(require_any_permission(("tts", "view"), ("voices", "view")))):
    return service.list_folders()


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str, user: dict = Depends(require_permission("voices", "delete"))):
    name = service.delete_folder(to_object_id(folder_id, "folder id"))
    return {"message": f"Deleted folder '{name}' and all its voices"}


@router.post("/generate")
@limiter.limit("10/minute")
async def generate_speech(request: Request, payload: GenerateRequest, user: dict = Depends(require_permission("tts", "generate"))):
    folder_oid = to_object_id(payload.folder_id, "folder id")
    return await service.generate_speech(folder_oid, payload.folder_id, payload)


@router.get("/history")
def tts_history(folder_id: str | None = Query(default=None, description="Filter to a single folder's voices"), user: dict = Depends(require_any_permission(("tts", "view"), ("voices", "view")))):
    return service.list_history(folder_id)


@router.get("/download/{folder_id}/{filename}")
@limiter.limit("60/minute")
def download_audio(
    folder_id: str,
    filename: str,
    request: Request,
    exp: str | None = Query(default=None),
    sig: str | None = Query(default=None),
):
    """Same dual-path model as the campaign audio route: a valid signed
    `exp`/`sig` (issued only for the URL handed to Sarv) bypasses the
    normal auth check; everyone else needs tts:view or voices:view. Voice
    folders are a shared, org-wide asset (not per-user), so there's no
    ownership check beyond that permission — matches how folders/history
    already work elsewhere in this module."""
    if not verify_signed_params(f"tts:{folder_id}:{filename}", exp, sig):
        user = get_current_user(request)
        if not (has_permission(user, "tts", "view") or has_permission(user, "voices", "view")):
            raise HTTPException(403, "You don't have access to tts or voices.")

    audio_bytes = service.get_download(folder_id, filename)
    return range_response(request, audio_bytes, "audio/wav", filename)


@router.delete("/{folder_id}/{language_code}")
def delete_voice(folder_id: str, language_code: str, user: dict = Depends(require_permission("tts", "delete"))):
    service.delete_voice(folder_id, language_code)
    return {"message": "Deleted voice from this folder"}
