import json
import os
from typing import Optional

import httpx

from app.core.config import settings
from app.core.exceptions import UpstreamServiceError

BROADCAST_URL = "https://console.sarv.com/vb-api/v2/broadcasting"

SARV_MAX_CONTACTS_PER_REQUEST = int(os.getenv("SARV_MAX_CONTACTS_PER_REQUEST", "100"))


def _config() -> dict:
    return {
        "user_id": settings.sarv_user_id,
        "user_token": settings.sarv_user_token,
        "plan_id": settings.sarv_plan_id,
        "plan_type": settings.sarv_plan_type,
        "includes_country_code": settings.sarv_includes_country_code.upper(),
        "input_wait_time": "0",
    }


def _require_config(cfg: dict) -> None:
    missing = [k for k in ("user_id", "user_token", "plan_id") if not cfg[k]]
    if missing:
        raise UpstreamServiceError(
            f"Sarv credentials not configured (missing: {', '.join(missing)}). "
            "Check SARV_USER_ID, SARV_USER_TOKEN, SARV_PLAN_ID in your environment."
        )


def normalize_mobile(phone_number: str, includes_country_code: str) -> str:
    digits = phone_number.lstrip("+")
    if includes_country_code != "Y" and digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    return digits


def trigger_voice_broadcast(audio_url: str, mobile_numbers: list[str], callback_url: str = "") -> dict:
    if len(mobile_numbers) > SARV_MAX_CONTACTS_PER_REQUEST:
        raise ValueError(f"mobile_numbers exceeds the configured batch size of {SARV_MAX_CONTACTS_PER_REQUEST}")

    cfg = _config()
    _require_config(cfg)

    contacts = json.dumps([{"mobile": m} for m in mobile_numbers], separators=(",", ":"))

    params = {
        "userId": cfg["user_id"],
        "userToken": cfg["user_token"],
        "apiType": "broadcasting",
        "audio_url": audio_url,
        "planId": cfg["plan_id"],
        "planType": cfg["plan_type"],
        "inputWaitTime": cfg["input_wait_time"],
        "cli": "[]",
        "includesCountryCode": cfg["includes_country_code"],
        "contacts": contacts,
        "callback_url": callback_url,
        "extraParameters": "{}",
        "extraParametersIndex": "N",
    }

    with httpx.Client(timeout=30) as client:
        resp = client.get(BROADCAST_URL, params=params)

    try:
        data = resp.json()
    except ValueError:
        raise UpstreamServiceError(f"Sarv broadcasting returned non-JSON response: {resp.text[:300]}")

    if data.get("message") != "Success":
        raise UpstreamServiceError(f"Sarv broadcasting failed: {data.get('message', data)}")

    return data


def map_sarv_status(status: Optional[str]) -> str:
    if not status:
        return "failed"
    s = status.strip().lower()
    if s == "success":
        return "initiated"
    if s in ("answered", "completed"):
        return "completed"
    if s in ("not answered", "no answer", "noanswer", "no-answer"):
        return "no-answer"
    if s == "busy":
        return "busy"
    if s in ("failed", "invalid"):
        return "failed"
    return "failed"
