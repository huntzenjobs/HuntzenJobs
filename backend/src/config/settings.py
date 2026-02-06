"""
Application Settings
=====================
Centralized configuration using Pydantic Settings with validation.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings with environment variable support.
    
    All settings can be overridden via environment variables or .env file.
    Secret values use SecretStr for security.
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
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
    environment: Literal["development", "staging", "production"] = "development"
    
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
    serpapi_api_key: SecretStr = Field(default=SecretStr(""), description="SerpAPI Key")
    adzuna_app_id: str = Field(default="", description="Adzuna App ID")
    adzuna_api_key: SecretStr = Field(default=SecretStr(""), description="Adzuna API Key")
    rapidapi_key: SecretStr = Field(default=SecretStr(""), description="RapidAPI Key")

    # --------------------------------------------------------------------------
    # Database (Optional - Supabase)
    # --------------------------------------------------------------------------
    supabase_url: str = Field(default="", description="Supabase Project URL")
    supabase_key: SecretStr = Field(default=SecretStr(""), description="Supabase Anon Key")

    # --------------------------------------------------------------------------
    # Agent Configuration
    # --------------------------------------------------------------------------
    default_language: Literal["fr", "en", "es", "de"] = "en"
    max_search_results: int = Field(default=25, ge=5, le=100)
    cache_ttl_seconds: int = Field(default=3600, ge=60)
    
    # LLM Models
    llm_model_fast: str = "llama-3.1-8b-instant"  # Fast model for extraction/analysis
    llm_model_powerful: str = "llama-3.3-70b-versatile"  # Powerful model for rewriting
    llm_temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    llm_max_tokens: int = Field(default=2048, ge=256, le=8192)
    
    # --------------------------------------------------------------------------
    # Security
    # --------------------------------------------------------------------------
    cors_origins: list[str] = Field(default=["*"], description="Allowed CORS origins")
    rate_limit_per_minute: int = Field(default=60, ge=10, le=1000)
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"
    
    def get_groq_key(self) -> str:
        """Get Groq API key as string."""
        return self.groq_api_key.get_secret_value()
    
    def get_serpapi_key(self) -> str:
        """Get SerpAPI key as string."""
        return self.serpapi_api_key.get_secret_value()
    
    def get_adzuna_key(self) -> str:
        """Get Adzuna API key as string."""
        return self.adzuna_api_key.get_secret_value()


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
