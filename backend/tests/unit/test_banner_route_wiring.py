"""Contrat de routage public du banner et du mode maintenance."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import router


def test_banner_routes_share_the_public_api_prefix() -> None:
    """Le frontend doit pouvoir joindre les URLs /api qu'il consomme."""
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    response = client.get("/api/banner")

    assert response.status_code == 200
    assert response.json() == {"active": False}
    assert client.get("/banner").status_code == 404
