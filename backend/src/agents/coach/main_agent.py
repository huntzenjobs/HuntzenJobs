"""
Career Coach - Main Agent
==========================
Orchestrates sub-agents for comprehensive career guidance.

Sub-agents:
1. TrainingAdvisor - Recommends courses and certifications
2. CareerPlanner - Long-term career path planning
3. SkillAnalyzer - Analyzes and identifies skill gaps
"""

import json
import logging
from typing import Any, Optional

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings
from src.models.schemas import CoachResponse, TrainingRecommendation
from src.services.salary.service import get_realtime_salary

logger = logging.getLogger(__name__)


class CareerCoachAgent(BaseAgent):
    """
    Career Coach Agent with deep sub-agent architecture.
    
    Orchestrates specialized sub-agents for:
    - Training recommendations
    - Career path planning
    - Skill gap analysis
    """
    
    def __init__(self):
        """Initialize the Career Coach with its sub-agents."""
        config = AgentConfig(
            name="CareerCoach",
            model=settings.llm_model_powerful,
            temperature=0.5,
            max_tokens=2048,
            system_prompt_file="coach_main.txt",
        )
        super().__init__(config)
        
        # Initialize sub-agents
        self._init_sub_agents()
    
    def _init_sub_agents(self) -> None:
        """Initialize specialized sub-agents."""
        # Training Advisor
        self.training_advisor = SubAgent(
            name="TrainingAdvisor",
            system_prompt=load_prompt("coach_training_advisor.txt"),
            model=settings.llm_model_fast,
            temperature=0.2,
        )
        self.register_sub_agent(self.training_advisor)
        
        # Career Planner
        self.career_planner = SubAgent(
            name="CareerPlanner",
            system_prompt=load_prompt("coach_career_planner.txt"),
            model=settings.llm_model_fast,
            temperature=0.3,
        )
        self.register_sub_agent(self.career_planner)
        
        # Skill Analyzer
        self.skill_analyzer = SubAgent(
            name="SkillAnalyzer",
            system_prompt=load_prompt("coach_skill_analyzer.txt"),
            model=settings.llm_model_fast,
            temperature=0.1,
        )
        self.register_sub_agent(self.skill_analyzer)
        
        # Salary Advisor
        self.salary_advisor = SubAgent(
            name="SalaryAdvisor",
            system_prompt=load_prompt("coach_salary_advisor.txt"),
            model=settings.llm_model_powerful,
            temperature=0.3,
        )
        self.register_sub_agent(self.salary_advisor)

        # Parameter Extractor
        self.parameter_extractor = SubAgent(
            name="ParameterExtractor",
            system_prompt=load_prompt("parameter_extractor.txt"),
            model=settings.llm_model_fast,
            temperature=0.0,
        )
        self.register_sub_agent(self.parameter_extractor)
        
        logger.info(f"[{self.name}] Initialized 4 sub-agents")
    
    async def run(
        self,
        message: str,
        history: Optional[list[dict]] = None,
        language: str = "fr",
        deep_analysis: bool = False,
    ) -> dict[str, Any]:
        try:
            # Prepare language instruction
            lang_instruction = "" if language == "fr" else f"[Respond in {language.upper()}] "
            full_message = f"{lang_instruction}{message}"
            
            # Main conversation
            response = await self.chat(full_message, history)
            
            result = {
                "success": True,
                "response": response,
                "language": language,
                "training_suggestions": [],
                "career_insights": {},
            }
            
            # Deep analysis with sub-agents if requested
            if deep_analysis or self._should_invoke_sub_agents(message):
                insights = await self._gather_deep_insights(message)
                result["training_suggestions"] = insights.get("training", [])
                result["career_insights"] = insights.get("career", {})
            
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "response": "I'm sorry, an error occurred while processing your request.",
            }
    
    def _should_invoke_sub_agents(self, message: str) -> bool:
        """Determine if message requires deep analysis."""
        trigger_words = [
            "formation", "certification", "cours", "apprendre",
            "carrière", "évolution", "parcours", "plan",
            "compétences", "skills", "gap", "manque",
            "training", "career", "path", "learn",
            "salaire", "salary", "rémunération", "argent", "paye", "négocier", "combien",
        ]
        message_lower = message.lower()
        return any(word in message_lower for word in trigger_words)
    
    async def _gather_deep_insights(self, message: str) -> dict[str, Any]:
        """
        Gather insights from sub-agents.
        
        Args:
            message: User message for context
            
        Returns:
            Combined insights from sub-agents
        """
        insights = {"training": [], "career": {}}
        
        # 1. Get training recommendations
        try:
            training_result = await self.training_advisor.run(
                task=f"Recommend training for: {message}"
            )
            training_data = self._parse_json(training_result)
            
            if training_data and "recommendations" in training_data:
                recs = []
                for rec in training_data["recommendations"][:3]:
                    # Normalize level to English literal for Pydantic
                    level_raw = str(rec.get("level", "intermediate")).lower()
                    if "débutant" in level_raw or "begin" in level_raw:
                        level = "beginner"
                    elif "avancé" in level_raw or "expert" in level_raw or "advance" in level_raw:
                        level = "advanced"
                    else:
                        level = "intermediate"

                    try:
                        recs.append(
                            TrainingRecommendation(
                                name=rec.get("name", ""),
                                platform=rec.get("platform", ""),
                                duration=rec.get("duration"),
                                level=level,
                                reason=rec.get("reason", ""),
                            )
                        )
                    except Exception as ve:
                        logger.warning(f"[{self.name}] Invalid training recommendation: {ve}")
                insights["training"] = recs
        except Exception as e:
            logger.warning(f"[{self.name}] Training advisor failed: {e}")
        
        # 2. Get skill gap analysis
        try:
            skills_result = await self.skill_analyzer.run(
                task=f"Analyze skills for: {message}"
            )
            skills_data = self._parse_json(skills_result)
            
            if skills_data:
                insights["career"]["skill_gaps"] = skills_data.get("gaps", [])
                insights["career"]["strengths"] = skills_data.get("strengths_to_leverage", [])
        except Exception as e:
            logger.warning(f"[{self.name}] Skill analyzer failed: {e}")
                
        # 3. Get real-time salary insights if relevant
        try:
            if any(kw in message.lower() for kw in ["salaire", "salary", "argent", "paye", "négoci", "combien"]):
                # Extract parameters
                params_result = await self.parameter_extractor.run(task=message)
                params = self._parse_json(params_result) or {}
                
                job = params.get("job_title", message)
                cc = params.get("country_code", "fr")
                city = params.get("city", "")
                
                stats = await get_realtime_salary(job, cc, city)
                
                salary_result = await self.salary_advisor.run(
                    task=f"Analyze salary for: {message}",
                    context=f"Market data from Adzuna for {job} in {city or cc}: {json.dumps(stats)}"
                )
                salary_data = self._parse_json(salary_result)
                if salary_data:
                    insights["career"]["salary_insights"] = salary_data
        except Exception as e:
            logger.warning(f"[{self.name}] Salary advisor failed: {e}")
        
        return insights

    async def get_training_recommendations(
        self,
        domain: str,
        current_level: str = "intermediate",
        budget: str = "mixed",
    ) -> list[TrainingRecommendation]:
        """
        Get targeted training recommendations.
        
        Args:
            domain: Career domain (data, dev, security, etc.)
            current_level: beginner/intermediate/advanced
            budget: free/paid/mixed
            
        Returns:
            List of training recommendations
        """
        task = f"""
        Domain: {domain}
        Current Level: {current_level}
        Budget: {budget}
        
        Recommend the best training path with 3-5 specific courses/certifications.
        """
        
        result = await self.training_advisor.run(task=task)
        data = self._parse_json_response(result)
        
        if data and "recommendations" in data:
            return [
                TrainingRecommendation(
                    name=rec.get("name", ""),
                    platform=rec.get("platform", ""),
                    duration=rec.get("duration"),
                    level=rec.get("level", current_level),
                    reason=rec.get("reason", ""),
                )
                for rec in data["recommendations"]
            ]
        return []
    
    async def plan_career_path(
        self,
        current_role: str,
        target_role: str,
        years: int = 5,
    ) -> dict[str, Any]:
        """
        Generate a career progression plan.
        
        Args:
            current_role: Current job title
            target_role: Target job title
            years: Planning horizon in years
            
        Returns:
            Career path plan
        """
        task = f"""
        Current Role: {current_role}
        Target Role: {target_role}
        Timeline: {years} years
        
        Create a detailed career progression plan.
        """
        
        result = await self.career_planner.run(task=task)
        return self._parse_json_response(result) or {}


# Singleton instance
_coach_instance: Optional[CareerCoachAgent] = None


def get_career_coach() -> CareerCoachAgent:
    """Get or create the singleton CareerCoach instance."""
    global _coach_instance
    if _coach_instance is None:
        _coach_instance = CareerCoachAgent()
    return _coach_instance


async def career_coach_chat(
    message: str,
    history: Optional[list[dict]] = None,
    language: str = "fr",
) -> dict[str, Any]:
    """
    Utility function for career coach chat.
    
    Args:
        message: User message
        history: Conversation history
        language: Response language
        
    Returns:
        Coach response
    """
    coach = get_career_coach()
    return await coach.run(message=message, history=history, language=language)
