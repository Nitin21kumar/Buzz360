from app.core.config import settings
from app.db.client import init_db
from app.db.postgres_store import PostgresCollection

_NAMES = [
    "tts_audio",
    "voice_folders",
    "stt_history",
    "campaigns",
    "contacts",
    "call_logs",
    "users",
    "whatsapp_campaigns",
    "whatsapp_contacts",
    "whatsapp_templates",
    "sms_campaigns",
    "sms_contacts",
    "sms_messages",
]

_collections = {name: PostgresCollection(name, settings.database_url) for name in _NAMES}

tts_collection = _collections["tts_audio"]
voice_folders_collection = _collections["voice_folders"]

stt_collection = _collections["stt_history"]

campaigns_collection = _collections["campaigns"]
contacts_collection = _collections["contacts"]
call_logs_collection = _collections["call_logs"]

users_collection = _collections["users"]


sms_campaigns_collection = _collections["sms_campaigns"]
sms_contacts_collection = _collections["sms_contacts"]
sms_messages_collection = _collections["sms_messages"]


def ensure_indexes() -> None:
    init_db()
