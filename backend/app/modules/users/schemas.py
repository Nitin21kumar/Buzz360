from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="user")
    modules: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    fields: list[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    modules: list[str] | None = None
    services: list[str] | None = None
    fields: list[str] | None = None
    active: bool | None = None
