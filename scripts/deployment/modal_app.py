"""
HuntZen CV Processing on Modal Labs (Unified Architect Edition)

Serverless CV processing using the UNIFIED agent from backend/src.
Eliminates code duplication and ensures prompt consistency across environments.
"""

import modal
import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

# IMPORTANT: Add /root to sys.path so we can import 'src' from the mounted directory
sys.path.append("/root")

# ============================================
# MODAL APP CONFIGURATION
# ============================================

app = modal.App("huntzen-cv-processor")

from pathlib import Path
MODULE_DIR = Path(__file__).parent
PROJECT_ROOT = MODULE_DIR.parent.parent

# Docker image with exact dependencies and local sources (V1 Style)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx", "libglib2.0-0", "poppler-utils", 
        "tesseract-ocr", "tesseract-ocr-fra", "tesseract-ocr-eng"
    )
    .pip_install(
        "docling==2.70.0", 
        "httpx==0.27.0", 
        "psycopg[binary]==3.3.2",
        "groq==0.13.1", 
        "structlog==24.4.0", 
        "pydantic==2.10.4",
        "fastapi[standard]==0.115.6", 
        "langchain==0.3.13", 
        "langchain-groq==0.2.2", 
        "langchain-core==0.3.28",
        "redis==5.0.1", 
        "orjson==3.10.12", 
        "python-dotenv", 
        "pydantic-settings",
        "tenacity",
        "cachetools>=5.3.2",
        "supabase==2.10.0",
        "slowapi==0.1.9",
        "sentry-sdk[fastapi]==2.19.2",
        "stripe>=11.0.0",
        "pycountry==24.6.1",
        "geonamescache>=1.5.0",
        "arq>=0.26.0",
        "aiohttp",
        "beautifulsoup4",
        "resend"
    )
    # Add project sources to the image using absolute local paths
    .add_local_dir(PROJECT_ROOT / "backend" / "src", "/root/src")
    .add_local_dir(PROJECT_ROOT / "backend" / "prompts", "/root/prompts")
)

secrets = [modal.Secret.from_name("huntzen-secrets")]

# ============================================
# DATABASE UTILITIES (Worker Side)
# ============================================

def get_db_connection():
    import psycopg
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL not found in Modal secrets")
    return psycopg.connect(database_url)

async def notify_fastapi_callback(cv_id: str, status: str) -> bool:
    import httpx
    fastapi_url = os.getenv("FASTAPI_CALLBACK_URL")
    modal_secret = os.getenv("MODAL_CALLBACK_SECRET")

    if not fastapi_url or not modal_secret:
        print(f"⚠️ FASTAPI_CALLBACK_URL or MODAL_CALLBACK_SECRET not configured")
        return False

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM cv_analyses WHERE id = %s", (str(cv_id),))
            result = cur.fetchone()
            user_id = str(result[0]) if result and result[0] else None
        conn.close()

        async with httpx.AsyncClient(timeout=10.0) as client:
            callback_url = f"{fastapi_url}/api/cv-analysis/callback"
            response = await client.post(
                callback_url,
                json={"cv_id": str(cv_id), "user_id": user_id, "status": str(status)},
                headers={"X-Modal-Secret": modal_secret}
            )
            if response.status_code == 200:
                print(f"✅ CALLBACK SUCCESS: Analysis {cv_id} sent to backend.")
            else:
                print(f"❌ CALLBACK FAILED: Backend returned {response.status_code} - {response.text}")
            return response.status_code == 200
    except Exception as e:
        print(f"❌ Callback failed: {e}")
        return False

async def update_cv_status(cv_id: str, status: str, result: Optional[Dict[str, Any]] = None, error_message: Optional[str] = None) -> bool:
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if status == "completed" and result:
                cur.execute(
                    "UPDATE cv_analyses SET status = %s, result = %s, completed_at = NOW(), updated_at = NOW() WHERE id = %s",
                    (str(status), json.dumps(result), str(cv_id))
                )
            elif status == "failed" and error_message:
                cur.execute(
                    "UPDATE cv_analyses SET status = %s, error_message = %s, updated_at = NOW() WHERE id = %s",
                    (str(status), str(error_message), str(cv_id))
                )
            else:
                cur.execute("UPDATE cv_analyses SET status = %s, updated_at = NOW() WHERE id = %s", (str(status), str(cv_id)))
            conn.commit()
        conn.close()

        if status in ("completed", "failed"):
            await notify_fastapi_callback(cv_id, status)
        return True
    except Exception as e:
        print(f"❌ DB update failed: {e}")
        return False

# ============================================
# MAIN CV PROCESSING FUNCTION (Unified Agent)
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=4096,
    cpu=2.0,
    timeout=600,
    max_containers=1000,
)
async def process_cv_analysis(
    cv_id: str,
    user_id: Optional[str] = None,
    pdf_url: Optional[str] = None,
    cv_text: Optional[str] = None,
    job_description: Optional[str] = None,
    language: str = "fr"
) -> Dict[str, Any]:
    import httpx
    import tempfile
    from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent

    print(f"🚀 Unified CV Processing Starting: {cv_id}")
    start_time = time.time()

    try:
        # Step 1: Processing Status
        await update_cv_status(cv_id, "processing")

        # Step 2: Extract Text (if needed)
        final_cv_text = cv_text
        if not final_cv_text and pdf_url:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(pdf_url)
                response.raise_for_status()
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
                    tmp_file.write(response.content)
                    tmp_path = tmp_file.name
            
            # Use unified extraction method if possible, or stay with local Docling
            # For simplicity and perf, we keep the docling logic here or move to agent.
            # Let's use the local docling as it's already configured in Modal image.
            from docling.document_converter import DocumentConverter
            converter = DocumentConverter()
            extract_res = converter.convert(tmp_path)
            final_cv_text = extract_res.document.export_to_markdown()
            os.unlink(tmp_path)

        if not final_cv_text or len(final_cv_text) < 50:
            raise ValueError("CV content extraction failed or empty")

        # Step 3: Run UNIFIED AGENT 🎯
        # This uses the same prompts and logic as your local/railway environment
        agent = CVAnalyzerAgent()
        analysis_result = await agent.run(
            cv_text=final_cv_text,
            job_description=job_description,
            language=language
        )

        # Add processing metadata
        analysis_result["processing_time_seconds"] = round(time.time() - start_time, 2)
        analysis_result["processed_at"] = datetime.utcnow().isoformat()

        # Step 4: Final DB Update
        await update_cv_status(cv_id, "completed", result=analysis_result)
        
        return {"success": True, "cv_id": cv_id}

    except Exception as e:
        error_msg = f"Unified Processing Failed: {str(e)}"
        print(f"❌ {error_msg}")
        await update_cv_status(cv_id, "failed", error_message=error_msg)
        return {"success": False, "error": error_msg}

# ============================================
# WEB ENDPOINT
# ============================================

@app.function(image=image, secrets=secrets)
@modal.fastapi_endpoint(method="POST")
async def process_cv_webhook(request_body: dict) -> dict:
    try:
        process_cv_analysis.spawn(
            cv_id=request_body["cv_id"],
            user_id=request_body.get("user_id"),
            pdf_url=request_body.get("pdf_url"),
            cv_text=request_body.get("cv_text"),
            job_description=request_body.get("job_description"),
            language=request_body.get("language", "fr")
        )
        return {"success": True, "cv_id": request_body["cv_id"]}
    except Exception as e:
        return {"success": False, "error": str(e)}
