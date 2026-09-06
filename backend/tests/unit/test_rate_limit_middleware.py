"""Régressions du middleware SlowAPI quand Redis échoue en mode fail-open."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.api.middleware import SafeSlowAPIMiddleware


def test_rate_limit_storage_failure_remains_fail_open(monkeypatch) -> None:
    """L'absence de limite calculée ne doit pas transformer une requête en 500."""
    app = FastAPI()
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["300/minute"],
        headers_enabled=True,
        swallow_errors=True,
    )
    app.state.limiter = limiter
    app.add_middleware(SafeSlowAPIMiddleware)

    @app.get("/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    monkeypatch.setattr(limiter, "_check_request_limit", lambda *_args, **_kwargs: None)

    response = TestClient(app).get("/probe")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "X-RateLimit-Limit" not in response.headers
