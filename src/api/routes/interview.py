from fastapi import APIRouter, HTTPException
from src.services.interview.service import interview_service
from src.models.schemas import InterviewTokenResponse

router = APIRouter()

@router.get("/token", response_model=InterviewTokenResponse)
async def get_interview_token():
    try:
        signed_url = await interview_service.get_signed_url()
        return {"signed_url": signed_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))