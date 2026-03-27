"""
Job Scout Conversational Agent
================================
Expert conversationnel en recherche d'emploi.

Cet agent guide l'utilisateur dans sa recherche d'emploi avec:
- Stratégies de recherche personnalisées
- Analyse du marché de l'emploi
- Conseils sur les meilleures plateformes
- Techniques de networking
"""

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.base import AgentConfig, BaseAgent
from src.config.settings import settings

LANG_INSTRUCTIONS = {
    "fr": "Réponds TOUJOURS en français",
    "en": "Always respond in English",
    "es": "Responde SIEMPRE en español",
    "pt": "Responde SEMPRE em português",
}


class JobScoutConversationalAgent(BaseAgent):
    """
    Agent conversationnel expert en recherche d'emploi.

    Fournit des conseils personnalisés, des stratégies de recherche,
    et une expertise sur le marché de l'emploi.
    """

    def __init__(self):
        config = AgentConfig(
            name="JobScoutConversational",
            description="Expert conversationnel en recherche d'emploi et stratégies de carrière",
            model=settings.llm_model_powerful,  # Use powerful model for expert advice
            temperature=0.7,  # More creative for personalized advice
            max_tokens=2048,
        )
        super().__init__(config)

    def _get_system_prompt(self, language: str = "fr") -> str:
        """Build the system prompt with the appropriate language instruction."""
        lang_instruction = LANG_INSTRUCTIONS.get(language, LANG_INSTRUCTIONS["fr"])
        return f"""Tu es un Expert en Recherche d'Emploi certifié avec 15 ans d'expérience.

🎯 TON RÔLE:
Tu guides les chercheurs d'emploi avec des stratégies personnalisées et des conseils pratiques.

💡 TES EXPERTISES:
- Stratégies de recherche d'emploi sur mesure
- Analyse du marché de l'emploi et des tendances
- Optimisation de profils LinkedIn et réseaux professionnels
- Techniques de networking efficaces
- Identification des opportunités cachées
- Préparation aux processus de recrutement

✅ TON APPROCHE:
1. Écoute active pour comprendre les objectifs et contraintes
2. Questions ciblées pour affiner la stratégie
3. Conseils actionnables et personnalisés
4. Exemples concrets et success stories
5. Plan d'action étape par étape

🎨 TON STYLE:
- Encourageant et motivant
- Pragmatique et orienté résultats
- Humain et empathique
- Professionnel mais accessible

⚠️ IMPORTANT:
- Pose des questions pour mieux comprendre le contexte
- Adapte tes conseils au profil de l'utilisateur
- Propose des actions concrètes et mesurables
- Reste positif et constructif
- {lang_instruction}
"""

    async def run(
        self,
        message: str,
        history: list[dict] | None = None,
        language: str = "fr",
    ) -> dict[str, Any]:
        """
        Execute conversational job search guidance.

        Args:
            message: User's message
            history: Conversation history
            language: Response language (fr/en)

        Returns:
            Dictionary with response and metadata
        """
        try:
            # Build messages for LLM
            messages = [SystemMessage(content=self._get_system_prompt(language))]

            # Add conversation history
            if history:
                for msg in history[-6:]:  # Keep last 6 messages for context
                    if msg["role"] == "user":
                        messages.append(HumanMessage(content=msg["content"]))
                    elif msg["role"] == "assistant":
                        messages.append(AIMessage(content=msg["content"]))

            # Add current message
            messages.append(HumanMessage(content=message))

            # Generate response
            response = await self.llm.ainvoke(messages)

            return {
                "success": True,
                "response": response.content,
                "language": language,
                "metadata": {
                    "agent": "job-scout-conversational",
                    "model": self.config.model,
                }
            }

        except Exception as e:
            self.logger.error(f"Error in conversational job scout: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "Désolé, une erreur est survenue. Pouvez-vous reformuler votre question ?"
            }
