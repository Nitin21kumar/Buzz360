from datetime import datetime

from bson import Binary, ObjectId

from app.db.collections import tts_collection, voice_folders_collection


def create_folder(name: str) -> dict:
    doc = {"name": name, "created_at": datetime.utcnow()}
    result = voice_folders_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def list_folders() -> list[dict]:
    return list(voice_folders_collection.find().sort("created_at", -1))


def find_folder(folder_oid: ObjectId) -> dict | None:
    return voice_folders_collection.find_one({"_id": folder_oid})


def delete_folder(folder_oid: ObjectId) -> None:
    voice_folders_collection.delete_one({"_id": folder_oid})


def count_voices_in_folder(folder_id: str) -> int:
    return tts_collection.count_documents({"folder_id": folder_id})


def delete_voices_in_folder(folder_id: str) -> None:
    tts_collection.delete_many({"folder_id": folder_id})


def upsert_voice(folder_id: str, language_code: str, record: dict) -> None:
    tts_collection.update_one(
        {"folder_id": folder_id, "language_code": language_code},
        {"$set": record, "$setOnInsert": {"created_at": datetime.utcnow()}},
        upsert=True,
    )


def find_voice(folder_id: str, filename: str) -> dict | None:
    return tts_collection.find_one({"folder_id": folder_id, "filename": filename})


def list_voices(query: dict) -> list[dict]:
    return list(tts_collection.find(query, {"audio_data": 0}).sort("updated_at", -1))


def delete_voice(folder_id: str, language_code: str) -> int:
    result = tts_collection.delete_one({"folder_id": folder_id, "language_code": language_code})
    return result.deleted_count


def save_voice_binary(folder_id: str, language_code: str, audio_bytes: bytes, **fields) -> None:
    record = {"folder_id": folder_id, "language_code": language_code, "audio_data": Binary(audio_bytes), **fields}
    upsert_voice(folder_id, language_code, record)
