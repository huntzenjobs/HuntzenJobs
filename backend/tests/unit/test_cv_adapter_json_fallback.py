from types import SimpleNamespace

import pytest

from src.agents.cv_adapter.main_agent import CVAdapterAgent


class JsonValidationError(Exception):
    body = {"error": {"code": "json_validate_failed"}}


class FakeCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            raise JsonValidationError("Groq JSON validation failed")
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='```json\n{"personal_info": {"name": "Camille"}}\n```'
                    )
                )
            ]
        )


@pytest.mark.asyncio
async def test_json_completion_retries_without_provider_json_mode() -> None:
    agent = object.__new__(CVAdapterAgent)
    completions = FakeCompletions()
    agent.groq_client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions)
    )
    agent.name = "CVAdapter"

    result = await agent._create_json_completion(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": "Return JSON"}],
        temperature=0.0,
    )

    assert result == {"personal_info": {"name": "Camille"}}
    assert completions.calls[0]["response_format"] == {"type": "json_object"}
    assert "response_format" not in completions.calls[1]
    assert len(completions.calls) == 2


@pytest.mark.asyncio
async def test_json_completion_does_not_retry_unrelated_errors() -> None:
    agent = object.__new__(CVAdapterAgent)

    class FailingCompletions:
        def create(self, **kwargs: object) -> None:
            raise RuntimeError("network unavailable")

    agent.groq_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FailingCompletions())
    )
    agent.name = "CVAdapter"

    with pytest.raises(RuntimeError, match="network unavailable"):
        await agent._create_json_completion(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "Return JSON"}],
            temperature=0.0,
        )
