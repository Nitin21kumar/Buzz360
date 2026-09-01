from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.auth.dependencies import owner_filter, require_permission
from app.core.rate_limit import limiter
from app.modules.stt import service

router = APIRouter(prefix="/api/stt", tags=["speech-to-text"])


@router.post("/transcribe")
@limiter.limit("15/minute")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    language_code: str = Form("unknown"),
    translate_to_english: bool = Form(False),
    user: dict = Depends(require_permission("stt", "transcribe")),
):
    audio_bytes = await file.read()
    return await service.transcribe(
        file.filename, audio_bytes, file.content_type, language_code, translate_to_english, user["uid"],
    )


@router.get("/history")
def stt_history(user: dict = Depends(require_permission("stt", "view"))):
    return service.list_history(owner_filter(user))
