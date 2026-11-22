from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    synthetic_data_only: bool = True
    ai_service_token: SecretStr = SecretStr("")
    ai_mode: Literal["offline", "live"] = "offline"
    tesseract_cmd: str = "tesseract"
    llm_provider: Literal["gemini", "groq", "ollama"] = "ollama"
    llm_model: str = "llama3.2:3b"
    ollama_base_url: str = "http://localhost:11434"
    gemini_api_key: SecretStr = SecretStr("")
    groq_api_key: SecretStr = SecretStr("")
    langfuse_enabled: bool = False
    langfuse_public_key: SecretStr = SecretStr("")
    langfuse_secret_key: SecretStr = SecretStr("")
    langfuse_base_url: str = "https://cloud.langfuse.com"

    @field_validator("synthetic_data_only")
    @classmethod
    def require_synthetic(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Only synthetic data is supported")
        return value
