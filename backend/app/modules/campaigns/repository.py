from datetime import datetime

from bson import Binary, ObjectId

from app.db.collections import call_logs_collection, campaigns_collection, contacts_collection, tts_collection, voice_folders_collection


def create(name: str, created_by: str) -> dict:
    doc = {
        "name": name, "status": "draft", "audio_filename": None, "voice_source_folder_id": None,
        "created_at": datetime.utcnow(), "created_by": created_by,
    }
    result = campaigns_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def list_all(owner_query: dict | None = None) -> list[dict]:
    return list(campaigns_collection.find(owner_query or {}, {"audio_data": 0}).sort("created_at", -1))


def find(oid: ObjectId) -> dict | None:
    return campaigns_collection.find_one({"_id": oid})


def find_public(oid: ObjectId) -> dict | None:
    return campaigns_collection.find_one({"_id": oid}, {"audio_data": 0})


def find_audio(oid: ObjectId) -> dict | None:
    return campaigns_collection.find_one({"_id": oid}, {"audio_data": 1, "audio_content_type": 1, "audio_filename": 1})


def update(oid: ObjectId, updates: dict) -> None:
    campaigns_collection.update_one({"_id": oid}, {"$set": updates})


def delete(oid: ObjectId) -> None:
    campaigns_collection.delete_one({"_id": oid})


def set_audio(oid: ObjectId, filename: str, audio_bytes: bytes, content_type: str) -> None:
    update(oid, {"audio_filename": filename, "audio_data": Binary(audio_bytes), "audio_content_type": content_type})


def insert_contact(campaign_oid: ObjectId, phone: str, name: str | None, language: str | None) -> None:
    contacts_collection.insert_one({"campaign_id": campaign_oid, "phone_number": phone, "name": name, "language": language})


def list_contacts(campaign_oid: ObjectId) -> list[dict]:
    return list(contacts_collection.find({"campaign_id": campaign_oid}))


def delete_contacts(campaign_oid: ObjectId) -> int:
    return contacts_collection.delete_many({"campaign_id": campaign_oid}).deleted_count


def count_contacts(campaign_oid: ObjectId) -> int:
    return contacts_collection.count_documents({"campaign_id": campaign_oid})


def insert_call_log(log: dict) -> ObjectId:
    return call_logs_collection.insert_one(log).inserted_id


def update_call_log(call_log_id: ObjectId, updates: dict) -> None:
    call_logs_collection.update_one({"_id": call_log_id}, {"$set": updates})


def update_call_log_by_sarv_id(sarv_unique_id: str, updates: dict) -> None:
    call_logs_collection.update_one({"sarv_unique_id": sarv_unique_id}, {"$set": updates})


def list_call_logs(campaign_oid: ObjectId) -> list[dict]:
    return list(call_logs_collection.find({"campaign_id": campaign_oid}))


def delete_call_logs(campaign_oid: ObjectId) -> int:
    return call_logs_collection.delete_many({"campaign_id": campaign_oid}).deleted_count


def list_all_call_logs() -> list[dict]:
    return list(call_logs_collection.find().sort("started_at", -1))


def call_logs_since(field_not_null: bool = True) -> list[dict]:
    return list(call_logs_collection.find({"started_at": {"$ne": None}}))


def find_voice_folder(oid: ObjectId) -> dict | None:
    return voice_folders_collection.find_one({"_id": oid})


def find_tts_voice(folder_id: str, filename: str) -> dict | None:
    return tts_collection.find_one({"folder_id": folder_id, "filename": filename}, {"_id": 1})
