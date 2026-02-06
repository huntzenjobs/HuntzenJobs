import httpx
from src.config import settings # Assure-toi que settings charge les nouvelles variables

class InterviewService:
    def __init__(self):
        # Dans src/services/interview/service.py
        self.api_key = settings.elevenlabs_api_key
        self.agent_id = settings.elevenlabs_agent_id
        self.base_url = "https://api.elevenlabs.io/v1/convai"

    async def get_signed_url(self) -> str:
        """Récupère une URL signée pour authentifier le WebSocket côté client."""
        url = f"{self.base_url}/conversation/get_signed_url"
        headers = {"xi-api-key": self.api_key}
        params = {"agent_id": self.agent_id}

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            return data["signed_url"]

interview_service = InterviewService()