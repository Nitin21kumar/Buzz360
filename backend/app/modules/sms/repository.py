from bson import ObjectId
from bson.errors import InvalidId

from app.core.exceptions import ValidationError
from app.db.collections import sms_campaigns_collection, sms_contacts_collection, sms_messages_collection


def to_oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise ValidationError("Invalid SMS campaign id")


def find_campaign(oid: ObjectId) -> dict | None:
    return sms_campaigns_collection.find_one({"_id": oid})


def insert_campaign(doc: dict) -> ObjectId:
    return sms_campaigns_collection.insert_one(doc).inserted_id


def update_campaign(oid: ObjectId, updates: dict) -> None:
    sms_campaigns_collection.update_one({"_id": oid}, {"$set": updates})


def list_campaigns(owner_filter: dict) -> list[dict]:
    return list(sms_campaigns_collection.find(owner_filter).sort("created_at", -1))


def delete_campaign(oid: ObjectId) -> None:
    sms_campaigns_collection.delete_one({"_id": oid})


def list_contacts(campaign_oid: ObjectId) -> list[dict]:
    return list(sms_contacts_collection.find({"campaign_id": campaign_oid}))


def count_contacts(campaign_oid: ObjectId) -> int:
    return sms_contacts_collection.count_documents({"campaign_id": campaign_oid})


def insert_contact(doc: dict) -> None:
    sms_contacts_collection.insert_one(doc)


def update_contact(contact_id, updates: dict) -> None:
    sms_contacts_collection.update_one({"_id": contact_id}, {"$set": updates})


def delete_contacts(campaign_oid: ObjectId) -> int:
    return sms_contacts_collection.delete_many({"campaign_id": campaign_oid}).deleted_count


def find_pending_contacts(campaign_oid: ObjectId) -> list[dict]:
    return list(sms_contacts_collection.find({"campaign_id": campaign_oid, "status": "pending"}))


def find_due_retry_contacts(now) -> list[dict]:
    return list(sms_contacts_collection.find({"status": "retry_scheduled", "next_retry_at": {"$lte": now}}))


def mark_retry_in_progress(contact_id) -> None:
    sms_contacts_collection.update_one({"_id": contact_id, "status": "retry_scheduled"}, {"$set": {"status": "retrying"}})


def find_contact(contact_id) -> dict | None:
    return sms_contacts_collection.find_one({"_id": contact_id})


def insert_message(doc: dict) -> None:
    sms_messages_collection.insert_one(doc)
