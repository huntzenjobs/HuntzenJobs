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

        self.cv_validator = SubAgent(
            name="CVValidator",
            system_prompt=load_prompt("cv_validator.txt"),
            temperature=0.1,
            max_tokens=512,
        )
        self.register_sub_agent(self.cv_validator)

        self.cv_info_extractor = SubAgent(
            name="CVInfoExtractor",
            system_prompt=load_prompt("cv_info_extractor.txt"),
            temperature=0.1,
            max_tokens=512,
        )
        self.register_sub_agent(self.cv_info_extractor)

        logger.info(f"[{self.name}] Initialized 6 sub-agents")
    
    @property
    def docling_converter(self):
        """Lazy load Docling converter."""
        if self._docling_converter is None:
            from docling.document_converter import DocumentConverter
            logger.info(f"[{self.name}] Initializing Docling converter...")
            self._docling_converter = DocumentConverter()
            logger.info(f"[{self.name}] Docling ready")
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
            # Step 1: Validate CV first (early return if invalid)
            logger.info(f"[{self.name}] Validating CV...")
            validation_result = await self._validate_cv(cv_text)

            if not validation_result.get("is_valid", False):
                logger.warning(f"[{self.name}] CV validation failed: {validation_result.get('reason')}")
                return {
                    "success": False,
                    "error": validation_result.get("error_message", "Ce fichier ne semble pas être un CV valide."),
                    "validation": validation_result
                }

            logger.info(f"[{self.name}] CV validated successfully")

            # Step 2: Get ATS score first (needed for improvements scoring)
            ats_result = await self._score_ats(cv_text)

            # Step 3: Run remaining sub-agents in parallel (including CV info extraction)
            tasks = [
                self._extract_skills(cv_text),
                self._get_improvements(cv_text, ats_result.get("total", 0)),  # Pass current score
                self._extract_cv_info(cv_text),  # NEW: Extract CV info
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
                "cv_info": cv_info_result,  # NEW: Include CV info
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
    
    async def _get_improvements(self, cv_text: str, current_score: int = 0) -> dict:
        """Get improvement suggestions."""
        task_prompt = f"Current ATS Score: {current_score}/100\n\nSuggest improvements:\n\n{cv_text}"
        result = await self.improvement_advisor.run(task=task_prompt)
        return self._parse_json(result) or {}

    async def _validate_cv(self, cv_text: str) -> dict:
        """Validate if extracted text is a real CV."""
        # Only check first 2000 chars for performance
        sample_text = cv_text[:2000]
        result = await self.cv_validator.run(task=f"Validate this CV:\n\n{sample_text}")
        return self._parse_json(result) or {"is_valid": False, "error_message": "Validation error"}

    async def _extract_cv_info(self, cv_text: str) -> dict:
        """Extract personal information from CV."""
        result = await self.cv_info_extractor.run(task=f"Extract info:\n\n{cv_text}")
        logger.info(f"[CVInfoExtractor] Raw result: {result[:500] if result else 'None'}")
        parsed = self._parse_json(result)
        logger.info(f"[CVInfoExtractor] Parsed result: {parsed}")
        return parsed or {}

    def _extract_strengths(self, ats_result: dict, skills_result: dict) -> list[str]:
        """Extract strengths from analysis."""
        # Use strengths from ATS result if available
        strengths = ats_result.get("strengths", [])

        # Fallback: extract from breakdown if no strengths provided
        if not strengths:
            breakdown = ats_result.get("breakdown", {})
            for key, value in breakdown.items():
                # Look for positive French keywords
                if any(word in str(value).lower() for word in ["bon", "bien", "clair", "précis", "détaillé", "professionnel"]):
                    strengths.append(value)

        # Add certifications as strength if present
        if skills_result.get("certifications"):
            strengths.append(f"Possède {len(skills_result['certifications'])} certifications")

        return strengths[:5]
    
    def _extract_weaknesses(self, ats_result: dict, improvements_result: dict) -> list[str]:
        """Extract weaknesses from analysis."""
        # Use weaknesses from ATS result if available
        weaknesses = ats_result.get("weaknesses", [])

        # Fallback: add score warning if too low
        if not weaknesses and ats_result.get("total", 100) < 70:
            weaknesses.append("Score ATS inférieur à l'optimal (< 70)")

        # Add missing sections as weaknesses
        missing = improvements_result.get("missing_sections", [])
        if missing:
            weaknesses.extend(missing[:2])
        
        return weaknesses[:5]
    
    async def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """
        Extract text from PDF using Docling.
        
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


# Singleton instance
_analyzer_instance: Optional[CVAnalyzerAgent] = None


def get_cv_analyzer() -> CVAnalyzerAgent:
    """Get or create the singleton CVAnalyzer instance."""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = CVAnalyzerAgent()
    return _analyzer_instance


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
