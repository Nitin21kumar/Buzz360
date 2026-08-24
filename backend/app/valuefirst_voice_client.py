"""ValueFirst/Infiniti unified voice API integration."""
import os
import uuid
import httpx

VOICE_URL = os.getenv("VALUE_FIRST_VOICE_URL", "https://api.goinfinito.com/unified/v2/send").strip()
MAX_ADDRESSES = int(os.getenv("VALUE_FIRST_MAX_ADDRESSES_PER_REQUEST", "100"))

class ValueFirstVoiceError(RuntimeError):
    pass

def config() -> tuple[str, str]:
    api_key = os.getenv("VALUE_FIRST_API_KEY", "").strip()
    campaign_id = os.getenv("VALUE_FIRST_CAMPAIGN_ID", "").strip()
    missing = [name for name, value in (("VALUE_FIRST_API_KEY", api_key), ("VALUE_FIRST_CAMPAIGN_ID", campaign_id)) if not value]
    if missing:
        raise ValueFirstVoiceError(f"ValueFirst is not configured (missing: {', '.join(missing)})")
    return api_key, campaign_id

def normalize_mobile(phone_number: str) -> str:
    digits = "".join(c for c in phone_number if c.isdigit())
    return digits[2:] if digits.startswith("91") and len(digits) == 12 else digits

def trigger_calls(mobile_numbers: list[str]) -> dict:
    if not mobile_numbers or len(mobile_numbers) > MAX_ADDRESSES:
        raise ValueError(f"ValueFirst accepts 1 to {MAX_ADDRESSES} addresses per configured batch")
    api_key, campaign_id = config()
    message_id = uuid.uuid4().hex[:8]
    payload = {"apiver": "1.0", "voice": {"ver": "2.0", "dlr": {"url": os.getenv("VALUE_FIRST_DLR_URL", "").strip()}, "messages": [{"id": message_id, "campaignid": campaign_id, "addresses": [{"to": mobile, "seq": str(index), "customdata": {}} for index, mobile in enumerate(mobile_numbers, start=1)]}]}}
    authorization = api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
    try:
        response = httpx.post(VOICE_URL, headers={"Authorization": authorization, "Content-Type": "application/json"}, json=payload, timeout=30)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            data = {"raw_response": response.text}
    except httpx.HTTPStatusError as exc:
        raise ValueFirstVoiceError(f"ValueFirst call request failed ({exc.response.status_code}): {exc.response.text[:300]}") from exc
    except httpx.HTTPError as exc:
        raise ValueFirstVoiceError(f"Could not connect to ValueFirst: {exc}") from exc
    return {"message_id": message_id, "response": data}