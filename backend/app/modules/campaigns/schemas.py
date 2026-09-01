from pydantic import BaseModel


class CampaignCreate(BaseModel):
    name: str


class VoiceSourceUpdate(BaseModel):
    voice_source_folder_id: str
