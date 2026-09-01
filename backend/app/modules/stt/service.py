import httpx

from app.core.config import settings
from app.core.exceptions import UpstreamServiceError, ValidationError
from app.modules.stt import repository
from app.shared import groq_client
from app.shared.constants import LANGUAGE_DISPLAY

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


async def transcribe(filename: str, audio_bytes: bytes, content_type: str, language_code: str, translate_to_english: bool, created_by: str) -> dict:
    if not settings.sarvam_api_key:
        raise UpstreamServiceError("SARVAM_API_KEY is not configured on the backend")
    if not audio_bytes:
        raise ValidationError("Uploaded file is empty")

    base_content_type = (content_type or "audio/mpeg").split(";")[0].strip()
    mode = "translate" if translate_to_english else "transcribe"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                SARVAM_STT_URL,
                headers={"api-subscription-key": settings.sarvam_api_key},
                data={"model": "saaras:v3", "language_code": language_code, "mode": mode},
                files={"file": (filename, audio_bytes, base_content_type)},
            )
    except httpx.RequestError as exc:
        raise UpstreamServiceError("Could not connect to Sarvam AI") from exc

    if response.is_error:
        try:
            detail = response.json().get("error", {}).get("message") or response.text
        except ValueError:
            detail = response.text
        raise UpstreamServiceError(detail or "Transcription failed")

    data = response.json()
    raw_transcript = data.get("transcript", "")
    detected_language = data.get("language_code", language_code)

    language_name = "English" if translate_to_english else LANGUAGE_DISPLAY.get(detected_language, detected_language)
    try:
        corrected_transcript = await groq_client.correct_transcript(raw_transcript, language_name)
    except UpstreamServiceError:
        corrected_transcript = raw_transcript

    output_language_code = "en-IN" if translate_to_english else detected_language

    repository.save_transcript(filename, corrected_transcript, raw_transcript, output_language_code, detected_language, created_by)

    return {
        "transcript": corrected_transcript,
        "raw_transcript": raw_transcript,
        "language_code": output_language_code,
        "spoken_language_code": detected_language,
    }


def list_history(owner_query: dict) -> list[dict]:
    docs = repository.list_history(owner_query)
    for doc in docs:
        doc["_id"] = str(doc["_id"])
    return docs
