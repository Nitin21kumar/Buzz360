import io
import logging
import re
import time
from collections import OrderedDict
from datetime import datetime, timedelta
from urllib.parse import quote

import pandas as pd
from bson import ObjectId

from app.auth.dependencies import assert_owns_or_admin, owner_filter
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.campaigns import repository, sarv_gateway
from app.shared.constants import LANGUAGE_DISPLAY
from app.shared.signing import build_signed_query

logger = logging.getLogger("sarv_webhook")

_LANGUAGE_LOOKUP = {}
for _code, _name in LANGUAGE_DISPLAY.items():
    _LANGUAGE_LOOKUP[_code.lower()] = _name
    _LANGUAGE_LOOKUP[_name.lower()] = _name

TERMINAL_FAILURE_STATUSES = ("failed", "busy", "no-answer", "canceled", "skipped")


def _resolve_language_audio(language_value: str | None, voice_folder_id: str | None):
    if not language_value or not str(language_value).strip():
        return None, "No language specified for this contact"
    if not voice_folder_id:
        return None, "No voice folder has been selected for this campaign"

    key = str(language_value).strip().lower()
    matched_name = _LANGUAGE_LOOKUP.get(key)
    if not matched_name:
        return None, f"File name mismatch with details — '{language_value}' is not a recognized language"

    filename = f"{matched_name.lower()}.wav"
    doc = repository.find_tts_voice(voice_folder_id, filename)
    if not doc:
        return None, f"File name mismatch with details — no saved recording found for '{matched_name}' in the selected voice folder ({filename})"

    return {"type": "tts", "folder_id": voice_folder_id, "filename": filename}, None


def serialize_campaign(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "status": doc.get("status", "draft"),
        "audio_filename": doc.get("audio_filename"),
        "has_default_audio": bool(doc.get("audio_data")),
        "voice_source_folder_id": doc.get("voice_source_folder_id"),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by"),
    }


def create_campaign(user: dict, name: str) -> dict:
    doc = repository.create(name, user["uid"])
    return serialize_campaign(doc)


def list_campaigns(user: dict) -> list[dict]:
    return [serialize_campaign(d) for d in repository.list_all(owner_filter(user))]


def _get_owned_campaign(user: dict, campaign_oid: ObjectId) -> dict:
    campaign = repository.find(campaign_oid)
    if not campaign:
        raise NotFoundError("Campaign not found")
    assert_owns_or_admin(user, campaign)
    return campaign


def _require_draft(campaign: dict) -> None:
    if campaign.get("status", "draft") != "draft":
        raise ValidationError("This campaign has already been launched — it can only be set up and started once.")


def set_voice_source(user: dict, campaign_oid: ObjectId, folder_id: str) -> str:
    campaign = _get_owned_campaign(user, campaign_oid)
    _require_draft(campaign)
    try:
        folder_oid = ObjectId(folder_id)
    except Exception:
        raise ValidationError("Invalid voice folder id")
    folder = repository.find_voice_folder(folder_oid)
    if not folder:
        raise NotFoundError("Selected voice folder not found")

    repository.update(campaign_oid, {"voice_source_folder_id": folder_id})
    return folder["name"]


def get_campaign_audio(campaign_oid: ObjectId) -> tuple[bytes, str, str]:
    campaign = repository.find_audio(campaign_oid)
    if not campaign or not campaign.get("audio_data"):
        raise NotFoundError("No default audio uploaded for this campaign")
    filename = campaign.get("audio_filename", "campaign_audio")
    media_type = campaign.get("audio_content_type", "audio/mpeg")
    return bytes(campaign["audio_data"]), media_type, filename


def upload_audio(user: dict, campaign_oid: ObjectId, filename: str, audio_bytes: bytes, content_type: str) -> None:
    campaign = _get_owned_campaign(user, campaign_oid)
    _require_draft(campaign)
    if not audio_bytes:
        raise ValidationError("Uploaded file is empty")
    repository.set_audio(campaign_oid, filename, audio_bytes, content_type or "audio/mpeg")


def upload_contacts(user: dict, campaign_oid: ObjectId, filename: str, content: bytes) -> str:
    campaign = _get_owned_campaign(user, campaign_oid)
    _require_draft(campaign)

    if filename.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        df = pd.read_csv(io.BytesIO(content))

    col_candidates = ["phone_number", "phone", "mobile", "number", "contact"]
    phone_col = next((c for c in df.columns if str(c).strip().lower() in col_candidates), None)
    if not phone_col:
        raise ValidationError(f"Phone number column not found. Columns found: {list(df.columns)}")
    name_col = next((c for c in df.columns if str(c).strip().lower() == "name"), None)
    language_col = next((c for c in df.columns if str(c).strip().lower() in ("language", "lang")), None)

    count = 0
    for _, row in df.iterrows():
        raw = str(row[phone_col]).strip()
        if not raw or raw.lower() == "nan":
            continue
        digits = re.sub(r"\D", "", raw)
        if digits.startswith("91") and len(digits) == 12:
            phone = "+" + digits
        elif len(digits) == 10:
            phone = "+91" + digits
        else:
            phone = "+" + digits

        language_value = None
        if language_col is not None:
            raw_language = str(row[language_col]).strip()
            if raw_language and raw_language.lower() != "nan":
                language_value = raw_language

        repository.insert_contact(campaign_oid, phone, str(row[name_col]) if name_col else None, language_value)
        count += 1

    message = f"{count} contacts uploaded"
    if language_col is None:
        message += " (no 'language' column found — every contact will use the campaign's default audio)"
    return message


def delete_contacts(user: dict, campaign_oid: ObjectId) -> int:
    campaign = _get_owned_campaign(user, campaign_oid)
    _require_draft(campaign)
    return repository.delete_contacts(campaign_oid)


def start_campaign(user: dict, campaign_id: str, campaign_oid: ObjectId, run_in_background) -> int:
    campaign = _get_owned_campaign(user, campaign_oid)

    contacts = repository.list_contacts(campaign_oid)
    if not contacts:
        raise ValidationError("Upload contacts first")
    _require_draft(campaign)

    has_default_audio = bool(campaign.get("audio_filename"))
    has_voice_folder = bool(campaign.get("voice_source_folder_id"))
    contacts_without_language = sum(1 for c in contacts if not c.get("language"))
    contacts_with_language = len(contacts) - contacts_without_language

    if not has_default_audio and contacts_without_language > 0:
        raise ValidationError(
            f"{contacts_without_language} contact(s) have no language specified and there is no default "
            "campaign audio to fall back on. Either add a 'language' column value for every contact, "
            "or upload a default campaign audio file."
        )
    if not has_voice_folder and contacts_with_language > 0:
        raise ValidationError(
            f"{contacts_with_language} contact(s) have a language specified, but no voice folder has been "
            "selected for this campaign yet. Pick a voice folder in Step 1 first."
        )

    repository.update(campaign_oid, {"status": "running"})
    run_in_background(run_calls, campaign_id)
    return len(contacts)


def _signed_audio_url(base_url: str, resource_key: str) -> str:
    """Appends a short-lived HMAC signature to an outbound audio_url before
    it's handed to Sarv's servers. See app/shared/signing.py for why."""
    return f"{base_url}?{build_signed_query(resource_key)}"


def run_calls(campaign_id: str) -> None:
    oid = ObjectId(campaign_id)
    campaign = repository.find(oid)
    contacts = repository.list_contacts(oid)

    public_base_url = settings.public_base_url
    has_default_audio = bool(campaign.get("audio_data"))
    voice_folder_id = campaign.get("voice_source_folder_id")
    if public_base_url and settings.sarv_webhook_secret:
        callback_url = f"{public_base_url}/api/campaigns/webhooks/sarv-status?key={quote(settings.sarv_webhook_secret)}"
    else:
        callback_url = ""

    cfg_includes_country_code = settings.sarv_includes_country_code.upper()

    groups: dict[str, dict] = {}

    for contact in contacts:
        language_value = contact.get("language")
        audio_ref, resolve_error = _resolve_language_audio(language_value, voice_folder_id)

        if not audio_ref and has_default_audio and not language_value:
            audio_ref, resolve_error = {"type": "campaign", "campaign_id": campaign_id}, None

        call_log = {
            "campaign_id": oid,
            "contact_id": contact["_id"],
            "phone_number": contact["phone_number"],
            "language": language_value,
            "status": "queued",
            "call_duration": 0,
            "started_at": datetime.utcnow(),
            "ended_at": None,
            "sarv_unique_id": None,
            "error_message": None,
        }
        call_log_id = repository.insert_call_log(call_log)

        if not audio_ref:
            repository.update_call_log(call_log_id, {"status": "skipped", "error_message": resolve_error, "ended_at": datetime.utcnow()})
            continue

        if audio_ref["type"] == "tts":
            key = f"tts:{audio_ref['folder_id']}:{audio_ref['filename']}"
            base_url = f"{public_base_url}/api/tts/download/{quote(audio_ref['folder_id'])}/{quote(audio_ref['filename'])}"
            audio_url = _signed_audio_url(base_url, f"tts:{audio_ref['folder_id']}:{audio_ref['filename']}")
        else:
            key = f"campaign:{audio_ref['campaign_id']}"
            base_url = f"{public_base_url}/api/campaigns/{audio_ref['campaign_id']}/audio"
            audio_url = _signed_audio_url(base_url, f"campaign:{audio_ref['campaign_id']}")

        mobile = sarv_gateway.normalize_mobile(contact["phone_number"], cfg_includes_country_code)
        groups.setdefault(key, {"audio_url": audio_url, "items": []})
        groups[key]["items"].append({"call_log_id": call_log_id, "phone_number": contact["phone_number"], "mobile": mobile})

    for key, group in groups.items():
        items = group["items"]
        for i in range(0, len(items), sarv_gateway.SARV_MAX_CONTACTS_PER_REQUEST):
            batch = items[i:i + sarv_gateway.SARV_MAX_CONTACTS_PER_REQUEST]
            mobiles = [b["mobile"] for b in batch]
            try:
                result = sarv_gateway.trigger_voice_broadcast(group["audio_url"], mobiles, callback_url=callback_url)
                logger.info("Sarv broadcast response for %s: %s", mobiles, result)
                returned = result.get("data", [])
                by_mobile = {}
                for row in returned:
                    norm = sarv_gateway.normalize_mobile(str(row.get("mobileNumber", "")), cfg_includes_country_code)
                    by_mobile[norm] = row

                for b in batch:
                    row = by_mobile.get(b["mobile"])
                    if not row:
                        repository.update_call_log(b["call_log_id"], {"status": "failed", "error_message": "No response row from Sarv for this number"})
                        continue
                    new_status = sarv_gateway.map_sarv_status(row.get("status"))
                    update = {"status": new_status, "sarv_unique_id": row.get("uniqueId")}
                    if new_status == "failed":
                        update["error_message"] = f"Sarv reported status '{row.get('status')}' for this number"
                        update["ended_at"] = datetime.utcnow()
                    repository.update_call_log(b["call_log_id"], update)
            except Exception as exc:
                for b in batch:
                    repository.update_call_log(b["call_log_id"], {"status": "failed", "error_message": str(exc)[:500]})
            time.sleep(1.5)

    repository.update(oid, {"status": "completed"})


def delete_campaign(user: dict, campaign_oid: ObjectId) -> dict:
    campaign = _get_owned_campaign(user, campaign_oid)

    contacts_deleted = repository.delete_contacts(campaign_oid)
    logs_deleted = repository.delete_call_logs(campaign_oid)
    repository.delete(campaign_oid)
    return {"name": campaign["name"], "contacts_deleted": contacts_deleted, "logs_deleted": logs_deleted}


def campaign_status(user: dict, campaign_oid: ObjectId) -> dict:
    campaign = _get_owned_campaign(user, campaign_oid)

    total_contacts = repository.count_contacts(campaign_oid)
    logs = repository.list_call_logs(campaign_oid)
    completed = sum(1 for l in logs if l["status"] == "completed")
    failed_or_declined = sum(1 for l in logs if l["status"] in TERMINAL_FAILURE_STATUSES)
    in_progress = sum(1 for l in logs if l["status"] in ("queued", "initiated", "ringing", "in-progress"))

    return {
        "total_contacts": total_contacts, "total_calls_triggered": len(logs),
        "completed": completed, "failed_or_declined": failed_or_declined,
        "in_progress": in_progress, "campaign_status": campaign.get("status", "draft"),
    }


def build_report_dataframe(user: dict, campaign_oid: ObjectId) -> pd.DataFrame:
    _get_owned_campaign(user, campaign_oid)

    def clean(value):
        if isinstance(value, str):
            return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value)[:500]
        return value

    logs = repository.list_call_logs(campaign_oid)
    status_label = {
        "completed": "Answered / Completed", "busy": "Declined (Busy)", "no-answer": "Not Answered",
        "failed": "Failed", "canceled": "Cancelled", "initiated": "In Progress",
        "ringing": "Ringing", "in-progress": "Ongoing", "queued": "Queued",
        "skipped": "Skipped — Language Mismatch",
    }
    data = [{
        "Phone Number": l["phone_number"],
        "Language": l.get("language") or "",
        "Status": status_label.get(l["status"], l["status"]),
        "Call Duration (sec)": l.get("call_duration") or 0,
        "Started At": l["started_at"].strftime("%Y-%m-%d %H:%M:%S") if l.get("started_at") else "",
        "Ended At": l["ended_at"].strftime("%Y-%m-%d %H:%M:%S") if l.get("ended_at") else "",
        "Error": clean(l.get("error_message")) if l.get("error_message") else "",
    } for l in logs]
    return pd.DataFrame(data)


def obd_overview(user: dict) -> dict:
    campaigns = repository.list_all(owner_filter(user))
    owned_ids = [c["_id"] for c in campaigns]
    all_logs = repository.list_all_call_logs() if user["role"] in ("super_admin", "admin") else [
        l for l in repository.list_all_call_logs() if l["campaign_id"] in owned_ids
    ]

    total_calls = len(all_logs)
    completed = sum(1 for l in all_logs if l["status"] == "completed")
    failed = sum(1 for l in all_logs if l["status"] in TERMINAL_FAILURE_STATUSES)
    running_campaigns = sum(1 for c in campaigns if c.get("status") == "running")

    campaign_names = {c["_id"]: c["name"] for c in campaigns}
    recent_activity = [{
        "campaign_name": campaign_names.get(l["campaign_id"], "Unknown"),
        "phone_number": l["phone_number"],
        "status": l["status"],
        "started_at": l["started_at"].isoformat() if l.get("started_at") else None,
    } for l in all_logs[:8]]

    return {
        "total_calls": total_calls, "completed": completed, "failed": failed,
        "running_campaigns": running_campaigns, "total_campaigns": len(campaigns),
        "success_rate": round((completed / total_calls) * 100, 1) if total_calls else 0,
        "recent_activity": recent_activity,
    }


def obd_daily_stats(user: dict) -> list[dict]:
    owned_ids = {c["_id"] for c in repository.list_all(owner_filter(user))}
    logs = repository.call_logs_since()
    if user["role"] not in ("super_admin", "admin"):
        logs = [l for l in logs if l["campaign_id"] in owned_ids]

    buckets: dict[str, dict[str, int]] = OrderedDict()

    today = datetime.utcnow().date()
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        buckets[day.isoformat()] = {"total": 0, "completed": 0, "failed": 0}

    for l in logs:
        day_key = l["started_at"].date().isoformat()
        if day_key not in buckets:
            continue
        buckets[day_key]["total"] += 1
        if l["status"] == "completed":
            buckets[day_key]["completed"] += 1
        elif l["status"] in TERMINAL_FAILURE_STATUSES:
            buckets[day_key]["failed"] += 1

    return [{"date": day, "total": c["total"], "completed": c["completed"], "failed": c["failed"]} for day, c in buckets.items()]


def obd_campaign_performance(user: dict) -> list[dict]:
    campaigns = repository.list_all(owner_filter(user))
    results = []
    for c in campaigns:
        logs = repository.list_call_logs(c["_id"])
        if not logs:
            continue
        completed = sum(1 for l in logs if l["status"] == "completed")
        results.append({
            "id": str(c["_id"]), "name": c["name"], "status": c.get("status", "draft"),
            "total_calls": len(logs), "success_rate": round((completed / len(logs)) * 100, 1),
        })
    results.sort(key=lambda r: r["success_rate"], reverse=True)
    return results


def handle_sarv_status_webhook(payload: dict) -> dict:
    logger.info("Sarv callback received: %s", payload)

    unique_id = payload.get("uniqueId") or payload.get("unique_id")
    status = payload.get("status")
    duration = payload.get("answer_duration") or payload.get("duration") or payload.get("call_duration")

    if not unique_id:
        return {"ok": False, "reason": "no uniqueId in payload - check server logs for the raw body"}

    new_status = sarv_gateway.map_sarv_status(status) if status else "completed"
    update = {"status": new_status}
    if status and new_status != "completed":
        update["error_message"] = f"Sarv status: {status}"
    if duration:
        try:
            update["call_duration"] = float(duration)
        except (TypeError, ValueError):
            pass
    if new_status in ("completed", "busy", "failed", "no-answer"):
        update["ended_at"] = datetime.utcnow()

    repository.update_call_log_by_sarv_id(unique_id, update)
    return {"ok": True}
