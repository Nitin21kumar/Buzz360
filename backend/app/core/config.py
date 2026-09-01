import secrets
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_FALLBACK_SIGNING_SECRET = secrets.token_urlsafe(32)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(
        default="postgresql://buzz360_app:change_me@localhost:5432/buzz360", alias="DATABASE_URL"
    )

    sarvam_api_key: str = Field(default="", alias="SARVAM_API_KEY")

    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")

    sarv_user_id: str = Field(default="", alias="SARV_USER_ID")
    sarv_user_token: str = Field(default="", alias="SARV_USER_TOKEN")
    sarv_plan_id: str = Field(default="", alias="SARV_PLAN_ID")
    sarv_plan_type: str = Field(default="C", alias="SARV_PLAN_TYPE")
    sarv_includes_country_code: str = Field(default="N", alias="SARV_INCLUDES_COUNTRY_CODE")
    sarv_webhook_secret: str = Field(default="", alias="SARV_WEBHOOK_SECRET")


    value_first_sms_url: str = Field(
        default="https://api.goinfinito.com/unified/v2/send", alias="VALUE_FIRST_SMS_URL"
    )
    value_first_sms_api_key: str = Field(default="", alias="VALUE_FIRST_SMS_API_KEY")
    value_first_client_id: str = Field(default="", alias="VALUE_FIRST_CLIENT_ID")
    value_first_password: str = Field(default="", alias="VALUE_FIRST_PASSWORD")
    value_first_sms_sender_id: str = Field(default="", alias="VALUE_FIRST_SMS_SENDER_ID")
    value_first_sms_template_ids: str = Field(default="", alias="VALUE_FIRST_SMS_TEMPLATE_IDS")
    value_first_sms_dlr_url: str = Field(default="", alias="VALUE_FIRST_SMS_DLR_URL")
    value_first_sms_max_addresses_per_request: int = Field(
        default=100, alias="VALUE_FIRST_SMS_MAX_ADDRESSES_PER_REQUEST"
    )
    value_first_sms_dlt_content_type: int = Field(default=1, alias="VALUE_FIRST_SMS_DLT_CONTENT_TYPE")
    value_first_sms_duplicate_retry_seconds: int = Field(
        default=3600, alias="VALUE_FIRST_SMS_DUPLICATE_RETRY_SECONDS"
    )
    value_first_sms_duplicate_max_retries: int = Field(default=3, alias="VALUE_FIRST_SMS_DUPLICATE_MAX_RETRIES")

    firebase_service_account_path: str = Field(default="", alias="FIREBASE_SERVICE_ACCOUNT_PATH")
    firebase_project_id: str = Field(default="", alias="FIREBASE_PROJECT_ID")

    public_base_url: str = Field(default="", alias="PUBLIC_BASE_URL")
    allowed_origins_raw: str = Field(default="", alias="ALLOWED_ORIGINS")

    download_signing_secret: str = Field(default="", alias="DOWNLOAD_SIGNING_SECRET")
    download_link_ttl_seconds: int = Field(default=6 * 3600, alias="DOWNLOAD_LINK_TTL_SECONDS")

    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]
        return origins or ["*"]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def resolved_download_signing_secret(self) -> str:
        return self.download_signing_secret or _DEV_FALLBACK_SIGNING_SECRET

    def validate_for_production(self) -> None:
        """Fail fast at startup instead of silently running an insecure
        configuration in production. Called once from main.py."""
        if not self.is_production:
            return
        problems = []
        if not self.allowed_origins_raw.strip() or self.allowed_origins == ["*"]:
            problems.append(
                "ALLOWED_ORIGINS must be set to your real frontend origin(s) in production "
                "(refusing to fall back to '*')."
            )
        if not self.download_signing_secret:
            problems.append(
                "DOWNLOAD_SIGNING_SECRET must be set in production so signed audio/download "
                "links stay valid across restarts and multiple worker processes."
            )
        if not self.firebase_service_account_path and not self.firebase_project_id:
            problems.append(
                "Set FIREBASE_SERVICE_ACCOUNT_PATH (preferred) or FIREBASE_PROJECT_ID so "
                "login tokens can be verified."
            )
        if problems:
            raise RuntimeError(
                "Refusing to start with ENVIRONMENT=production and an insecure configuration:\n- "
                + "\n- ".join(problems)
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
