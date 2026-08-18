import io
import os
import re
import threading
import time
from datetime import datetime, timedelta

import pandas as pd
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import valuefirst_sms_client
from ..auth import assert_owns_or_admin, owner_filter, require_permission
from ..database import sms_campaigns_collection, sms_contacts_collection, sms_messages_collection

router = APIRouter(prefix="/api/sms", tags=["sms"])

class SMSSend(BaseModel):
    recipients: list[str] = Field(min_length=1)
    message: str = Field(min_length=1, max_length=2000)
    template_id: str = Field(min_length=1, max_length=30)
    sender_id: str | None = Field(default=None, max_length=20)

class SMSCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    template_id: str = Field(min_length=1, max_length=30)
    message: str = Field(min_length=1, max_length=2000)

class SMSRecipients(BaseModel):
    recipients: list[str] = Field(min_length=1)


def oid(value):
    try: return ObjectId(value)
    except InvalidId: raise HTTPException(400, "Invalid SMS campaign id")

def campaign_for_user(campaign_id, user):
    campaign = sms_campaigns_collection.find_one({"_id": oid(campaign_id)})
    if not campaign: raise HTTPException(404, "SMS campaign not found")
    assert_owns_or_admin(user, campaign)
    return campaign

def serialize(campaign):
    cid = campaign["_id"]
    contacts = list(sms_contacts_collection.find({"campaign_id": cid}))
    return {"id": str(cid), "name": campaign["name"], "template_id": campaign["template_id"], "message": campaign["message"], "sender_id": campaign.get("sender_id", "NCHSMS"), "status": campaign.get("status", "draft"), "total": len(contacts), "submitted": sum(c.get("status") == "submitted" for c in contacts), "failed": sum(c.get("status") == "failed" for c in contacts), "created_at": campaign.get("created_at"), "started_at": campaign.get("started_at"), "completed_at": campaign.get("completed_at")}

@router.get("/readiness")
def readiness(user=Depends(require_permission("sms", "view"))):
    try:
        cfg = valuefirst_sms_client.config()
        return {"configured": True, "provider": "valuefirst", "sender_id": cfg["sender_id"], "templates": valuefirst_sms_client.template_catalog()}
    except valuefirst_sms_client.ValueFirstSMSError as exc:
        return {"configured": False, "provider": "valuefirst", "detail": str(exc)}

@router.post("/send")
def send_sms(payload: SMSSend, user=Depends(require_permission("sms", "send"))):
    try: result = valuefirst_sms_client.send_sms(payload.recipients, payload.message, payload.template_id, payload.sender_id)
    except ValueError as exc: raise HTTPException(422, str(exc))
    except valuefirst_sms_client.ValueFirstSMSError as exc: raise HTTPException(502, str(exc))
    sms_messages_collection.insert_one({"provider": "valuefirst", "request_id": result["request_id"], "template_id": payload.template_id, "recipients": payload.recipients, "recipient_count": result["recipient_count"], "message": payload.message, "status": "submitted", "provider_response": result["response"], "created_by": user["uid"], "created_at": datetime.utcnow()})
    return {"message": "SMS submitted to ValueFirst", "request_id": result["request_id"], "recipient_count": result["recipient_count"]}

@router.post("/campaigns")
def create_campaign(payload: SMSCampaignCreate, user=Depends(require_permission("sms", "create"))):
    if payload.template_id not in valuefirst_sms_client.approved_template_ids(): raise HTTPException(422, "DLT template ID is not configured")
    approved_content = valuefirst_sms_client.approved_template_content(payload.template_id)
    if approved_content is not None and payload.message != approved_content: raise HTTPException(422, "Message content must exactly match the selected DLT-approved template")
    doc = {"name": payload.name.strip(), "template_id": payload.template_id, "message": payload.message.strip(), "sender_id": valuefirst_sms_client.config()["sender_id"], "status": "draft", "created_by": user["uid"], "created_at": datetime.utcnow()}
    doc["_id"] = sms_campaigns_collection.insert_one(doc).inserted_id
    return serialize(doc)

@router.get("/campaigns")
def list_campaigns(user=Depends(require_permission("sms", "view"))):
    return [serialize(c) for c in sms_campaigns_collection.find(owner_filter(user)).sort("created_at", -1)]

@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: str, user=Depends(require_permission("sms", "view"))):
    campaign = campaign_for_user(campaign_id, user)
    data = serialize(campaign)
    data["contacts"] = [{"id": str(c["_id"]), "phone_number": c["phone_number"], "status": c.get("status", "pending"), "error": c.get("error"), "request_id": c.get("request_id")} for c in sms_contacts_collection.find({"campaign_id": campaign["_id"]})]
    return data

@router.post("/campaigns/{campaign_id}/recipients")
def add_recipients(campaign_id: str, payload: SMSRecipients, user=Depends(require_permission("sms", "edit"))):
    campaign = campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft": raise HTTPException(400, "Recipients can only be changed while the campaign is a draft")
    existing = {c["phone_number"] for c in sms_contacts_collection.find({"campaign_id": campaign["_id"]})}
    added = 0
    for raw in payload.recipients:
        try: phone = valuefirst_sms_client.normalize_mobile(raw)
        except ValueError: continue
        if phone in existing: continue
        sms_contacts_collection.insert_one({"campaign_id": campaign["_id"], "phone_number": phone, "status": "pending"}); existing.add(phone); added += 1
    return {"message": f"{added} recipient(s) added", "total": len(existing)}

@router.post("/campaigns/{campaign_id}/upload")
async def upload_recipients(campaign_id: str, file: UploadFile = File(...), user=Depends(require_permission("sms", "edit"))):
    campaign = campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft": raise HTTPException(400, "Recipients can only be changed while the campaign is a draft")
    content = await file.read()
    try: df = pd.read_excel(io.BytesIO(content)) if file.filename.lower().endswith((".xlsx", ".xls")) else pd.read_csv(io.BytesIO(content))
    except Exception as exc: raise HTTPException(400, f"Could not read contact file: {exc}")
    col = next((c for c in df.columns if str(c).strip().lower() in {"phone", "phone no", "phone number", "phone_number", "mobile", "mobile no", "mobile number", "number", "contact"}), None)
    if col is None: raise HTTPException(400, "Contact file needs a phone number column (for example: phone no, phone_number, mobile, number, or contact)")
    return add_recipients(campaign_id, SMSRecipients(recipients=[str(v) for v in df[col].tolist()]), user)

@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str, user=Depends(require_permission("sms", "delete"))):
    campaign = campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft": raise HTTPException(400, "Only draft campaigns can be deleted")
    sms_contacts_collection.delete_many({"campaign_id": campaign["_id"]}); sms_campaigns_collection.delete_one({"_id": campaign["_id"]})
    return {"message": "SMS campaign deleted"}

@router.post("/campaigns/{campaign_id}/start")
def start_campaign(campaign_id: str, background_tasks: BackgroundTasks, user=Depends(require_permission("sms", "trigger"))):
    campaign = campaign_for_user(campaign_id, user)
    if campaign.get("status") != "draft": raise HTTPException(400, "This campaign has already been started")
    total = sms_contacts_collection.count_documents({"campaign_id": campaign["_id"]})
    if not total: raise HTTPException(400, "Add at least one recipient before starting")
    valuefirst_sms_client.config()
    sms_campaigns_collection.update_one({"_id": campaign["_id"]}, {"$set": {"status": "running", "started_at": datetime.utcnow()}})
    background_tasks.add_task(run_campaign, str(campaign["_id"]))
    return {"message": f"Campaign started for {total} recipient(s)"}

DUPLICATE_RETRY_SECONDS = int(os.getenv("VALUE_FIRST_SMS_DUPLICATE_RETRY_SECONDS", "3600"))
DUPLICATE_MAX_RETRIES = int(os.getenv("VALUE_FIRST_SMS_DUPLICATE_MAX_RETRIES", "3"))
_retry_worker_started = False


def _refresh_campaign_status(cid):
    queued = sms_contacts_collection.count_documents({"campaign_id": cid, "status": {"$in": ["retry_scheduled", "retrying"]}})
    failed = sms_contacts_collection.count_documents({"campaign_id": cid, "status": "failed"})
    status = "retrying_duplicates" if queued else ("completed_with_errors" if failed else "completed")
    sms_campaigns_collection.update_one({"_id": cid}, {"$set": {"status": status, "completed_at": None if queued else datetime.utcnow()}})


def _record_send_success(cid, campaign, contact, result):
    sms_contacts_collection.update_one({"_id": contact["_id"]}, {"$set": {"status": "submitted", "request_id": result["request_id"], "error": None, "next_retry_at": None}})
    sms_messages_collection.insert_one({"campaign_id": cid, "provider": "valuefirst", "request_id": result["request_id"], "template_id": campaign["template_id"], "recipient_count": 1, "message": campaign["message"], "status": "submitted", "provider_response": result["response"], "created_by": campaign["created_by"], "created_at": datetime.utcnow()})


def _record_send_error(contact, exc):
    message = str(exc)[:300]
    retries = int(contact.get("retry_count", 0)) + 1
    if "duplicate message" in message.lower() and retries <= DUPLICATE_MAX_RETRIES:
        next_retry = datetime.utcnow() + timedelta(seconds=DUPLICATE_RETRY_SECONDS)
        sms_contacts_collection.update_one({"_id": contact["_id"]}, {"$set": {"status": "retry_scheduled", "error": f"Duplicate protected; automatic retry {retries}/{DUPLICATE_MAX_RETRIES} scheduled", "retry_count": retries, "next_retry_at": next_retry}})
    else:
        sms_contacts_collection.update_one({"_id": contact["_id"]}, {"$set": {"status": "failed", "error": message, "retry_count": retries, "next_retry_at": None}})


def _send_contact(cid, campaign, contact):
    try:
        result = valuefirst_sms_client.send_sms([contact["phone_number"]], campaign["message"], campaign["template_id"], campaign.get("sender_id"))
        _record_send_success(cid, campaign, contact, result)
    except Exception as exc:
        _record_send_error(contact, exc)


def run_campaign(campaign_id: str):
    cid = ObjectId(campaign_id); campaign = sms_campaigns_collection.find_one({"_id": cid}); contacts = list(sms_contacts_collection.find({"campaign_id": cid, "status": "pending"}))
    for contact in contacts:
        _send_contact(cid, campaign, contact)
    _refresh_campaign_status(cid)


def _duplicate_retry_loop():
    while True:
        now = datetime.utcnow()
        contacts = list(sms_contacts_collection.find({"status": "retry_scheduled", "next_retry_at": {"$lte": now}}))
        for contact in contacts:
            cid = contact["campaign_id"]; campaign = sms_campaigns_collection.find_one({"_id": cid})
            if not campaign:
                continue
            sms_contacts_collection.update_one({"_id": contact["_id"], "status": "retry_scheduled"}, {"$set": {"status": "retrying"}})
            contact = sms_contacts_collection.find_one({"_id": contact["_id"]})
            _send_contact(cid, campaign, contact)
            _refresh_campaign_status(cid)
        time.sleep(30)


def start_duplicate_retry_worker():
    global _retry_worker_started
    if _retry_worker_started:
        return
    _retry_worker_started = True
    threading.Thread(target=_duplicate_retry_loop, name="sms-duplicate-retry", daemon=True).start()
