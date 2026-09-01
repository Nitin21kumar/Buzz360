from pydantic import BaseModel, Field


class SMSSend(BaseModel):
    recipients: list[str] = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=2000)
    template_id: str = Field(min_length=1, max_length=30)
    sender_id: str | None = Field(default=None, max_length=20)


class SMSCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    template_id: str = Field(min_length=1, max_length=30)
    message: str = Field(min_length=1, max_length=2000)


class SMSRecipients(BaseModel):
    recipients: list[str] = Field(min_length=1, max_length=5000)
