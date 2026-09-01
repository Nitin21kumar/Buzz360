from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="A name for this new voice folder - required")


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=30000)
    folder_id: str = Field(description="Which voice folder these generated languages should be saved into")
    languages: list[str] = Field(min_length=1, description="Sarvam language codes, e.g. ['hi-IN','bn-IN']")
    source_language_code: str = Field(default="hi-IN", description="The language the input text is written in")
    gender: str = Field(default="female", description="'male' or 'female' — the best Bulbul v3 speaker for each selected language is picked automatically based on this")
    speaker: str | None = Field(default=None, description="Advanced: force a specific Bulbul v3 speaker for every language, overriding the gender-based auto-pick")
    pace: float = Field(default=1.0, ge=0.5, le=2.0, description="Bulbul v3's supported pace range")
    temperature: float = Field(default=0.78, ge=0.01, le=1.0, description="Bulbul v3's supported temperature range")
