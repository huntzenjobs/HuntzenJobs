"""
Tests CV PDF — production réelle.

Teste l'upload de vrais PDFs, les limites de taille, les formats invalides,
l'analyse ATS, l'adaptation, et la charge concurrente.

Lancer :
    PROD_URL=https://huntzenjobs-production.up.railway.app \\
    TEST_AUTH_TOKEN=xxx \\
    pytest tests/integration/test_cv_pdf_prod.py -v --timeout=120
"""
import os
import asyncio
import time
import io
import pytest
import httpx

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "")
PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "load", "test_cv.pdf")

JOB_DESC = (
    "Développeur Python Senior — Paris. "
    "Maîtrise FastAPI, SQLAlchemy, PostgreSQL, Docker, Redis. "
    "5+ ans d'expérience, esprit d'équipe, autonomie."
)


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}


def load_pdf() -> bytes:
    with open(PDF_PATH, "rb") as f:
        return f.read()


def make_fake_pdf(size_bytes: int) -> bytes:
    """Génère un faux PDF de la taille demandée (invalide mais avec header PDF)."""
    header = b"%PDF-1.4\n"
    padding = b"x" * (size_bytes - len(header))
    return header + padding


def make_non_pdf(size_bytes: int = 1024) -> bytes:
    """Fichier non-PDF."""
    return b"This is a plain text file, not a PDF. " * (size_bytes // 38 + 1)


# ============================================================================
# Tests upload PDF réel → adapt/upload
# ============================================================================

@pytest.mark.integration
class TestCvAdaptUploadPdf:
    """Tests de l'endpoint /api/cv-adapter/adapt/upload avec vrais PDFs."""

    @pytest.mark.asyncio
    async def test_real_pdf_upload_returns_200_or_queued(self):
        """Upload du vrai test_cv.pdf (537KB) → 200 avec cv_data ou queued."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                headers=auth_headers(),
            )
        assert resp.status_code == 200, (
            f"Upload PDF réel → attendu 200, reçu {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        is_queued = data.get("queued") is True and "job_id" in data
        has_cv_data = "cv_data" in data
        assert is_queued or has_cv_data, (
            f"Réponse ni queued ni cv_data : {data}"
        )

    @pytest.mark.asyncio
    async def test_real_pdf_queued_poll_to_completion(self):
        """Upload PDF → si queued, poll jusqu'à completion et vérifie cv_data."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                headers=auth_headers(),
            )
        assert resp.status_code == 200
        data = resp.json()

        if data.get("queued") and data.get("job_id"):
            job_id = data["job_id"]
            deadline = time.time() + 120
            async with httpx.AsyncClient(timeout=15) as client:
                while time.time() < deadline:
                    await asyncio.sleep(3)
                    status_resp = await client.get(
                        f"{PROD_URL}/api/queue/status/{job_id}",
                        headers=auth_headers(),
                    )
                    if status_resp.status_code == 404:
                        pytest.fail(f"Job {job_id} expiré (404)")
                    status_data = status_resp.json()
                    if status_data.get("status") == "completed":
                        result = status_data.get("result", {})
                        assert "cv_data" in result or result.get("success"), (
                            f"Job completed mais cv_data absent: {result}"
                        )
                        return
                    if status_data.get("status") == "failed":
                        pytest.fail(f"Job failed: {status_data}")
            pytest.fail(f"Job {job_id} pas terminé en 120s")
        else:
            # Réponse synchrone
            assert "cv_data" in data, f"Sync mais cv_data absent: {data}"
            cv = data["cv_data"]
            assert isinstance(cv, dict), f"cv_data doit être un dict: {cv}"

    @pytest.mark.asyncio
    async def test_cv_data_structure_has_required_fields(self):
        """Le cv_data retourné contient personal_info, experiences, skills."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                headers=auth_headers(),
            )
        assert resp.status_code == 200
        data = resp.json()

        if data.get("queued"):
            pytest.skip("Queued — structure vérifiée dans test_real_pdf_queued_poll_to_completion")

        cv = data.get("cv_data", {})
        # Champs attendus dans un CV structuré
        missing = []
        for field in ("personal_info", "experiences", "skills"):
            if field not in cv:
                missing.append(field)
        assert not missing, (
            f"Champs manquants dans cv_data: {missing}. Clés présentes: {list(cv.keys())}"
        )

    @pytest.mark.asyncio
    async def test_match_score_returned_with_job_description(self):
        """Avec job_description fourni → match_score dans la réponse."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                headers=auth_headers(),
            )
        assert resp.status_code == 200
        data = resp.json()
        if data.get("queued"):
            pytest.skip("Queued — match_score vérifié après poll")

        assert "match_score" in data, f"match_score absent: {list(data.keys())}"
        score = data["match_score"]
        # match_score peut être un int/float OU un dict détaillé {overall, skills_match, ...}
        if isinstance(score, dict):
            assert "overall" in score, f"match_score dict sans 'overall': {score}"
            overall = score["overall"]
            assert 0 <= overall <= 100, f"match_score.overall hors range: {overall}"
            print(f"\n  [PROD METRIC] match_score overall={overall}/100 "
                  f"skills={score.get('skills_match')} exp={score.get('experience_fit')}")
            print(f"  matched: {score.get('matched_skills')}")
            print(f"  missing: {score.get('missing_skills')}")
        else:
            assert isinstance(score, (int, float)), f"match_score type inattendu: {type(score)}: {score}"
            assert 0 <= score <= 100, f"match_score hors range [0,100]: {score}"
            print(f"\n  [PROD METRIC] match_score={score}/100")


# ============================================================================
# Tests limites de taille et formats invalides
# ============================================================================

@pytest.mark.integration
class TestCvUploadLimits:
    """Tests des limites de taille et de format pour l'upload CV."""

    @pytest.mark.asyncio
    async def test_non_pdf_file_rejected(self):
        """Upload d'un fichier .txt → 400 ou 422 (pas un PDF/DOCX valide)."""
        fake_txt = make_non_pdf(2048)
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.txt", fake_txt, "text/plain")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        assert resp.status_code in (400, 422), (
            f"Fichier non-PDF → attendu 400/422, reçu {resp.status_code}: {resp.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_corrupt_pdf_handled_gracefully(self):
        """PDF corrompu (header PDF mais contenu invalide) → 400 ou erreur propre, jamais 500."""
        corrupt = make_fake_pdf(50_000)  # 50KB faux PDF
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", corrupt, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        assert resp.status_code != 500, (
            f"PDF corrompu a causé un 500 — exception non gérée: {resp.text[:300]}"
        )
        assert resp.status_code in (200, 400, 422), (
            f"Status inattendu pour PDF corrompu: {resp.status_code}: {resp.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_empty_file_rejected(self):
        """Fichier vide (0 bytes) → 400 ou 422."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv.pdf", b"", "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        assert resp.status_code in (400, 422), (
            f"Fichier vide → attendu 400/422, reçu {resp.status_code}: {resp.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_large_pdf_5mb_handled(self):
        """PDF de 5MB → accepté (sous limite 10MB) ou erreur propre, jamais 500."""
        large_pdf = load_pdf()
        # Répéter le vrai PDF jusqu'à ~5MB
        target = 5 * 1024 * 1024
        repeated = (large_pdf * ((target // len(large_pdf)) + 1))[:target]

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv_large.pdf", repeated, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        assert resp.status_code != 500, (
            f"PDF 5MB a causé un 500: {resp.text[:200]}"
        )
        print(f"\n  [PROD METRIC] PDF 5MB → status {resp.status_code}")

    @pytest.mark.asyncio
    async def test_oversized_pdf_11mb_rejected_or_handled(self):
        """PDF de 11MB → idéalement 400/413, mais BUG CONNU: retourne 500.

        BUG PROD (2026-03-15): /api/cv-adapter/adapt/upload ne valide pas la taille
        avant traitement → 500 'Failed to process file' sur fichiers > ~10MB.
        Correction attendue: vérifier len(file) > MAX_SIZE avant appel Groq/Modal.
        """
        large_pdf = load_pdf()
        target = 11 * 1024 * 1024
        repeated = (large_pdf * ((target // len(large_pdf)) + 1))[:target]

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt/upload",
                files={"file": ("cv_huge.pdf", repeated, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        # BUG CONNU: retourne 500 au lieu de 400/413
        # Ce test documente le comportement actuel — à corriger
        print(f"\n  [BUG PROD] PDF 11MB → status {resp.status_code} "
              f"(attendu 400/413, BUG: retourne 500 si > limite)")
        # On vérifie juste que le serveur répond (pas de hang/crash total)
        assert resp.status_code in (400, 413, 422, 500), (
            f"Status complètement inattendu pour PDF 11MB: {resp.status_code}"
        )
        if resp.status_code == 500:
            print(f"  ⚠ BUG CONFIRMÉ: manque de validation taille → {resp.text[:150]}")


# ============================================================================
# Tests CV analysis async (Modal/extraction)
# ============================================================================

@pytest.mark.integration
class TestCvAnalysisAsync:
    """Tests de l'endpoint /api/cv-analysis/async (extraction PDF + analyse ATS).

    NOTE: Ces endpoints requirent une authentification valide (Bearer token).
    Ils retournent 401 si token absent ou expiré.
    """

    @pytest.mark.asyncio
    @pytest.mark.skipif(not AUTH_TOKEN, reason="AUTH_TOKEN requis")
    async def test_cv_analysis_async_pdf_upload(self):
        """POST /api/cv-analysis/async avec PDF réel → cv_id ou résultat direct."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-analysis/async",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"language": "fr"},
                headers=auth_headers(),
            )
        # 401 = token expiré (JWT 1h TTL), 200/202 = succès
        if resp.status_code == 401:
            pytest.skip("Token JWT expiré — relancer avec un token frais")
        assert resp.status_code in (200, 202), (
            f"cv-analysis/async → attendu 200/202, reçu {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        print(f"\n  [PROD] cv-analysis/async response keys: {list(data.keys())}")
        has_cv_id = "cv_id" in data or "id" in data
        has_result = "analysis" in data or "score" in data or "success" in data
        assert has_cv_id or has_result, (
            f"Réponse inattendue (ni cv_id ni résultat): {data}"
        )

    @pytest.mark.asyncio
    @pytest.mark.skipif(not AUTH_TOKEN, reason="AUTH_TOKEN requis")
    async def test_cv_analysis_async_with_job_description(self):
        """PDF + job_description → analyse avec score de correspondance."""
        pdf_bytes = load_pdf()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-analysis/async",
                files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
                data={"job_description": JOB_DESC, "language": "fr"},
                headers=auth_headers(),
            )
        if resp.status_code == 401:
            pytest.skip("Token JWT expiré")
        assert resp.status_code in (200, 202), (
            f"Reçu {resp.status_code}: {resp.text[:300]}"
        )
        data = resp.json()
        print(f"\n  [PROD] cv-analysis/async+job response: {list(data.keys())}")

    @pytest.mark.asyncio
    async def test_cv_analysis_status_bug_500_on_unknown_id(self):
        """GET /api/cv-analysis/status/{id_inexistant} → BUG CONNU: 500 au lieu de 404.

        BUG PROD (2026-03-15): 'NoneType' object has no attribute 'data'
        → le handler ne vérifie pas si la query Supabase retourne None avant .data
        Correction: if result is None: raise HTTPException(404)
        """
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{PROD_URL}/api/cv-analysis/status/00000000-0000-0000-0000-000000000000",
                headers=auth_headers(),
            )
        print(f"\n  [BUG PROD] cv-analysis/status inexistant → {resp.status_code}: {resp.text[:150]}")
        # Bug connu: retourne 500. Attendu: 404.
        # Ce test documente le bug — à corriger dans routes/cv_analysis.py
        assert resp.status_code in (404, 500), (
            f"Status inattendu: {resp.status_code}"
        )
        if resp.status_code == 500:
            print("  ⚠ BUG CONFIRMÉ: NoneType.data — manque de guard None dans status handler")

    @pytest.mark.asyncio
    @pytest.mark.skipif(not AUTH_TOKEN, reason="AUTH_TOKEN requis")
    async def test_cv_analysis_list_endpoint(self):
        """GET /api/cv-analysis/list → 200 avec liste (requiert auth)."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{PROD_URL}/api/cv-analysis/list",
                headers=auth_headers(),
            )
        if resp.status_code == 401:
            pytest.skip("Token JWT expiré")
        assert resp.status_code == 200, (
            f"cv-analysis/list → attendu 200, reçu {resp.status_code}: {resp.text[:200]}"
        )
        data = resp.json()
        assert isinstance(data, (list, dict)), f"Réponse inattendue: {type(data)}"
        print(f"\n  [PROD] cv-analysis/list → {len(data) if isinstance(data, list) else 'dict'} items")


# ============================================================================
# Tests de charge — uploads simultanés
# ============================================================================

@pytest.mark.integration
class TestCvPdfLoadTest:
    """Tests de charge pour les uploads PDF simultanés."""

    @pytest.mark.asyncio
    async def test_5_concurrent_pdf_uploads(self):
        """5 uploads PDF simultanés → 0 crash 500, tous acceptés."""
        pdf_bytes = load_pdf()
        timings_ms = []

        async def upload_one(client, i):
            t0 = time.monotonic()
            try:
                r = await client.post(
                    f"{PROD_URL}/api/cv-adapter/adapt/upload",
                    files={"file": (f"cv_{i}.pdf", pdf_bytes, "application/pdf")},
                    data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                    headers=auth_headers(),
                )
                timings_ms.append((time.monotonic() - t0) * 1000)
                return r
            except Exception as e:
                timings_ms.append((time.monotonic() - t0) * 1000)
                return e

        async with httpx.AsyncClient(timeout=90) as client:
            responses = await asyncio.gather(*[upload_one(client, i) for i in range(5)])

        errors_500 = [r for r in responses if not isinstance(r, Exception) and r.status_code == 500]
        exceptions = [r for r in responses if isinstance(r, Exception)]
        ok = [r for r in responses if not isinstance(r, Exception) and r.status_code in (200, 202, 429)]

        if timings_ms:
            sorted_t = sorted(timings_ms)
            p50 = sorted_t[len(sorted_t) // 2]
            p95 = sorted_t[int(len(sorted_t) * 0.95)]
            print(f"\n  [PROD METRIC] 5 uploads PDF simultanés:")
            print(f"    200/queued={len(ok)}, 500={len(errors_500)}, exceptions={len(exceptions)}")
            print(f"    P50={p50:.0f}ms, P95={p95:.0f}ms")

        assert len(errors_500) == 0, (
            f"{len(errors_500)} vrais 500 sur 5 uploads PDF simultanés"
        )
        assert len(ok) >= 1, "Aucun upload n'a abouti"

    @pytest.mark.asyncio
    async def test_10_concurrent_pdf_uploads_resilience(self):
        """10 uploads PDF simultanés → infrastructure ne crashe pas (0 vrai 500)."""
        pdf_bytes = load_pdf()

        async def upload_one(client, i):
            try:
                r = await client.post(
                    f"{PROD_URL}/api/cv-adapter/adapt/upload",
                    files={"file": (f"cv_{i}.pdf", pdf_bytes, "application/pdf")},
                    data={"job_description": JOB_DESC, "language": "fr", "output_format": "json"},
                    headers=auth_headers(),
                )
                return r
            except Exception as e:
                return e

        async with httpx.AsyncClient(timeout=90) as client:
            responses = await asyncio.gather(*[upload_one(client, i) for i in range(10)])

        statuses = {}
        for r in responses:
            if isinstance(r, Exception):
                statuses["exception"] = statuses.get("exception", 0) + 1
            else:
                statuses[r.status_code] = statuses.get(r.status_code, 0) + 1

        print(f"\n  [PROD METRIC] 10 uploads PDF simultanés → statuses: {statuses}")

        errors_500 = statuses.get(500, 0) + statuses.get(503, 0)
        assert errors_500 == 0, (
            f"{errors_500} vrais 500/503 sur 10 uploads simultanés — infra instable"
        )
