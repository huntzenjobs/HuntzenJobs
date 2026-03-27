"""
Application Settings
=====================
Centralized configuration using Pydantic Settings with validation.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings with environment variable support.

    All settings can be overridden via environment variables or .env file.
    Secret values use SecretStr for security.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --------------------------------------------------------------------------
    # Application
    # --------------------------------------------------------------------------
    app_name: str = "HuntZen"
    app_version: str = "3.0.0"
    debug: bool = Field(default=False, description="Enable debug mode")
    environment: Literal["development", "staging", "production", "test"] = "development"

    # --------------------------------------------------------------------------
    # Monitoring
    # --------------------------------------------------------------------------
    sentry_dsn: str = Field(default="", description="Sentry DSN for error tracking")

    # --------------------------------------------------------------------------
    # Server
    # --------------------------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = Field(default=True, description="Hot reload for development")
    workers: int = Field(default=1, ge=1, le=8, description="Number of workers")

    # --------------------------------------------------------------------------
    # API Keys - LLM Providers
    # --------------------------------------------------------------------------
    groq_api_key: SecretStr = Field(default=SecretStr(""), description="Groq API Key")

    # --------------------------------------------------------------------------
    # API Keys - Job Providers
    # --------------------------------------------------------------------------
    serpapi_key: SecretStr = Field(default=SecretStr(""), description="SerpAPI Key")
    adzuna_app_id: str = Field(default="", description="Adzuna App ID")
    adzuna_api_key: SecretStr = Field(default=SecretStr(""), description="Adzuna API Key")
    rapidapi_key: SecretStr = Field(default=SecretStr(""), description="RapidAPI Key")
    france_travail_client_id: str = Field(default="", alias="CLIENT_ID", description="France Travail OAuth2 Client ID")
    france_travail_client_secret: str = Field(default="", alias="CLIENT_SECRET", description="France Travail OAuth2 Client Secret")

    # --------------------------------------------------------------------------
    # API Keys - Recruiter Finder (Hunter.io + Apollo)
    # --------------------------------------------------------------------------
    hunter_api_key: SecretStr = Field(default=SecretStr(""), description="Hunter.io API Key")
    apollo_api_key: SecretStr = Field(default=SecretStr(""), description="Apollo.io API Key")

    # --------------------------------------------------------------------------
    # Database (Optional - Supabase)
    # --------------------------------------------------------------------------
    supabase_url: str = Field(default="", description="Supabase Project URL")
    supabase_key: SecretStr = Field(default=SecretStr(""), description="Supabase Anon Key")
    supabase_service_role_key: SecretStr = Field(default=SecretStr(""), description="Supabase Service Role Key")

    # Database Connection Pooling
    supabase_pooler_url: str = Field(default="", description="Supabase Pooler URL (transaction mode)")
    db_pool_size: int = Field(default=20, ge=5, le=100, description="Connection pool size per worker")
    db_pool_timeout: int = Field(default=30, ge=5, le=120, description="Pool timeout (seconds)")

    # --------------------------------------------------------------------------
    # Stripe Payments (Sprint 3 - Recruiter Contact)
    # --------------------------------------------------------------------------
    stripe_secret_key: SecretStr = Field(default=SecretStr(""), description="Stripe Secret Key")
    stripe_publishable_key: str = Field(default="", description="Stripe Publishable Key")
    stripe_webhook_secret: SecretStr = Field(default=SecretStr(""), description="Stripe Webhook Secret")
    recruiter_contact_price_id: str = Field(default="", description="Stripe Price ID for recruiter contact (50€)")
    frontend_url: str = Field(
        default="http://localhost:3000",
        description="Frontend URL(s) for redirects. Supports multiple URLs separated by commas. Example: https://prod.vercel.app,https://staging.vercel.app"
    )

    # --------------------------------------------------------------------------
    # Email Service (Resend - Sprint 3)
    # --------------------------------------------------------------------------
    resend_api_key: SecretStr = Field(default=SecretStr(""), description="Resend API Key")
    from_email: str = Field(default="HuntzenJobs <no-reply@huntzenjobs.com>", description="Email sender address with display name")
    admin_email: str = Field(default="huntzenproject@gmail.com", description="Admin notification email")

    # --------------------------------------------------------------------------
    # Agent Configuration
    # --------------------------------------------------------------------------
    default_language: Literal["fr", "en", "es", "de"] = "en"
    max_search_results: int = Field(default=100, ge=5, le=200)
    cache_ttl_seconds: int = Field(default=3600, ge=60)

    # LLM Models (Groq)
    # - Fast: For quick extraction/analysis tasks (needs to be resistant to jailbreaks)
    # - Powerful: For complex rewriting/generation tasks
    llm_model_fast: str = "meta-llama/llama-4-scout-17b-16e-instruct"  # Llama 4 Scout, 300K TPM
    llm_model_powerful: str = "llama-3.3-70b-versatile"  # 70B dense, 300K TPM, optimisé français
    llm_temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    llm_max_tokens: int = Field(default=2048, ge=256, le=8192)

    # --------------------------------------------------------------------------
    # Security
    # --------------------------------------------------------------------------
    cors_origins_str: str = Field(
        default="http://localhost:3000,https://huntzenjobs.com,https://www.huntzenjobs.com",
        description="Allowed CORS origins (comma-separated string)",
        validation_alias="CORS_ORIGINS"
    )
    rate_limit_per_minute: int = Field(default=60, ge=10, le=1000)

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        if not self.cors_origins_str or self.cors_origins_str.strip() == "*":
            return ["*"]
        if ',' in self.cors_origins_str:
            return [origin.strip() for origin in self.cors_origins_str.split(',') if origin.strip()]
        return [self.cors_origins_str.strip()]

    # --------------------------------------------------------------------------
    # Redis Cache (Railway Redis — réseau privé interne)
    # --------------------------------------------------------------------------
    # Format: redis://redis.railway.internal:6379 (prod) ou redis://localhost:6379 (dev)
    redis_url: str = Field(default="", description="Redis URL (redis://host:port)")

    # --------------------------------------------------------------------------
    # LangSmith Tracing
    # --------------------------------------------------------------------------
    langchain_tracing_v2: bool = Field(default=False, alias="LANGCHAIN_TRACING_V2")
    langchain_endpoint: str = Field(default="https://api.smith.langchain.com", alias="LANGCHAIN_ENDPOINT")
    langchain_api_key: SecretStr = Field(default=SecretStr(""), alias="LANGCHAIN_API_KEY")
    langchain_project: str = Field(default="HuntZen", alias="LANGCHAIN_PROJECT")

    cache_enabled: bool = Field(default=True, description="Enable distributed caching")
    cache_default_ttl: int = Field(default=300, ge=60, le=3600, description="Default cache TTL (seconds)")

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"

    def get_groq_key(self) -> str:
        """Get Groq API key as string."""
        return self.groq_api_key.get_secret_value()

    def get_serpapi_key(self) -> str:
        """Get SerpAPI key as string."""
        return self.serpapi_key.get_secret_value()

    def get_adzuna_key(self) -> str:
        """Get Adzuna API key as string."""
        return self.adzuna_api_key.get_secret_value()

    def get_rapidapi_key(self) -> str:
        """Get RapidAPI key as string (used for JSearch salary estimates)."""
        return self.rapidapi_key.get_secret_value()

    def get_hunter_key(self) -> str:
        """Get Hunter.io API key as string."""
        return self.hunter_api_key.get_secret_value()

    def get_apollo_key(self) -> str:
        """Get Apollo.io API key as string."""
        return self.apollo_api_key.get_secret_value()

    def get_supabase_key(self) -> str:
        """Get Supabase Anon key as string."""
        return self.supabase_key.get_secret_value()

    def get_supabase_service_role_key(self) -> str:
        """Get Supabase Service Role key as string."""
        return self.supabase_service_role_key.get_secret_value()

    def get_stripe_secret_key(self) -> str:
        """Get Stripe secret key as string."""
        return self.stripe_secret_key.get_secret_value()

    def get_stripe_webhook_secret(self) -> str:
        """Get Stripe webhook secret as string."""
        return self.stripe_webhook_secret.get_secret_value()

    def get_resend_api_key(self) -> str:
        """Get Resend API key as string."""
        return self.resend_api_key.get_secret_value()

    def get_frontend_urls(self) -> list[str]:
        """
        Get all frontend URLs as a list.
        Supports multiple URLs separated by commas.

        Returns:
            list[str]: List of frontend URLs
        """
        return [url.strip() for url in self.frontend_url.split(',') if url.strip()]

    def get_primary_frontend_url(self) -> str:
        """
        Get the primary frontend URL (first one in the list).
        Used for OAuth and Stripe redirects.

        Returns:
            str: Primary frontend URL
        """
        urls = self.get_frontend_urls()
        return urls[0] if urls else 'http://localhost:3000'


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance (singleton pattern).

    Returns:
        Settings: Application settings
    """
    return Settings()


# Global settings instance
settings = get_settings()
