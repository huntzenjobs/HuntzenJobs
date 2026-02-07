"""
CV Analyzer Conversational Agent
==================================
Expert conversationnel en analyse et optimisation de CV.

Cet agent aide l'utilisateur à améliorer son CV avec:
- Analyse ATS et scoring
- Conseils de structure et présentation
- Optimisation des mots-clés
- Recommandations personnalisées
"""

from typing import Any, Optional
from langchain_groq import ChatGroq
from langchain.schema import HumanMessage, SystemMessage, AIMessage

from src.agents.base import BaseAgent, AgentConfig
from src.config.settings import settings


class CVAnalyzerConversationalAgent(BaseAgent):
    """
    Agent conversationnel expert en analyse de CV.

    Fournit des analyses détaillées, des scores ATS,
    et des recommandations d'amélioration.
    """

    def __init__(self):
        config = AgentConfig(
            name="CVAnalyzerConversational",
            description="Expert conversationnel en analyse et optimisation de CV",
            model=settings.llm_model_powerful,
            temperature=0.6,  # Balanced for analysis and advice
            max_tokens=2048,
        )
        super().__init__(config)

        self.system_prompt = """Tu es un Expert CV certifié avec 12 ans d'expérience en recrutement et ATS.

🎯 TON RÔLE:
Tu analyses les CV et fournis des conseils d'optimisation pour maximiser l'impact.

💡 TES EXPERTISES:
- Analyse ATS (Applicant Tracking Systems) et compatibilité
- Scoring de CV selon les standards du marché
- Structure et mise en page optimale
- Optimisation des mots-clés sectoriels
- Rédaction impactante des réalisations
- Adaptation selon le niveau d'expérience

✅ TON APPROCHE:
1. Demande le CV ou les sections à analyser
2. Analyse approfondie avec scoring détaillé
3. Points forts et axes d'amélioration
4. Recommandations concrètes et priorisées
5. Exemples de reformulation

🎨 TON STYLE:
- Constructif et encourageant
- Précis et factuel
- Pédagogique (explique le "pourquoi")
- Orienté action

📊 CRITÈRES D'ANALYSE:
- Structure et lisibilité (25%)
- Mots-clés et pertinence (25%)
- Impact des réalisations (25%)
- Compatibilité ATS (25%)

⚠️ IMPORTANT:
- Demande le CV si pas encore fourni
- Donne un score global /100
- Priorise les améliorations par impact
- Propose des reformulations concrètes
- Réponds TOUJOURS en français (sauf si demandé autrement)
"""

    async def run(
        self,
        message: str,
        history: Optional[list[dict]] = None,
        language: str = "fr",
    ) -> dict[str, Any]:
        """
        Execute conversational CV analysis.

        Args:
            message: User's message
            history: Conversation history
            language: Response language (fr/en)

        Returns:
            Dictionary with response and metadata
        """
        try:
            # Build messages for LLM
            messages = [SystemMessage(content=self.system_prompt)]

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
                    "agent": "cv-analyzer-conversational",
                    "model": self.config.model,
                }
            }

        except Exception as e:
            self.logger.error(f"Error in conversational CV analyzer: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "Désolé, une erreur est survenue. Pouvez-vous reformuler votre question ?"
            }
