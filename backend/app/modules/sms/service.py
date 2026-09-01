import io
import logging
import threading
import time
from datetime import datetime, timedelta

import pandas as pd
from bson import ObjectId

from app.auth.dependencies import assert_owns_or_admin, owner_filter
from app.core.config import settings
from app.core.exceptions import NotFoundError, UpstreamServiceError, ValidationError
from app.modules.sms import repository, valuefirst_gateway

logger = logging.getLogger("sms")

PHONE_COLUMN_CANDIDATES = {
    "phone", "phone no", "phone number", "phone_number", "mobile",
    "mobile no", "mobile number", "number", "contact",
}


def serialize(campaign: dict) -> dict:
    cid = campaign["_id"]
    contacts = repository.list_contacts(cid)
    return {
        "id": str(cid),
        "name": campaign["name"],
        "template_id": campaign["template_id"],
        "message": campaign["message"],
        "sender_id": campaign.get("sender_id", "NCHSMS"),
        "status": campaign.get("status", "draft"),
        "total": len(contacts),
        "submitted": sum(c.get("status") == "submitted" for c in contacts),
        "failed": sum(c.get("status") == "failed" for c in contacts),
        "created_at": campaign.get("created_at"),
        "started_at": campaign.get("started_at"),
        "completed_at": campaign.get("completed_at"),
    }


def readiness() -> dict:
    try:
        cfg = valuefirst_gateway.config()
        return {
            "configured": True,
            "provider": "valuefirst",
            "sender_id": cfg["sender_id"],
            "templates": valuefirst_gateway.template_catalog(),
        }
    except UpstreamServiceError as exc:
        return {"configured": False, "provider": "valuefirst", "detail": str(exc)}


def send_single(user: dict, recipients: list[str], message: str, template_id: str, sender_id: str | None) -> dict:
    result = valuefirst_gateway.send_sms(recipients, message, template_id, sender_id)
    repository.insert_message({
        "provider": "valuefirst",
        "request_id": result["request_id"],
        "template_id": template_id,
        "recipients": recipients,
        "recipient_count": result["recipient_count"],
        "message": message,
        "status": "submitted",
        "provider_response": result["response"],
        "created_by": user["uid"],
        "created_at": datetime.utcnow(),
    })
    return {"request_id": result["request_id"], "recipient_count": result["recipient_count"]}


def create_campaign(user: dict, name: str, template_id: str, message: str) -> dict:
    if template_id not in valuefirst_gateway.approved_template_ids():
        raise ValidationError("DLT template ID is not configured")
    approved_content = valuefirst_gateway.approved_template_content(template_id)
    if approved_content is not None and message != approved_content:
        raise ValidationError("Message content must exactly match the selected DLT-approved template")

    doc = {
        "name": name.strip(),
        "template_id": template_id,
        "message": message.strip(),
        "sender_id": valuefirst_gateway.config()["sender_id"],
        "status": "draft",
        "created_by": user["uid"],
        "created_at": datetime.utcnow(),
    }
    doc["_id"] = repository.insert_campaign(doc)
    return serialize(doc)


def list_campaigns(user: dict) -> list[dict]:
    return [serialize(c) for c in repository.list_campaigns(owner_filter(user))]


def get_campaign_for_user(campaign_id: str, user: dict) -> dict:
    campaign = repository.find_campaign(repository.to_oid(campaign_id))
    if not campaign:
        raise NotFoundError("SMS campaign not found")
    assert_owns_or_admin(user, campaign)
    return campaign


def get_campaign_detail(campaign_id: str, user: dict) -> dict:
    campaign = get_campaign_for_user(campaign_id, user)
    data = serialize(campaign)
    data["contacts"] = [
        {
            "id": str(c["_id"]), "phone_number": c["phone_number"], "status": c.get("status", "pending"),
            "error": c.get("error"), "request_id": c.get("request_id"),
        }
        for c in repository.list_contacts(campaign["_id"])
    ]
    return data


def add_recipients(campaign_id: str, user: dict, recipients: list[str]) -> dict:
    campaign = get_campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft":
        raise ValidationError("Recipients can only be changed while the campaign is a draft")

    existing = {c["phone_number"] for c in repository.list_contacts(campaign["_id"])}
    added = 0
    for raw in recipients:
        try:
            phone = valuefirst_gateway.normalize_mobile(raw)
        except ValueError:
            continue
        if phone in existing:
            continue
        repository.insert_contact({"campaign_id": campaign["_id"], "phone_number": phone, "status": "pending"})
        existing.add(phone)
        added += 1
    return {"message": f"{added} recipient(s) added", "total": len(existing)}


def upload_recipients(campaign_id: str, user: dict, filename: str, content: bytes) -> dict:
    try:
        if filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise ValidationError(f"Could not read contact file: {exc}")

    col = next((c for c in df.columns if str(c).strip().lower() in PHONE_COLUMN_CANDIDATES), None)
    if col is None:
        raise ValidationError(
            "Contact file needs a phone number column (for example: phone no, phone_number, mobile, number, or contact)"
        )
    return add_recipients(campaign_id, user, [str(v) for v in df[col].tolist()])


def delete_campaign(campaign_id: str, user: dict) -> None:
    campaign = get_campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft":
        raise ValidationError("Only draft campaigns can be deleted")
    repository.delete_contacts(campaign["_id"])
    repository.delete_campaign(campaign["_id"])


def start_campaign(campaign_id: str, user: dict, run_in_background) -> int:
    campaign = get_campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft":
        raise ValidationError("This campaign has already been started")
    total = repository.count_contacts(campaign["_id"])
    if not total:
        raise ValidationError("Add at least one recipient before starting")
    valuefirst_gateway.config()
    repository.update_campaign(campaign["_id"], {"status": "running", "started_at": datetime.utcnow()})
    run_in_background(run_campaign, str(campaign["_id"]))
    return total


def _refresh_campaign_status(cid: ObjectId) -> None:
    contacts = repository.list_contacts(cid)
    queued = sum(1 for c in contacts if c.get("status") in ("retry_scheduled", "retrying"))
    failed = sum(1 for c in contacts if c.get("status") == "failed")
    status = "retrying_duplicates" if queued else ("completed_with_errors" if failed else "completed")
    repository.update_campaign(cid, {"status": status, "completed_at": None if queued else datetime.utcnow()})


def _record_send_success(cid: ObjectId, campaign: dict, contact: dict, result: dict) -> None:
    repository.update_contact(contact["_id"], {"status": "submitted", "request_id": result["request_id"], "error": None, "next_retry_at": None})
    repository.insert_message({
        "campaign_id": cid, "provider": "valuefirst", "request_id": result["request_id"],
        "template_id": campaign["template_id"], "recipient_count": 1, "message": campaign["message"],
        "status": "submitted", "provider_response": result["response"],
        "created_by": campaign["created_by"], "created_at": datetime.utcnow(),
    })


def _record_send_error(contact: dict, exc: Exception) -> None:
    message = str(exc)[:300]
    retries = int(contact.get("retry_count", 0)) + 1
    max_retries = settings.value_first_sms_duplicate_max_retries
    if "duplicate message" in message.lower() and retries <= max_retries:
        next_retry = datetime.utcnow() + timedelta(seconds=settings.value_first_sms_duplicate_retry_seconds)
        repository.update_contact(contact["_id"], {
            "status": "retry_scheduled",
            "error": f"Duplicate protected; automatic retry {retries}/{max_retries} scheduled",
            "retry_count": retries, "next_retry_at": next_retry,
        })
    else:
        repository.update_contact(contact["_id"], {"status": "failed", "error": message, "retry_count": retries, "next_retry_at": None})


def _send_contact(cid: ObjectId, campaign: dict, contact: dict) -> None:
    try:
        result = valuefirst_gateway.send_sms([contact["phone_number"]], campaign["message"], campaign["template_id"], campaign.get("sender_id"))
        _record_send_success(cid, campaign, contact, result)
    except Exception as exc:
        _record_send_error(contact, exc)


def run_campaign(campaign_id: str) -> None:
    cid = ObjectId(campaign_id)
    campaign = repository.find_campaign(cid)
    if not campaign:
        return
    for contact in repository.find_pending_contacts(cid):
        _send_contact(cid, campaign, contact)
    _refresh_campaign_status(cid)


_retry_worker_started = False
_retry_worker_lock = threading.Lock()


def _duplicate_retry_loop() -> None:
    while True:
        try:
            now = datetime.utcnow()
            for contact in repository.find_due_retry_contacts(now):
                cid = contact["campaign_id"]
                campaign = repository.find_campaign(cid)
                if not campaign:
                    continue
                repository.mark_retry_in_progress(contact["_id"])
                refreshed = repository.find_contact(contact["_id"])
                if not refreshed:
                    continue
                _send_contact(cid, campaign, refreshed)
                _refresh_campaign_status(cid)
        except Exception:
            logger.exception("SMS duplicate-retry loop iteration failed")
        time.sleep(30)


def start_duplicate_retry_worker() -> None:
    global _retry_worker_started
    with _retry_worker_lock:
        if _retry_worker_started:
            return
        _retry_worker_started = True
    threading.Thread(target=_duplicate_retry_loop, name="sms-duplicate-retry", daemon=True).start()
