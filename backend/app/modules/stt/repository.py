from datetime import datetime

from app.db.collections import stt_collection


def save_transcript(filename: str, transcript: str, raw_transcript: str, language_code: str, spoken_language_code: str, created_by: str) -> None:
    stt_collection.insert_one({
        "filename": filename,
        "transcript": transcript,
        "raw_transcript": raw_transcript,
        "language_code": language_code,
        "spoken_language_code": spoken_language_code,
        "created_at": datetime.utcnow(),
        "created_by": created_by,
    })


def list_history(owner_query: dict, limit: int = 50) -> list[dict]:
    return list(stt_collection.find(owner_query).sort("created_at", -1).limit(limit))
