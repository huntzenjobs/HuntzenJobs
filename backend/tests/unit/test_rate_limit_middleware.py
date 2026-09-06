"""Régressions du middleware SlowAPI quand Redis échoue en mode fail-open."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from src.api.middleware import SafeSlowAPIMiddleware, get_rate_limit_client_ip


def _request(*, client_ip: str, real_ip: str | None = None) -> Request:
    headers = []
    if real_ip is not None:
        headers.append((b"x-real-ip", real_ip.encode("ascii")))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/probe",
            "headers": headers,
            "client": (client_ip, 12345),
        }
    )


def test_rate_limit_uses_railway_real_ip(monkeypatch) -> None:
    """Sur Railway, la limite doit suivre le client et non le proxy interne."""
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_ID", "production-id")

    request = _request(client_ip="10.0.0.8", real_ip="203.0.113.42")

    assert get_rate_limit_client_ip(request) == "203.0.113.42"


def test_rate_limit_ignores_real_ip_outside_railway(monkeypatch) -> None:
    """Un client local ne doit pas pouvoir usurper la clé via un en-tête."""
    monkeypatch.delenv("RAILWAY_ENVIRONMENT_ID", raising=False)

    request = _request(client_ip="127.0.0.1", real_ip="203.0.113.42")

    assert get_rate_limit_client_ip(request) == "127.0.0.1"


def test_rate_limit_rejects_invalid_railway_real_ip(monkeypatch) -> None:
    """Une valeur Railway malformée retombe sur l'adresse de connexion."""
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_ID", "production-id")

    request = _request(client_ip="10.0.0.8", real_ip="not-an-ip")

    assert get_rate_limit_client_ip(request) == "10.0.0.8"


def test_rate_limit_canonicalizes_railway_ipv6(monkeypatch) -> None:
    """Deux écritures équivalentes d'une IPv6 doivent partager le compteur."""
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_ID", "production-id")

    expanded = _request(
        client_ip="10.0.0.8",
        real_ip="2001:0db8:0000:0000:0000:0000:0000:0001",
    )
    compressed = _request(client_ip="10.0.0.9", real_ip="2001:db8::1")

    assert get_rate_limit_client_ip(expanded) == "2001:db8::1"
    assert get_rate_limit_client_ip(compressed) == "2001:db8::1"


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
