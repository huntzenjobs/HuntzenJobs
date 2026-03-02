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
import json
import logging
import os
import tempfile
from typing import Any, Optional

from groq import Groq
from langchain_groq import ChatGroq

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings
from src.models.schemas import ATSScore, CVAnalysisResponse, TrainingRecommendation

logger = logging.getLogger(__name__)


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
        
        logger.info(f"[{self.name}] Initialized 4 sub-agents")
    
    @property
    def docling_converter(self):
        """Lazy load Docling converter."""
        if self._docling_converter is None:
            from docling.document_converter import DocumentConverter
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.datamodel.base_models import InputFormat

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
        job_description: Optional[str] = None,
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
            # Run sub-agents in parallel
            tasks = [
                self._score_ats(cv_text),
                self._extract_skills(cv_text),
                self._get_improvements(cv_text),
            ]
            
            # Add job matching if description provided
            if job_description:
                tasks.append(self._match_job(cv_text, job_description))
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            ats_result = results[0] if isinstance(results[0], dict) else {}
            skills_result = results[1] if isinstance(results[1], dict) else {}
            improvements_result = results[2] if isinstance(results[2], dict) else {}
            job_match_result = results[3] if len(results) > 3 and isinstance(results[3], dict) else {}
            
            # Build response (with score capping to prevent validation errors)
            return {
                "success": True,
                "ats_score": ATSScore(
                    total=min(ats_result.get("total", 0), 100),
                    format_score=min(ats_result.get("format_score", 0), 20),
                    keywords_score=min(ats_result.get("keywords_score", 0), 30),
                    experience_score=min(ats_result.get("experience_score", 0), 25),
                    skills_score=min(ats_result.get("skills_score", 0), 15),
                    education_score=min(ats_result.get("education_score", 0), 10),
                ),
                "skills": skills_result,
                "improvements": improvements_result,
                "job_match": job_match_result if job_description else None,
                "strengths": self._extract_strengths(ats_result, skills_result),
                "weaknesses": self._extract_weaknesses(ats_result, improvements_result),
            }
            
        except Exception as e:
            logger.error(f"[{self.name}] Analysis error: {e}")
            return {
                "success": False,
                "error": str(e),
                "strengths": [],
                "weaknesses": [],
            }
    
    async def _score_ats(self, cv_text: str) -> dict:
        """Score CV for ATS compatibility."""
        result = await self.ats_scorer.run(task=f"Score this CV:\n\n{cv_text}")
        return self._parse_json(result) or {}
    
    async def _extract_skills(self, cv_text: str) -> dict:
        """Extract skills from CV."""
        result = await self.skill_extractor.run(task=f"Extract skills:\n\n{cv_text}")
        return self._parse_json(result) or {}
    
    async def _match_job(self, cv_text: str, job_description: str) -> dict:
        """Match CV against job description."""
        task = f"CV:\n{cv_text}\n\nJob Description:\n{job_description}"
        result = await self.job_matcher.run(task=task)
        return self._parse_json(result) or {}
    
    async def _get_improvements(self, cv_text: str) -> dict:
        """Get improvement suggestions."""
        result = await self.improvement_advisor.run(task=f"Suggest improvements:\n\n{cv_text}")
        return self._parse_json(result) or {}
    
    def _extract_strengths(self, ats_result: dict, skills_result: dict) -> list[str]:
        """Extract strengths from analysis."""
        strengths = []
        
        # From ATS breakdown
        breakdown = ats_result.get("breakdown", {})
        for key, value in breakdown.items():
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
        Extract text from PDF using Docling (high quality) with pypdf fallback.

        Args:
            pdf_bytes: PDF file content

        Returns:
            Extracted text as markdown
        """
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            loop = asyncio.get_event_loop()
            doc = await loop.run_in_executor(
                None,
                lambda: self.docling_converter.convert(tmp_path).document
            )
            return doc.export_to_markdown()
        except Exception as docling_exc:
            logger.warning(
                f"[cv_analyzer] Docling extraction failed, falling back to pypdf: {docling_exc}"
            )
            try:
                import io
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(pdf_bytes))
                text = "\n".join(
                    page.extract_text() or "" for page in reader.pages
                )
                if not text.strip():
                    raise ValueError("pypdf extracted no text from PDF")
                return text
            except Exception as pypdf_exc:
                logger.error(f"[cv_analyzer] pypdf fallback also failed: {pypdf_exc}")
                raise pypdf_exc
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
    job_description: Optional[str] = None,
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
