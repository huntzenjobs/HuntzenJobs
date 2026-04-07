"""
CV Analyzer - Main Agent
=========================
Orchestrates sub-agents for comprehensive CV analysis.

Sub-agents:
1. ATSScorer - Scores CV for ATS compatibility
2. SkillExtractor - Extracts and categorizes skills
3. JobMatcher - Matches CV against job descriptions
4. ImprovementAdvisor - Suggests CV improvements
"""

import asyncio
import hashlib
import json
import logging
import os
import tempfile
from typing import Any

from src.utils.cache import get_redis

from groq import Groq

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings
from src.models.schemas import ATSScore

logger = logging.getLogger(__name__)

HUNTZEN_CV_MARKERS = ["HuntZen Jobs", "Optimisé par HuntZen", "HuntZen ATS", "huntzenjobs.com", "HuntZen ATS Certified"]


class CVAnalyzerAgent(BaseAgent):
    """
    CV Analyzer Agent with deep sub-agent architecture.

    Orchestrates:
    - ATS scoring for resume optimization
    - Skill extraction and categorization
    - Job matching analysis
    - Improvement recommendations
    """

    def __init__(self):
        """Initialize the CV Analyzer with its sub-agents."""
        config = AgentConfig(
            name="CVAnalyzer",
            model=settings.llm_model_powerful,
            temperature=0.1,
            max_tokens=4096,
            system_prompt_file="cv_analyzer_context.txt",
        )
        super().__init__(config)

        # Groq client for JSON mode
        self.groq_client = Groq(api_key=settings.get_groq_key())

        # Docling converter (lazy loaded)
        self._docling_converter = None

        # Initialize sub-agents
        self._init_sub_agents()

    def _init_sub_agents(self) -> None:
        """Initialize specialized sub-agents."""
        self.ats_scorer = SubAgent(
            name="ATSScorer",
            system_prompt=load_prompt("cv_ats_scorer.txt"),
            model=settings.llm_model_powerful,
            temperature=0.1,
            max_tokens=1024,
        )
        self.register_sub_agent(self.ats_scorer)

        self.skill_extractor = SubAgent(
            name="SkillExtractor",
            system_prompt=load_prompt("cv_skill_extractor.txt"),
            temperature=0.1,
            max_tokens=1024,
        )
        self.register_sub_agent(self.skill_extractor)

        self.job_matcher = SubAgent(
            name="JobMatcher",
            system_prompt=load_prompt("cv_job_matcher.txt"),
            model=settings.llm_model_powerful,
            temperature=0.1,
            max_tokens=1024,
        )
        self.register_sub_agent(self.job_matcher)

        self.improvement_advisor = SubAgent(
            name="ImprovementAdvisor",
            system_prompt=load_prompt("cv_improvement_advisor.txt"),
            temperature=0.2,
            max_tokens=1024,
        )
        self.register_sub_agent(self.improvement_advisor)

        self.info_extractor = SubAgent(
            name="InfoExtractor",
            system_prompt=load_prompt("cv_info_extractor.txt"),
            temperature=0.1,
            max_tokens=512,
        )
        self.register_sub_agent(self.info_extractor)

        logger.info(f"[{self.name}] Initialized 4 sub-agents")

    @property
    def docling_converter(self):
        """Lazy load Docling converter."""
        if self._docling_converter is None:
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.document_converter import DocumentConverter

            logger.info(f"[{self.name}] Initializing Docling converter...")
            # CVs are text-based PDFs — OCR is unnecessary and triggers
            # RapidOCR model downloads that fail in non-root containers
            pdf_options = PdfPipelineOptions(do_ocr=False)
            self._docling_converter = DocumentConverter(
                format_options={InputFormat.PDF: pdf_options}
            )
            logger.info(f"[{self.name}] Docling ready (OCR disabled for text-based PDFs)")
        return self._docling_converter

    async def run(
        self,
        cv_text: str,
        job_description: str | None = None,
        language: str = "fr",
    ) -> dict[str, Any]:
        """
        Execute comprehensive CV analysis.

        Args:
            cv_text: CV content as text
            job_description: Optional job description for matching
            language: Response language

        Returns:
            Complete analysis results
        """
        try:
            # ── BASIC GUARD: reject non-CV or too-short content ─────────────────
            minimal_len = 500
            cv_lower = (cv_text or "").lower()
            cv_keywords = [
                "experience",
                "expérience",
                "work",
                "emploi",
                "employment",
                "education",
                "formation",
                "skills",
                "compétence",
            ]

            if len(cv_lower) < minimal_len or not any(k in cv_lower for k in cv_keywords):
                msg = "Document non reconnu comme CV (texte trop court ou sections clés absentes)."
                return {
                    "success": False,
                    "error": msg,
                    "ats_score": 0,
                    "overall_score": 0,
                    "ats_details": {
                        "total": 0,
                        "overall_score": 0,
                        "format_score": 0,
                        "keywords_score": 0,
                        "experience_score": 0,
                        "skills_score": 0,
                        "education_score": 0,
                    },
                    "skills": {},
                    "improvements": {"content_improvements": [msg]},
                    "cv_info": {},
                    "job_match": None,
                    "job_match_score": None,
                    "verdict": msg,
                    "strengths": [],
                    "weaknesses": [msg],
                    "recommended_job_titles": [],
                }

            # Détecter si le CV vient du pipeline HuntZen
            is_huntzen_optimized = bool(cv_text) and any(marker in cv_text for marker in HUNTZEN_CV_MARKERS)

            # ── CACHE LAYER ──
            cv_hash = hashlib.md5(cv_text.encode()).hexdigest()
            cache_key = f"cv:analysis:{cv_hash}"
            
            redis = await get_redis()
            cached_data = None
            if redis:
                try:
                    raw = await redis.get(cache_key)
                    if raw:
                        cached_data = json.loads(raw)
                        logger.info(f"[{self.name}] Cache HIT for CV analysis")
                except Exception as e:
                    logger.warning(f"[{self.name}] Cache read error: {e}")

            # Run sub-agents in parallel
            tasks = []
            
            # 1. ATS Scoring
            if cached_data and "ats_result" in cached_data:
                ats_task = asyncio.create_task(asyncio.sleep(0, cached_data["ats_result"]))
            else:
                ats_task = self._score_ats(cv_text, language)
            tasks.append(ats_task)

            # 2. Skill Extraction
            if cached_data and "skills_result" in cached_data:
                skills_task = asyncio.create_task(asyncio.sleep(0, cached_data["skills_result"]))
            else:
                skills_task = self._extract_skills(cv_text, language)
            tasks.append(skills_task)

            # 3. Improvements
            if cached_data and "improvements_result" in cached_data:
                imp_task = asyncio.create_task(asyncio.sleep(0, cached_data["improvements_result"]))
            else:
                imp_task = self._get_improvements(cv_text, language)
            tasks.append(imp_task)

            # 4. Identity Info
            if cached_data and "info_result" in cached_data:
                info_task = asyncio.create_task(asyncio.sleep(0, cached_data["info_result"]))
            else:
                info_task = self._extract_info(cv_text, language)
            tasks.append(info_task)

            # 5. Job matching (JD-dependent, NEVER CACHED by CV alone)
            if job_description:
                tasks.append(self._match_job(cv_text, job_description, language))

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results safely
            ats_result = results[0] if isinstance(results[0], dict) else {}
            skills_result = results[1] if isinstance(results[1], dict) else {}
            improvements_result = results[2] if isinstance(results[2], dict) else {}
            info_result = results[3] if isinstance(results[3], dict) else {}
            job_match_result = results[4] if len(results) > 4 and isinstance(results[4], dict) else {}

            # ── SAVE TO CACHE ──
            if redis and not cached_data:
                try:
                    to_cache = {
                        "ats_result": ats_result,
                        "skills_result": skills_result,
                        "improvements_result": improvements_result,
                        "info_result": info_result,
                    }
                    await redis.setex(cache_key, 86400, json.dumps(to_cache))
                except Exception as e:
                    logger.warning(f"[{self.name}] Cache write error: {e}")

            if is_huntzen_optimized:
                improvements_result = self._filter_improvements_for_certified_cv(improvements_result)

            recommended_titles = self._extract_recommended_titles(skills_result)
            match_total = job_match_result.get("match_score") if job_description else None
            match_verdict = job_match_result.get("verdict", "") if job_description else ""

            # ── SIMPLE CV/JD ALIGNMENT CHECK ──
            if job_description:
                jd_words = {w.strip(' ,.;:\n\t').lower() for w in job_description.split() if len(w) > 3}
                tech_skills = skills_result.get("technical_skills") or []
                extracted_skills = {str(s).lower() for s in tech_skills if s}
                overlap = jd_words.intersection(extracted_skills)
                if not overlap:
                    msg = (
                        "CV et offre semblent peu alignés : ajoutez les compétences clés de l'offre "
                        "(ex: CI/CD, cloud provider, IaC, monitoring, sécurité)."
                    )
                    if isinstance(improvements_result, dict):
                        improvements_result.setdefault("content_improvements", [])
                        if msg not in improvements_result["content_improvements"]:
                            improvements_result["content_improvements"].append(msg)

            ats_total = min(ats_result.get("total", 0), 100)
            match_total = job_match_result.get("match_score") if job_description else None
            match_verdict = job_match_result.get("verdict", "") if job_description else ""

            return {
                "success": True,
                "ats_score": ats_total,
                "overall_score": match_total if job_description else ats_total,
                "ats_details": {
                    "total": ats_total,
                    "overall_score": ats_total,
                    "format_score": min(ats_result.get("format_score", 0), 20),
                    "keywords_score": min(ats_result.get("keywords_score", 0), 30),
                    "experience_score": min(ats_result.get("experience_score", 0), 25),
                    "skills_score": min(ats_result.get("skills_score", 0), 15),
                    "education_score": min(ats_result.get("education_score", 0), 10),
                },
                "skills": skills_result,
                "improvements": improvements_result,
                "cv_info": info_result,
                "job_match": job_match_result if job_description else None,
                "job_match_score": match_total,
                "verdict": match_verdict,
                "strengths": self._extract_strengths(ats_result, skills_result),
                "weaknesses": self._extract_weaknesses(ats_result, improvements_result),
                "recommended_job_titles": recommended_titles,
            }

        except Exception as e:
            logger.error(f"[{self.name}] Analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "strengths": [],
                "weaknesses": [],
            }

    async def _score_ats(self, cv_text: str, language: str = "en") -> dict:
        """Score CV for ATS compatibility."""
        task = f"Score this CV in {language}:\n\n{cv_text}"
        result = await self.ats_scorer.run(task=task)
        return self._parse_json(result) or {}

    async def _extract_skills(self, cv_text: str, language: str = "en") -> dict:
        """Extract skills from CV."""
        task = f"Extract skills in {language}:\n\n{cv_text}"
        result = await self.skill_extractor.run(task=task)
        return self._parse_json(result) or {}

    async def _match_job(self, cv_text: str, job_description: str, language: str = "en") -> dict:
        """Match CV against job description."""
        task = f"Respond in {language}.\n\nCV:\n{cv_text}\n\nJob Description:\n{job_description}"
        result = await self.job_matcher.run(task=task)
        return self._parse_json(result) or {}

    async def _get_improvements(self, cv_text: str, language: str = "en") -> dict:
        """Get CV improvements."""
        return await self.delegate_to("ImprovementAdvisor", task=cv_text, context=f"Language: {language}")

    async def _extract_info(self, cv_text: str, language: str = "en") -> dict:
        """Extract identity info from CV."""
        res = await self.delegate_to("InfoExtractor", task=cv_text, context=f"Language: {language}")
        return self._parse_json(res) or {}

    def _extract_recommended_titles(self, skills_result: dict) -> list[str]:
        """Extraire les titres de poste recommandés depuis l'analyse des skills."""
        titles = skills_result.get("suggested_job_titles", [])
        if isinstance(titles, list):
            return [str(t) for t in titles[:4] if t]
        return []

    def _filter_improvements_for_certified_cv(self, improvements: dict) -> dict:
        """Supprimer les suggestions de format ATS pour les CV déjà certifiés HuntZen."""
        filtered = dict(improvements)
        ats_format_keywords = [
            "section", "en-tête", "header", "format", "police", "font",
            "structure", "template", "mise en page", "layout"
        ]
        content = filtered.get("content_improvements", [])
        if isinstance(content, list):
            filtered["content_improvements"] = [
                s for s in content
                if not any(kw in str(s).lower() for kw in ats_format_keywords)
            ]
        return filtered

    def _extract_strengths(self, ats_result: dict, skills_result: dict) -> list[str]:
        """Extract strengths from analysis."""
        strengths = []

        # From ATS breakdown
        breakdown = ats_result.get("breakdown", {})
        for _key, value in breakdown.items():
            if any(word in str(value).lower() for word in ["good", "strong", "clear", "well", "excellent"]):
                strengths.append(value)

        # From Soft/Technical Skills (Top ones)
        tech_skills = skills_result.get("technical_skills", [])[:3]
        if tech_skills:
            strengths.append(f"Strong proficiency in: {', '.join(tech_skills)}")

        if skills_result.get("certifications"):
            strengths.append(f"Has {len(skills_result['certifications'])} certifications")

        return strengths[:5]

    def _extract_weaknesses(self, ats_result: dict, improvements_result: dict) -> list[str]:
        """Extract weaknesses from analysis."""
        weaknesses = []

        if ats_result.get("total", 100) < 70:
            weaknesses.append(f"ATS score ({ats_result.get('total')}) is below optimal criteria")

        missing = improvements_result.get("missing_sections", [])
        if missing:
            weaknesses.extend([f"Missing section: {m}" for m in missing[:2]])

        content_tips = improvements_result.get("content_improvements", [])
        if content_tips:
            weaknesses.extend(content_tips[:2])

        return weaknesses[:5]

    async def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """
        Extract text from PDF using Docling, with pypdf fallback.

        Args:
            pdf_bytes: PDF file content

        Returns:
            Extracted text as markdown
        """
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        docling_text = None
        docling_exc = None
        try:
            loop = asyncio.get_event_loop()
            doc = await loop.run_in_executor(
                None,
                lambda: self.docling_converter.convert(tmp_path).document
            )
            docling_text = doc.export_to_markdown()
        except Exception as exc:
            docling_exc = exc
            logger.warning(
                f"[{self.name}] Docling extraction failed ({exc}), falling back to pypdf"
            )

        # If Docling succeeded but returned insufficient text (< 100 chars),
        # try pypdf before giving up — Docling with do_ocr=False can silently
        # return empty/minimal text for design-heavy PDFs.
        MIN_TEXT_CHARS = 100
        if docling_text and len(docling_text.strip()) >= MIN_TEXT_CHARS:
            return docling_text

        if docling_text is not None and len(docling_text.strip()) < MIN_TEXT_CHARS:
            logger.warning(
                f"[{self.name}] Docling returned only {len(docling_text.strip())} chars "
                "(< 100), trying pypdf fallback"
            )

        # pypdf is a Docling transitive dependency — always available.
        # It works for text-based PDFs without requiring system libraries.
        try:
            import io as _io

            from pypdf import PdfReader
            reader = PdfReader(_io.BytesIO(pdf_bytes))
            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
            if text:
                return text
            raise RuntimeError("pypdf returned empty text")
        except Exception as pypdf_exc:
            if docling_exc:
                raise RuntimeError(
                    f"All PDF extraction methods failed. "
                    f"Docling: {docling_exc}. pypdf: {pypdf_exc}."
                ) from None
            raise RuntimeError(
                f"Docling returned insufficient text ({len((docling_text or '').strip())} chars). "
                f"pypdf fallback also failed: {pypdf_exc}. "
                "The PDF may be image-based (scanned) or use unsupported encoding."
            ) from None
        finally:
            os.unlink(tmp_path)

    async def analyze_ats_only(self, cv_text: str) -> dict:
        """
        Quick ATS-only analysis.

        Args:
            cv_text: CV content

        Returns:
            ATS score and breakdown
        """
        return await self._score_ats(cv_text)

    async def match_with_job(self, cv_text: str, job_description: str) -> dict:
        """
        Match CV against specific job.

        Args:
            cv_text: CV content
            job_description: Job posting content

        Returns:
            Match analysis
        """
        return await self._match_job(cv_text, job_description)


def get_cv_analyzer() -> CVAnalyzerAgent:
    """
    Get CVAnalyzer singleton instance.

    DEPRECATED: This function is maintained for backward compatibility only.
    New code should use src.api.deps.get_cv_analyzer_main() instead, which provides
    thread-safe singleton initialization.

    Returns:
        CVAnalyzerAgent singleton instance (thread-safe via deps.py)
    """
    from src.api.deps import get_cv_analyzer_main
    return get_cv_analyzer_main()


async def analyze_cv(
    cv_text: str,
    job_description: str | None = None,
    language: str = "fr",
) -> dict[str, Any]:
    """
    Utility function for CV analysis.

    Args:
        cv_text: CV content
        job_description: Optional job description
        language: Response language

    Returns:
        Analysis results
    """
    analyzer = get_cv_analyzer()
    return await analyzer.run(cv_text=cv_text, job_description=job_description, language=language)
