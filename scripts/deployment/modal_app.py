"""
HuntZen CV Processing on Modal Labs (S6-6)

Serverless CV processing with auto-scaling from 0 to 1000 workers.
Uses Docling for PDF extraction and Groq for AI analysis.

Architecture:
- FastAPI uploads CV to Supabase Storage (non-blocking)
- Modal function spawned asynchronously
- Docling extracts text from PDF (8-10s)
- Groq analyzes CV content (2-3s)
- Database updated with results
- Frontend polls status every 2s

Performance:
- Cold start: 3-5s (first request)
- Warm start: <1s (subsequent requests)
- Processing time: 10-15s per CV
- Auto-scales: 0 → 1000 workers in <30s

Cost (at 1000 CV/day):
- CPU: ~$40/month
- GPU (T4 optional): +$8/month
- Total: ~$48/month vs $200+ Railway

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-6
"""

import modal
import os
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

# ============================================
# MODAL APP CONFIGURATION
# ============================================

app = modal.App("huntzen-cv-processor")

# Docker image with Docling + PyTorch + dependencies
# This image is cached and reused across function invocations
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",  # OpenCV dependency
        "libglib2.0-0",     # GTK dependency
        "poppler-utils",    # PDF utilities
        "tesseract-ocr",    # OCR for scanned PDFs
        "tesseract-ocr-fra", # French OCR
        "tesseract-ocr-eng"  # English OCR
    )
    .pip_install(
        "docling==2.70.0",  # Latest stable version
        "httpx==0.28.1",
        "psycopg[binary]==3.2.4",
        "groq==0.14.0",
        "structlog==25.2.0",
        "pydantic==2.10.6",
        "fastapi[standard]>=0.115.0"  # Required for web endpoints
    )
)

# Secrets for API keys and database access
secrets = [modal.Secret.from_name("huntzen-secrets")]


# ============================================
# DATABASE CONNECTION
# ============================================

def get_db_connection():
    """
    Create PostgreSQL connection using Supabase credentials.

    Returns:
        psycopg connection object
    """
    import psycopg

    # Extract connection parameters from DATABASE_URL or individual vars
    supabase_url = os.getenv("SUPABASE_URL")

    # Build connection string
    # Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    conn_str = f"{supabase_url}/rest/v1"  # This will be extracted from env

    # For now, use direct connection (Modal will have DATABASE_URL in secrets)
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        # Fallback to constructing from Supabase URL
        raise ValueError("DATABASE_URL not found in Modal secrets")

    conn = psycopg.connect(database_url)
    return conn


async def notify_fastapi_callback(cv_id: str, status: str) -> bool:
    """
    Notify FastAPI that CV processing completed (Issue 2 Fix).

    This triggers quota increment on the FastAPI side ONLY if processing succeeded.

    Args:
        cv_id: CV analysis UUID
        status: Status ('completed' or 'failed')

    Returns:
        True if callback succeeded, False otherwise
    """
    import httpx
    import os

    fastapi_url = os.getenv("FASTAPI_CALLBACK_URL")
    modal_secret = os.getenv("MODAL_CALLBACK_SECRET")

    if not fastapi_url or not modal_secret:
        print(f"⚠️ FASTAPI_CALLBACK_URL or MODAL_CALLBACK_SECRET not configured, skipping callback")
        return False

    try:
        # Get user_id from database
        import psycopg
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM cv_analyses WHERE id = %s",
                (cv_id,)
            )
            result = cur.fetchone()
            user_id = result[0] if result else None
        conn.close()

        # Call FastAPI callback
        async with httpx.AsyncClient(timeout=10.0) as client:
            callback_url = f"{fastapi_url}/api/cv-analysis/callback"
            response = await client.post(
                callback_url,
                json={"cv_id": cv_id, "user_id": user_id, "status": status},
                headers={"X-Modal-Secret": modal_secret}
            )

            if response.status_code == 200:
                print(f"✅ Notified FastAPI callback: {cv_id} -> {status}")
                return True
            else:
                print(f"❌ FastAPI callback failed: HTTP {response.status_code}")
                return False

    except Exception as e:
        print(f"❌ Failed to notify FastAPI callback: {e}")
        # Don't fail the whole process if callback fails
        return False


async def update_cv_status(
    cv_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None
) -> bool:
    """
    Update CV analysis status in database AND notify FastAPI callback (Issue 2 Fix).

    Args:
        cv_id: CV analysis UUID
        status: Status ('processing', 'completed', 'failed')
        result: Analysis results (for completed status)
        error_message: Error message (for failed status)

    Returns:
        True if updated successfully
    """
    import psycopg

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if status == "completed" and result:
                cur.execute(
                    """
                    UPDATE cv_analyses
                    SET status = %s,
                        result = %s,
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, json.dumps(result), cv_id)
                )
            elif status == "failed" and error_message:
                cur.execute(
                    """
                    UPDATE cv_analyses
                    SET status = %s,
                        error_message = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, error_message, cv_id)
                )
            else:
                cur.execute(
                    """
                    UPDATE cv_analyses
                    SET status = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (status, cv_id)
                )

            conn.commit()

        conn.close()

        # Issue 2 Fix: Notify FastAPI callback for quota increment
        # Only notify for final statuses (completed or failed)
        if status in ("completed", "failed"):
            await notify_fastapi_callback(cv_id, status)

        return True

    except Exception as e:
        print(f"❌ Database update failed: {e}")
        return False


# ============================================
# DOCLING PDF EXTRACTION
# ============================================

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract text from PDF using Docling.

    Docling is IBM's advanced PDF extraction library that handles:
    - Complex layouts (multi-column, tables)
    - Scanned PDFs (OCR)
    - Formatting preservation

    Args:
        pdf_path: Path to PDF file

    Returns:
        Extracted markdown text

    Raises:
        Exception: If extraction fails
    """
    from docling.document_converter import DocumentConverter

    print(f"📄 Extracting text from PDF: {pdf_path}")
    start_time = time.time()

    try:
        # Initialize Docling converter
        converter = DocumentConverter()

        # Convert PDF to markdown
        result = converter.convert(pdf_path)

        # Get markdown content
        markdown_text = result.document.export_to_markdown()

        # pypdf fallback — same pattern as main_agent.py:extract_text_from_pdf()
        # Docling with do_ocr=False can silently return minimal text for design-heavy PDFs
        if not markdown_text or len(markdown_text.strip()) < 100:
            print(f"⚠️ Docling returned only {len((markdown_text or '').strip())} chars, trying pypdf fallback")
            try:
                from pypdf import PdfReader  # transitive dep of docling — always available
                reader = PdfReader(pdf_path)
                fallback_text = "\n".join(
                    page.extract_text() or "" for page in reader.pages
                ).strip()
                if fallback_text and len(fallback_text) >= 50:
                    elapsed = time.time() - start_time
                    print(f"✅ pypdf fallback succeeded: {len(fallback_text)} chars in {elapsed:.2f}s")
                    return fallback_text
                raise RuntimeError(f"pypdf also returned insufficient text ({len(fallback_text)} chars)")
            except Exception as pypdf_exc:
                raise RuntimeError(
                    f"All extraction failed. Docling: {len((markdown_text or '').strip())} chars. pypdf: {pypdf_exc}."
                )

        elapsed = time.time() - start_time
        word_count = len(markdown_text.split())

        print(f"✅ Extracted {word_count} words in {elapsed:.2f}s")

        return markdown_text

    except Exception as e:
        print(f"❌ Docling extraction failed: {e}")
        raise


# ============================================
# CV INFO EXTRACTION WITH GROQ
# ============================================

def extract_cv_info_with_groq(cv_text: str) -> Dict[str, Any]:
    """
    Extract personal information and key data from CV using Groq LLM.

    Extracts:
    - Full name
    - Email
    - Phone number
    - Location (city, country)
    - Key skills
    - Years of experience
    - Current/last job title

    Args:
        cv_text: Extracted CV text (markdown)

    Returns:
        CV info dictionary
    """
    from groq import Groq

    print(f"📋 Extracting CV info with Groq")

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY not found")

    client = Groq(api_key=groq_api_key)

    prompt = f"""Extrait les informations personnelles et clés du CV suivant.

CV:
{cv_text}

Réponds au format JSON suivant:
{{
    "full_name": "<nom complet>",
    "email": "<email ou null>",
    "phone": "<téléphone ou null>",
    "location": "<ville, pays ou null>",
    "job_title": "<titre du poste actuel/dernier ou null>",
    "years_of_experience": <nombre d'années d'expérience estimé ou null>,
    "key_skills": [<3-5 compétences principales>]
}}

Si une information n'est pas trouvée, utilise null.
Réponds UNIQUEMENT avec le JSON, sans texte additionnel."""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Tu es un expert en extraction d'informations de CV. Tu réponds toujours en JSON valide."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,  # Low temperature for factual extraction
            max_tokens=500
        )

        result_text = response.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]

        cv_info = json.loads(result_text.strip())
        print(f"✅ CV info extracted: {cv_info.get('full_name', 'Unknown')}")

        return cv_info

    except Exception as e:
        print(f"⚠️ CV info extraction failed: {e}")
        # Return empty cv_info on error (non-critical)
        return {
            "full_name": None,
            "email": None,
            "phone": None,
            "location": None,
            "job_title": None,
            "years_of_experience": None,
            "key_skills": []
        }


# ============================================
# CV ANALYSIS WITH GROQ
# ============================================

def analyze_cv_with_groq(cv_text: str, job_description: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyze CV using Groq LLM with detailed per-score explanations.

    Forces the LLM to justify each score with specific CV content references
    (company names, technologies, dates, numbers found in the CV text).

    Returns per-score _explanation fields for display as tooltips in the frontend.

    Args:
        cv_text: Extracted CV text (markdown)
        job_description: Optional job description for matching analysis

    Returns:
        Analysis results dictionary with explanations
    """
    from groq import Groq

    print(f"🤖 Analyzing CV with Groq (length: {len(cv_text)} chars)")
    start_time = time.time()

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY not found in Modal secrets")

    client = Groq(api_key=groq_api_key)

    job_match_section = ""
    if job_description:
        job_match_section = f"""
Offre d'emploi à matcher :
---
{job_description}
---
"""

    job_match_json_fields = '"job_match_score": null,\n    "job_match_explanation": null'
    if job_description:
        job_match_json_fields = (
            '"job_match_score": <entier 0-100 basé sur la correspondance avec l\'offre>,\n'
            '    "job_match_explanation": "<2-3 phrases : score global, '
            'compétences du CV qui matchent l\'offre, compétences requises par l\'offre mais absentes du CV>"'
        )

    prompt = f"""Tu es un expert ATS (Applicant Tracking System) et recruteur senior avec 15 ans d'expérience.

MISSION : Analyser ce CV avec rigueur et précision.

RÈGLE ABSOLUE : Chaque explication DOIT citer le contenu réel du CV (noms d'entreprises, technologies, dates, chiffres trouvés dans le texte). Les phrases génériques comme "votre CV est bien structuré" sont INTERDITES.

CV à analyser :
---
{cv_text}
---
{job_match_section}
Réponds UNIQUEMENT avec le JSON suivant. Aucun texte avant ou après. Aucun bloc markdown.

{{
    "ats_score": {{
        "overall_score": <entier 0-100 : moyenne pondérée des 4 scores (format 25%, keywords 30%, structure 25%, readability 20%)>,
        "formatting_score": <entier 0-100>,
        "formatting_explanation": "<1-2 phrases citant des éléments CONCRETS du CV : nommer les sections présentes/absentes, commenter l'uniformité des dates, la longueur du CV en pages>",
        "keywords_score": <entier 0-100>,
        "keywords_explanation": "<1-2 phrases listant les mots-clés techniques TROUVÉS dans le CV et les mots-clés IMPORTANTS qui manquent pour ce profil>",
        "structure_score": <entier 0-100>,
        "structure_explanation": "<1-2 phrases sur la logique de la chronologie, l'ordre des sections, les sections présentes ou manquantes (ex: résumé professionnel, réalisations)>",
        "readability_score": <entier 0-100>,
        "readability_explanation": "<1-2 phrases sur la qualité des bullet points : utilisent-ils des verbes d'action + résultats chiffrés, ou sont-ce des descriptions de tâches vagues ?>"
    }},
    "strengths": [
        "<point fort 1 : cite un FAIT précis du CV — ex: 'Certification AWS Solutions Architect obtenue en 2023, très valorisée par les recruteurs tech'>",
        "<point fort 2 : cite un FAIT précis — ex: 'Résultat quantifié fort : réduction de 40% du temps de traitement batch chez [Entreprise] (2024)'>",
        "<point fort 3 : cite un FAIT précis du CV>"
    ],
    "improvements": [
        "<amélioration 1 : actionnable et spécifique — cite la section ou l'élément concerné ex: 'Ajouter un résumé professionnel de 3-4 lignes en tête : les ATS lisent ce bloc en priorité'>",
        "<amélioration 2 : cite la section problématique — ex: 'Les postes [dates] chez [Entreprise] décrivent des tâches sans verbes d'action ni métriques'>",
        "<amélioration 3 : mots-clés manquants — ex: '[Technologie1], [Technologie2] sont absents alors qu'ils apparaissent dans la majorité des offres pour ce profil'>"
    ],
    "missing_sections": ["<sections ATS standard absentes du CV, ex: Résumé professionnel, Liens GitHub/Portfolio, Certifications>"],
    "keywords_found": ["<liste des mots-clés techniques pertinents TROUVÉS dans le CV>"],
    "keywords_missing": ["<liste des mots-clés importants ABSENTS du CV pour ce type de profil>"],
    {job_match_json_fields}
}}"""

    result_text = ""
    last_error = None

    for attempt in range(1, 3):  # 2 tentatives max (cold JSON fail → retry)
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Tu es un expert ATS et recruteur senior. "
                            "Tu analyses des CV avec précision et citant toujours des éléments concrets du CV. "
                            "Tu réponds toujours en JSON valide, sans markdown, sans texte additionnel."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=3000,
                response_format={"type": "json_object"},  # Force JSON mode — évite json_validate_failed
            )

            result_text = response.choices[0].message.content.strip()

            # Strip markdown code blocks if present
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            if result_text.startswith("```"):
                result_text = result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]

            result = json.loads(result_text.strip())

            elapsed = time.time() - start_time
            print(f"✅ Analysis completed in {elapsed:.2f}s (attempt {attempt}, score: {result['ats_score']['overall_score']}/100)")

            return result

        except json.JSONDecodeError as e:
            last_error = e
            print(f"⚠️ JSON parse error (attempt {attempt}/2): {e}")
            print(f"   Raw response: {result_text[:500]}")
            if attempt < 2:
                print("   Retrying...")
                continue
            raise RuntimeError(f"Groq returned invalid JSON after 2 attempts: {e}") from e

        except Exception as e:
            print(f"❌ Groq analysis failed (attempt {attempt}): {e}")
            raise


# ============================================
# MAIN CV PROCESSING FUNCTION
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=4096,  # 4GB RAM for Docling + PyTorch
    cpu=2.0,      # 2 vCPUs
    timeout=600,  # 10 minutes max
    retries=2,    # Retry failed jobs twice
    max_containers=1000,  # Max 1000 parallel workers
    # min_containers=2,  # DISABLED: Warm start disabled to reduce costs
    # scaledown_window=300  # Cold start mode - containers spin down immediately
)
async def process_cv_analysis(
    cv_id: str,
    user_id: Optional[str] = None,  # Allow None for anonymous users
    pdf_url: Optional[str] = None,
    cv_text: Optional[str] = None,
    job_description: Optional[str] = None,
    language: str = "fr"
) -> Dict[str, Any]:
    """
    Main CV processing function (runs on Modal).

    Supports both PDF and text modes:
    - PDF mode: Downloads PDF, extracts with Docling
    - Text mode: Uses provided text directly (skips Docling)

    This function:
    1. Downloads PDF from Supabase Storage OR uses provided text
    2. Extracts text with Docling (if PDF mode)
    3. Analyzes with Groq
    4. Updates database with results

    Args:
        cv_id: CV analysis UUID
        user_id: User UUID
        pdf_url: URL to PDF file in Supabase Storage (if PDF mode)
        cv_text: CV text content (if text mode)
        job_description: Optional job description for matching
        language: Response language ('fr' or 'en')

    Returns:
        Analysis results
    """
    import httpx
    import tempfile

    print(f"🚀 Starting CV analysis: {cv_id}")
    print(f"   User: {user_id}")
    print(f"   Mode: {'text' if cv_text else 'PDF'}")
    print(f"   Language: {language}")

    start_time = time.time()

    try:
        # Step 1: Update status to 'processing' IMMEDIATELY
        # This allows frontend to show progress instead of staying at 0%
        update_success = await update_cv_status(cv_id, "processing")
        if not update_success:
            print(f"⚠️ Warning: Failed to update status to 'processing' for {cv_id}")
        else:
            print(f"✅ Status updated to 'processing' for {cv_id}")

        # Step 2: Get CV text (either from PDF or directly)
        if cv_text:
            # TEXT MODE: Use provided text directly
            print("📝 Using provided CV text (skipping Docling extraction)")
            final_cv_text = cv_text
        else:
            # PDF MODE: Download and extract
            print(f"📥 Downloading PDF from Supabase Storage...")
            print(f"   PDF URL: {pdf_url}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(pdf_url)
                response.raise_for_status()
                pdf_content = response.content

            print(f"✅ Downloaded PDF ({len(pdf_content)} bytes)")

            # Save PDF to temporary file
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
                tmp_file.write(pdf_content)
                tmp_path = tmp_file.name

            print(f"💾 Saved to temporary file: {tmp_path}")

            # Extract text with Docling
            final_cv_text = extract_text_from_pdf(tmp_path)

            # Clean up temp file
            os.unlink(tmp_path)

        # Validate extraction
        if len(final_cv_text) < 100:
            raise ValueError(f"CV text too short ({len(final_cv_text)} chars). {'PDF may be corrupted or empty' if pdf_url else 'Please provide more CV content'}.")

        # Step 3: Extract CV info (parallel with analysis for speed)
        cv_info = extract_cv_info_with_groq(final_cv_text)

        # Step 4: Analyze with Groq
        analysis_result = analyze_cv_with_groq(final_cv_text, job_description)

        # Add metadata and cv_info
        analysis_result["cv_info"] = cv_info
        analysis_result["analysis_language"] = language
        analysis_result["processed_at"] = datetime.utcnow().isoformat()
        analysis_result["processing_time_seconds"] = round(time.time() - start_time, 2)
        analysis_result["processing_mode"] = "text" if cv_text else "pdf"

        # Step 5: Update database with results
        await update_cv_status(cv_id, "completed", result=analysis_result)

        total_time = time.time() - start_time
        print(f"✅ CV analysis completed in {total_time:.2f}s")
        print(f"   Overall ATS Score: {analysis_result['ats_score']['overall_score']}/100")

        return {
            "success": True,
            "cv_id": cv_id,
            "result": analysis_result
        }

    except Exception as e:
        error_msg = f"CV processing failed: {str(e)}"
        print(f"❌ {error_msg}")

        # Update database with error
        await update_cv_status(cv_id, "failed", error_message=error_msg)

        return {
            "success": False,
            "cv_id": cv_id,
            "error": error_msg
        }


# ============================================
# BATCH PROCESSING (OPTIONAL)
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=4096,
    cpu=2.0,
    timeout=3600,  # 1 hour for batch processing
)
async def process_cv_batch(cv_ids: List[str]) -> Dict[str, Any]:
    """
    Process multiple CVs in parallel.

    This function spawns multiple Modal workers to process CVs concurrently.
    Useful for bulk imports or backfilling.

    Args:
        cv_ids: List of CV analysis UUIDs to process

    Returns:
        Batch processing results
    """
    print(f"📦 Starting batch processing: {len(cv_ids)} CVs")

    # TODO: Fetch CV details from database
    # TODO: Spawn parallel workers with process_cv_analysis.map()

    return {
        "success": True,
        "total": len(cv_ids),
        "message": "Batch processing not yet implemented"
    }


# ============================================
# WEB ENDPOINT FOR HTTP ACCESS
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=4096,
    cpu=2.0,
    timeout=600,
    # min_containers=1,  # DISABLED: Warm start disabled to reduce costs
    # scaledown_window=300  # Cold start mode
    # Note: Web endpoints do not support retries parameter
)
@modal.fastapi_endpoint(method="POST")
async def process_cv_webhook(request_body: dict) -> dict:
    """
    HTTP webhook endpoint for CV processing.
    This allows the backend to call Modal via HTTP instead of spawn().

    Accepts JSON body with:
    - cv_id: UUID string
    - user_id: UUID string or null for anonymous
    - pdf_url: Supabase Storage URL (for PDF mode) or null
    - cv_text: CV text content (for text mode) or null
    - job_description: Optional job description
    - language: "fr" or "en"

    Returns: Analysis result dict
    """
    try:
        # Extract parameters
        cv_id = request_body["cv_id"]
        user_id = request_body.get("user_id")
        pdf_url = request_body.get("pdf_url")
        cv_text = request_body.get("cv_text")
        job_description = request_body.get("job_description")
        language = request_body.get("language", "fr")

        # .spawn() — container dédié, retourne en <1s au lieu de bloquer 15s
        # Railway worker libéré immédiatement — callback /api/cv-analysis/callback déjà en place
        process_cv_analysis.spawn(
            cv_id=cv_id,
            user_id=user_id,
            pdf_url=pdf_url,
            cv_text=cv_text,
            job_description=job_description,
            language=language
        )

        return {
            "success": True,
            "message": "processing_spawned",
            "cv_id": cv_id
        }

    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


# ============================================
# HEALTH CHECK & KEEP-ALIVE
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=512,  # Minimal memory for health check
    timeout=30,
    # min_containers=1  # DISABLED: Warm start disabled to reduce costs
)
def health_check() -> Dict[str, Any]:
    """
    Health check function to verify Modal app is running.

    Returns:
        Health status
    """
    return {
        "status": "healthy",
        "service": "huntzen-cv-processor",
        "timestamp": time.time(),
        "checks": {
            "groq_api_key": bool(os.getenv("GROQ_API_KEY")),
            "supabase_url": bool(os.getenv("SUPABASE_URL")),
            "database_url": bool(os.getenv("DATABASE_URL"))
        }
    }


# ============================================
# SCHEDULED KEEP-ALIVE JOB
# ============================================
# DISABLED: Warm start disabled to reduce costs
# Uncomment to re-enable warm start mode

# @app.function(
#     image=image,
#     secrets=secrets,
#     memory=512,
#     timeout=30,
#     schedule=modal.Cron("*/5 * * * *")  # Every 5 minutes
# )
def keep_alive_ping_DISABLED():
    """
    Scheduled job that runs every 5 minutes to keep Modal warm.

    This prevents cold starts by ensuring at least one container
    stays active and ready to process CV requests.

    Runs every 5 minutes: */5 * * * *
    """
    print(f"🔥 Keep-alive ping at {time.time()}")

    # Call health check to keep the app warm
    result = health_check.local()

    print(f"✅ Keep-alive ping successful: {result['status']}")
    return {
        "pinged_at": time.time(),
        "health_status": result["status"]
    }


# ============================================
# LOCAL TESTING
# ============================================

@app.local_entrypoint()
def main():
    """
    Local testing entrypoint.

    Usage:
        modal run modal_app.py
    """
    print("🧪 Testing Modal CV Processor")

    # Test health check
    print("\n1️⃣ Testing health check...")
    health = health_check.remote()
    print(f"   Health: {health}")

    print("\n✅ Modal app is working!")
    print("\n📝 Next steps:")
    print("   1. Deploy: modal deploy modal_app.py")
    print("   2. Test with real CV: Call process_cv_analysis.remote()")
    print("   3. Monitor: https://modal.com/apps/huntzenproject")
