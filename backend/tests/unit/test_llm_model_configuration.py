"""Contrat de configuration des modèles Groq supportés."""

import pytest
from pydantic import ValidationError

from src.config.settings import Settings


def test_default_models_are_supported_launch_models(monkeypatch) -> None:
    for name in ("FAST_MODEL", "PRIMARY_MODEL", "LLM_MODEL_FAST", "LLM_MODEL_POWERFUL"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.llm_model_fast == "openai/gpt-oss-20b"
    assert settings.llm_model_powerful == "openai/gpt-oss-120b"


def test_documented_model_environment_names_override_defaults(monkeypatch) -> None:
    monkeypatch.setenv("FAST_MODEL", "fast-model-test")
    monkeypatch.setenv("PRIMARY_MODEL", "powerful-model-test")

    settings = Settings(_env_file=None)

    assert settings.llm_model_fast == "fast-model-test"
    assert settings.llm_model_powerful == "powerful-model-test"


def test_default_language_supports_portuguese_instead_of_german(monkeypatch) -> None:
    monkeypatch.setenv("DEFAULT_LANGUAGE", "pt")
    assert Settings(_env_file=None).default_language == "pt"

    monkeypatch.setenv("DEFAULT_LANGUAGE", "de")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
