import io
import wave
from datetime import datetime

import httpx

from app.core.config import settings
from app.core.exceptions import NotFoundError, UpstreamServiceError, ValidationError
from app.modules.tts import repository
from app.shared.constants import LANGUAGE_DISPLAY, LANGUAGE_NAMES, resolve_speaker
from app.shared import groq_client

SARVAM_TTS_STREAM_URL = "https://api.sarvam.ai/text-to-speech/stream"


def create_folder(name: str) -> dict:
    return repository.create_folder(name.strip())


def list_folders() -> list[dict]:
    folders = []
    for d in repository.list_folders():
        folder_id = str(d["_id"])
        folders.append({
            "id": folder_id,
            "name": d["name"],
            "created_at": d.get("created_at"),
            "voice_count": repository.count_voices_in_folder(folder_id),
        })
    return folders


def delete_folder(folder_oid) -> str:
    folder = repository.find_folder(folder_oid)
    if not folder:
        raise NotFoundError("Folder not found")
    repository.delete_voices_in_folder(str(folder_oid))
    repository.delete_folder(folder_oid)
    return folder["name"]


def _split_text(text: str, limit: int = 1800) -> list[str]:
    chunks: list[str] = []
    remaining = text.strip()
    markers = ["\n", "।", ". ", "? ", "! ", "; ", ", ", " "]
    while len(remaining) > limit:
        window = remaining[: limit + 1]
        boundary = max((window.rfind(m) for m in markers), default=-1)
        end = boundary + 1 if boundary > limit * 0.55 else limit
        chunks.append(remaining[:end].strip())
        remaining = remaining[end:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


async def _translate_text(text: str, source_code: str, target_code: str, gender: str = "female") -> str:
    source_name = LANGUAGE_NAMES.get(source_code, source_code)
    target_name = LANGUAGE_NAMES.get(target_code, target_code)
    return await groq_client.translate_text(
        text, source_name, target_name, gender,
        strict_native_script=True,
        source_is_hinglish=(source_code == "hinglish"),
    )


def _stitch_wav_chunks(wav_byte_chunks: list[bytes]) -> bytes:
    frames = []
    channels = sampwidth = framerate = None
    for chunk_bytes in wav_byte_chunks:
        with wave.open(io.BytesIO(chunk_bytes), "rb") as wf:
            if channels is None:
                channels, sampwidth, framerate = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
            frames.append(wf.readframes(wf.getnframes()))

    out = io.BytesIO()
    with wave.open(out, "wb") as wf_out:
        wf_out.setnchannels(channels)
        wf_out.setsampwidth(sampwidth)
        wf_out.setframerate(framerate)
        for f in frames:
            wf_out.writeframes(f)
    return out.getvalue()


async def _generate_audio_bytes(text: str, language_code: str, speaker: str, pace: float, temperature: float) -> bytes:
    if not settings.sarvam_api_key:
        raise UpstreamServiceError("SARVAM_API_KEY is not configured on the backend")

    wav_chunks: list[bytes] = []
    async with httpx.AsyncClient(timeout=90) as client:
        for chunk in _split_text(text):
            response = await client.post(
                SARVAM_TTS_STREAM_URL,
                headers={"api-subscription-key": settings.sarvam_api_key, "Content-Type": "application/json"},
                json={
                    "text": chunk,
                    "target_language_code": language_code,
                    "speaker": speaker,
                    "model": "bulbul:v3",
                    "pace": pace,
                    "temperature": temperature,
                    "speech_sample_rate": 8000,
                    "output_audio_codec": "wav",
                    "enable_preprocessing": True,
                },
            )
            if response.is_error:
                try:
                    detail = response.json().get("error", {}).get("message") or response.text
                except ValueError:
                    detail = response.text
                raise UpstreamServiceError(detail or "Sarvam speech generation failed")
            wav_chunks.append(response.content)
    return _stitch_wav_chunks(wav_chunks)


async def generate_speech(folder_oid, folder_id: str, payload) -> dict:
    folder = repository.find_folder(folder_oid)
    if not folder:
        raise NotFoundError("Voice folder not found")
    if not payload.text.strip():
        raise ValidationError("Text is required")

    results = []
    for code in payload.languages:
        language_name = LANGUAGE_DISPLAY.get(code)
        if not language_name:
            results.append({"code": code, "language": code, "status": "failed", "error": "Unsupported language code"})
            continue

        filename = f"{language_name.lower()}.wav"
        try:
            if code == payload.source_language_code:
                text_for_this_language = payload.text.strip()
            else:
                text_for_this_language = await _translate_text(payload.text.strip(), payload.source_language_code, code, payload.gender)

            speaker_for_this_language = payload.speaker or resolve_speaker(code, payload.gender)
            audio_bytes = await _generate_audio_bytes(text_for_this_language, code, speaker_for_this_language, payload.pace, payload.temperature)

            record = {
                "language_name": language_name,
                "filename": filename,
                "text": text_for_this_language,
                "source_text": payload.text.strip(),
                "speaker": speaker_for_this_language,
                "gender": payload.gender,
                "updated_at": datetime.utcnow(),
            }
            repository.save_voice_binary(folder_id, code, audio_bytes, **record)
            results.append({
                "code": code, "language": language_name, "filename": filename,
                "speaker": speaker_for_this_language,
                "status": "success", "download_url": f"/api/tts/download/{folder_id}/{filename}",
            })
        except (UpstreamServiceError, ValidationError) as exc:
            results.append({"code": code, "language": language_name, "status": "failed", "error": exc.message})
        except Exception as exc:
            results.append({"code": code, "language": language_name, "status": "failed", "error": str(exc)})

    return {"results": results}


def list_history(folder_id: str | None) -> list[dict]:
    query = {"folder_id": folder_id} if folder_id else {"folder_id": {"$exists": True, "$ne": None}}
    docs = repository.list_voices(query)
    results = []
    for doc in docs:
        if not doc.get("folder_id"):
            continue
        doc["_id"] = str(doc["_id"])
        doc["download_url"] = f"/api/tts/download/{doc['folder_id']}/{doc['filename']}"
        results.append(doc)
    return results


def get_download(folder_id: str, filename: str) -> bytes:
    doc = repository.find_voice(folder_id, filename)
    if not doc or not doc.get("audio_data"):
        raise NotFoundError("Audio not found")
    return bytes(doc["audio_data"])


def delete_voice(folder_id: str, language_code: str) -> None:
    deleted = repository.delete_voice(folder_id, language_code)
    if deleted == 0:
        raise NotFoundError("Voice not found")
