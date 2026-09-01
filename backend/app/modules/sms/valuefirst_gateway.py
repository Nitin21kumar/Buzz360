"""ValueFirst / GoInfinito unified-v2 SMS gateway client."""
import json
import uuid
from pathlib import Path
from urllib.parse import parse_qs

import httpx

from app.core.config import settings
from app.core.exceptions import UpstreamServiceError, ValidationError

_TEMPLATE_CATALOG_PATH = Path(__file__).with_name("sms_template_catalog.json")


def config() -> dict:
    cfg = {
        "api_key": settings.value_first_sms_api_key.strip(),
        "client_id": settings.value_first_client_id.strip(),
        "password": settings.value_first_password.strip(),
        "sender_id": settings.value_first_sms_sender_id.strip(),
    }
    missing = [
        name
        for name, value in (
            ("VALUE_FIRST_CLIENT_ID", cfg["client_id"]),
            ("VALUE_FIRST_PASSWORD", cfg["password"]),
            ("VALUE_FIRST_SMS_SENDER_ID", cfg["sender_id"]),
        )
        if not value
    ]
    if missing:
        raise UpstreamServiceError(f"ValueFirst SMS is not configured (missing: {', '.join(missing)})")
    return cfg


def normalize_mobile(phone_number: str) -> str:
    digits = "".join(c for c in str(phone_number) if c.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    if not 10 <= len(digits) <= 15:
        raise ValueError(f"Invalid mobile number: {phone_number}")
    return digits


def approved_template_ids() -> set[str]:
    return {v.strip() for v in settings.value_first_sms_template_ids.split(",") if v.strip()}


def template_catalog() -> list[dict]:
    if not _TEMPLATE_CATALOG_PATH.exists():
        return [{"template_id": tid, "label": "Approved DLT template", "content": ""} for tid in sorted(approved_template_ids())]
    data = json.loads(_TEMPLATE_CATALOG_PATH.read_text(encoding="utf-8"))
    return [data[tid] for tid in sorted(approved_template_ids()) if tid in data]


def approved_template_content(template_id: str) -> str | None:
    item = next((item for item in template_catalog() if item["template_id"] == str(template_id)), None)
    return item.get("content") if item else None


def send_sms(mobile_numbers: list[str], message: str, template_id: str, sender_id: str | None = None) -> dict:
    cfg = config()
    text = str(message).strip()
    if not text:
        raise ValidationError("SMS message cannot be empty")
    template_id = str(template_id).strip()
    if not template_id:
        raise ValidationError("DLT template ID is required")

    allowed = approved_template_ids()
    if allowed and template_id not in allowed:
        raise ValidationError("DLT template ID is not configured for this account")
    approved_content = approved_template_content(template_id)
    if approved_content is not None and text != approved_content:
        raise ValidationError("Message content must exactly match the selected DLT-approved template")

    max_addresses = settings.value_first_sms_max_addresses_per_request
    if not mobile_numbers or len(mobile_numbers) > max_addresses:
        raise ValidationError(f"ValueFirst accepts 1 to {max_addresses} SMS recipients per request")

    recipients = [normalize_mobile(n) for n in mobile_numbers]
    request_id = uuid.uuid4().hex[:16]
    originator = (sender_id or cfg["sender_id"]).strip()

    provider_results = []
    for mobile in recipients:
        if any(ord(ch) > 127 for ch in text):
            payload = {
                "sms": {
                    "ver": "2.0",
                    "dlr": {"url": settings.value_first_sms_dlr_url},
                    "messages": [
                        {
                            "udh": "0",
                            "text": text,
                            "property": 0,
                            "id": "1",
                            "mtsplitcount": "1",
                            "dlttemplateid": template_id,
                            "dltcontenttype": settings.value_first_sms_dlt_content_type,
                            "coding": 2,
                            "addresses": [{"from": originator, "to": mobile, "seq": "1", "tag": ""}],
                        }
                    ],
                }
            }
            headers = {
                "Content-Type": "application/json",
                "x-client-id": cfg["client_id"],
                "x-client-password": cfg["password"],
            }
            try:
                response = httpx.post(settings.value_first_sms_url, headers=headers, json=payload, timeout=30)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise UpstreamServiceError(
                    f"ValueFirst SMS request failed ({exc.response.status_code}): {exc.response.text[:300]}"
                ) from exc
            except httpx.HTTPError as exc:
                raise UpstreamServiceError(f"Could not connect to ValueFirst SMS: {exc}") from exc
            parsed = response.json()
            guid = ((parsed.get("messageack") or {}).get("guids") or [{}])[0]
            errors = guid.get("errors") or []
            if parsed.get("status") != "Success" or errors:
                detail = (errors[0].get("errortext") if errors else parsed.get("statustext")) or response.text[:300]
                raise UpstreamServiceError(f"ValueFirst SMS rejected {mobile}: {detail}")
            provider_results.append({"guid": guid.get("guid"), "mobilenumber": mobile, "statuscode": "0", "statustext": "Success"})
            continue

        params = {
            "clientid": cfg["client_id"],
            "clientpassword": cfg["password"],
            "to": mobile,
            "from": originator,
            "udh": "0",
            "dlr-url": settings.value_first_sms_dlr_url,
            "text": text,
            "dlttemplateid": template_id,
        }
        try:
            response = httpx.get(settings.value_first_sms_url, params=params, timeout=30)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise UpstreamServiceError(
                f"ValueFirst SMS request failed ({exc.response.status_code}): {exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise UpstreamServiceError(f"Could not connect to ValueFirst SMS: {exc}") from exc

        parsed = {key: values[-1] for key, values in parse_qs(response.text, keep_blank_values=True).items()}
        if parsed.get("statuscode") != "0":
            raise UpstreamServiceError(f"ValueFirst SMS rejected {mobile}: {parsed.get('statustext') or response.text[:300]}")
        provider_results.append(parsed)

    return {"request_id": request_id, "recipient_count": len(recipients), "response": {"status": "Success", "results": provider_results}}
