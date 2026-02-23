"""
Personal Branding Agent
========================
AI-powered personal branding strategist for LinkedIn & X (Twitter).

State machine flow:
1. ONBOARDING — Discover user's background, career, goals
2. STYLE_DISCOVERY — Show example post styles, identify preference
3. TARGET_AUDIENCE — Who they want to reach, what topics to cover
4. GENERATION — Create posts matching their profile, style, and audience

The agent extracts structured data from the conversation and stores
it as "branding_state" in the conversation context. This way, when
the user comes back, the agent knows where it left off.
"""

import json
import logging
from typing import Any, Optional

from src.agents.base import AgentConfig, BaseAgent, load_prompt
from src.config.settings import settings

logger = logging.getLogger(__name__)

# Branding onboarding states
STATES = {
    "ONBOARDING": "onboarding",
    "STYLE_DISCOVERY": "style_discovery",
    "TARGET_AUDIENCE": "target_audience",
    "GENERATION": "generation",
}


class BrandingAgent(BaseAgent):
    """
    Personal Branding Agent with conversational state machine.
    
    Guides users through building their personal brand on LinkedIn & X:
    1. Learns their background and goals
    2. Discovers their preferred writing style
    3. Identifies their target audience and topics
    4. Generates personalized content
    """
    
    def __init__(self):
        """Initialize the Branding Agent."""
        config = AgentConfig(
            name="BrandingAgent",
            model=settings.llm_model_powerful,  # Needs strong FR + nuanced writing
            temperature=0.6,  # Creative but controlled
            max_tokens=2048,
            system_prompt_file="branding_main.txt",
        )
        super().__init__(config)
    
    async def run(
        self,
        message: str,
        history: Optional[list[dict]] = None,
        language: str = "fr",
        branding_state: Optional[dict] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Main execution — conversational branding assistant.
        
        Args:
            message: User's message
            history: Conversation history
            language: Response language (fr/en)
            branding_state: Current state of the branding profile
                            (state, profile data collected so far)
        
        Returns:
            {success, response, language, branding_state}
        """
        try:
            # Build state context to inject into the prompt
            state = branding_state or {"step": STATES["ONBOARDING"], "profile": {}}
            state_context = self._build_state_context(state)
            
            # Build messages with state context injected
            augmented_message = f"{state_context}\n\n{message}" if state_context else message
            messages = self.build_messages(augmented_message, history)
            
            # Call LLM
            response = await self.llm.ainvoke(messages)
            response_text = response.content
            
            # Try to extract any state updates from the response
            updated_state = self._extract_state_updates(response_text, state)
            
            return {
                "success": True,
                "response": response_text,
                "language": language,
                "branding_state": updated_state,
            }
            
        except Exception as e:
            logger.error(f"[BrandingAgent] Error: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "response": "Désolé, une erreur s'est produite. Réessayez.",
                "language": language,
            }
    
    def _build_state_context(self, state: dict) -> str:
        """
        Build a context string from the current branding state.
        
        This is injected before the user message so the LLM knows
        where we are in the flow and what we already know about the user.
        """
        step = state.get("step", STATES["ONBOARDING"])
        profile = state.get("profile", {})
        
        if not profile:
            return f"[ÉTAT ACTUEL: {step} — Aucune info collectée encore]"
        
        parts = [f"[ÉTAT ACTUEL: {step}]"]
        parts.append("[PROFIL BRANDING COLLECTÉ:]")
        
        if profile.get("background"):
            parts.append(f"- Parcours: {profile['background']}")
        if profile.get("current_role"):
            parts.append(f"- Poste actuel: {profile['current_role']}")
        if profile.get("industry"):
            parts.append(f"- Secteur: {profile['industry']}")
        if profile.get("goals"):
            parts.append(f"- Objectifs: {profile['goals']}")
        if profile.get("style_preference"):
            parts.append(f"- Style préféré: {profile['style_preference']}")
        if profile.get("target_audience"):
            parts.append(f"- Audience cible: {profile['target_audience']}")
        if profile.get("topics"):
            parts.append(f"- Sujets: {', '.join(profile['topics'])}")
        if profile.get("platforms"):
            parts.append(f"- Plateformes: {', '.join(profile['platforms'])}")
        
        return "\n".join(parts)
    
    def _extract_state_updates(self, response_text: str, current_state: dict) -> dict:
        """
        Try to extract structured state updates from the LLM response.
        
        The prompt instructs the LLM to include a JSON block at the end
        with any profile updates. If found, merge into current state.
        """
        state = current_state.copy()
        profile = state.get("profile", {}).copy()
        
        # Look for JSON state block in response
        parsed = self._parse_json(response_text)
        if parsed and "profile_update" in parsed:
            updates = parsed["profile_update"]
            for key, value in updates.items():
                if value:  # Only update non-empty values
                    profile[key] = value
            state["profile"] = profile
            
            # Auto-advance state based on what we know
            state["step"] = self._determine_step(profile)
        
        return state
    
    def _determine_step(self, profile: dict) -> str:
        """Determine which step we should be on based on collected data."""
        if not profile.get("background") and not profile.get("current_role"):
            return STATES["ONBOARDING"]
        if not profile.get("style_preference"):
            return STATES["STYLE_DISCOVERY"]
        if not profile.get("target_audience"):
            return STATES["TARGET_AUDIENCE"]
        return STATES["GENERATION"]
