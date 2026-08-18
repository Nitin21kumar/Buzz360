import os
from dotenv import load_dotenv
from .postgres_store import PostgresCollection, check_postgres_connection, ensure_schema
load_dotenv()
DATABASE_URL=os.getenv("DATABASE_URL", "postgresql://buzz360_app:change_me@localhost:5432/buzz360")
_names=["tts_audio","voice_folders","stt_history","campaigns","contacts","call_logs","users","whatsapp_campaigns","whatsapp_contacts","whatsapp_messages","whatsapp_conversations","whatsapp_keyword_rules","whatsapp_settings","sms_messages","sms_campaigns","sms_contacts"]
_collections={n:PostgresCollection(n,DATABASE_URL) for n in _names}
tts_collection=_collections["tts_audio"]
voice_folders_collection=_collections["voice_folders"]
stt_collection=_collections["stt_history"]
campaigns_collection=_collections["campaigns"]
contacts_collection=_collections["contacts"]
call_logs_collection=_collections["call_logs"]
users_collection=_collections["users"]
whatsapp_campaigns_collection=_collections["whatsapp_campaigns"]
whatsapp_contacts_collection=_collections["whatsapp_contacts"]
whatsapp_messages_collection=_collections["whatsapp_messages"]
whatsapp_conversations_collection=_collections["whatsapp_conversations"]
whatsapp_keyword_rules_collection=_collections["whatsapp_keyword_rules"]
whatsapp_settings_collection=_collections["whatsapp_settings"]
sms_messages_collection=_collections["sms_messages"]
sms_campaigns_collection=_collections["sms_campaigns"]
sms_contacts_collection=_collections["sms_contacts"]
def check_connection(): return check_postgres_connection(DATABASE_URL)
def ensure_indexes():
    ensure_schema(DATABASE_URL)
    users_collection.create_index("uid",unique=True)
    users_collection.create_index("email",unique=True)
