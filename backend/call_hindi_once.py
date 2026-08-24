"""Generate one Hindi announcement and place a single Sarv broadcast call."""
import asyncio
import os
from datetime import datetime

import httpx
from bson import ObjectId
from bson.binary import Binary
from dotenv import load_dotenv

load_dotenv()

from app import sarv_client  # noqa: E402
from app.constants import resolve_speaker  # noqa: E402
from app.database import tts_collection  # noqa: E402
from app.routers.speech import _generate_audio_bytes  # noqa: E402


PHONE_NUMBER = "8271567408"
SCRIPT = """क्या आप जानते हैं कि आंध्र प्रदेश का पूर्णा बुरेलू, पंजाब का दही भल्ला, राजस्थान का जेवर, बिहार का लिट्टी चोखा, गुजरात का आम का श्रीखंड और भी बहुत सारी चीजें हैं हमारे देश के खाने और खिलाने के लिए। लाइफ भी ये सारी चीजों की तरह टेस्टी और डिलीशियस है, तो फिर ज़िन्दगी का लुत्फ़ होता है। ड्रग्स, गांजा और नशीली चीजों को ना लें। से नो टु ड्रग्स, येस टु लाइफ। बी हेल्थी, बी हैप्पी।"""


async def main() -> None:
    folder_id = str(ObjectId())
    filename = "hindi.mp3"
    speaker = resolve_speaker("hi-IN", "female")
    audio = await _generate_audio_bytes(SCRIPT, "hi-IN", speaker, 1.0, 0.78)

    tts_collection.insert_one({
        "folder_id": folder_id,
        "language_code": "hi-IN",
        "language_name": "Hindi",
        "filename": filename,
        "audio_data": Binary(audio),
        "text": SCRIPT,
        "source_text": SCRIPT,
        "speaker": speaker,
        "gender": "female",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "created_by": "one-shot-automation",
    })

    public_base_url = (os.getenv("PUBLIC_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL", "")).rstrip("/")
    if not public_base_url:
        raise RuntimeError("PUBLIC_BASE_URL is not configured")
    audio_url = f"{public_base_url}/api/tts/download/{folder_id}/{filename}"

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(audio_url)
        response.raise_for_status()
        if not response.content:
            raise RuntimeError("The public audio endpoint returned an empty recording")

    includes_country_code = os.getenv("SARV_INCLUDES_COUNTRY_CODE", "N").strip().upper()
    mobile = sarv_client.normalize_mobile(PHONE_NUMBER, includes_country_code)
    result = sarv_client.trigger_voice_broadcast(audio_url, [mobile])
    print({"phone": PHONE_NUMBER, "audio_url": audio_url, "provider_response": result})


if __name__ == "__main__":
    asyncio.run(main())
