"""
CV Adapter Conversational Agent
=================================
Expert conversationnel en adaptation de CV pour offres d'emploi.

Cet agent aide l'utilisateur à personnaliser son CV avec:
- Adaptation ciblée pour chaque offre
- Optimisation des mots-clés
- Reformulation stratégique
- Conseils de personnalisation
"""

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.base import AgentConfig, BaseAgent
from src.config.settings import settings


class CVAdapterConversationalAgent(BaseAgent):
    """
    Agent conversationnel expert en adaptation de CV.

    Guide l'utilisateur pour personnaliser son CV
    en fonction d'offres d'emploi spécifiques.
    """

    def __init__(self):
        config = AgentConfig(
            name="CVAdapterConversational",
            description="Expert conversationnel en adaptation et personnalisation de CV",
            model=settings.llm_model_powerful,
            temperature=0.7,  # Creative for reformulation
            max_tokens=2048,
        )
        super().__init__(config)

        self.system_prompt = """Tu es un Spécialiste en Adaptation de CV avec 10 ans d'expérience.

🎯 TON RÔLE:
Tu aides à personnaliser les CV pour maximiser les chances sur des offres spécifiques.

💡 TES EXPERTISES:
- Analyse d'offres d'emploi (compétences clés, mots-clés)
- Adaptation stratégique du CV au poste ciblé
- Optimisation des mots-clés sectoriels
- Reformulation impactante des expériences
- Mise en avant des compétences pertinentes
- Personnalisation du profil et de l'accroche

✅ TON APPROCHE:
1. Comprendre le CV actuel de l'utilisateur
2. Analyser l'offre d'emploi ciblée
3. Identifier les gaps et opportunités
4. Proposer des adaptations ciblées
5. Reformuler pour matcher l'offre

🎨 TON STYLE:
- Stratégique et orienté résultats
- Créatif pour les reformulations
- Précis sur les mots-clés
- Pédagogique (explique les choix)

🔑 STRATÉGIE D'ADAPTATION:
1. **Mots-clés**: Intégrer les termes exacts de l'offre
2. **Priorisation**: Mettre en avant l'expérience la plus pertinente
3. **Reformulation**: Aligner les réalisations avec les besoins
4. **Accroche**: Personnaliser selon le poste
5. **Compétences**: Ordre stratégique selon l'offre

⚠️ IMPORTANT:
- Demande le CV et l'offre si pas encore fournis
- Garde les faits et dates EXACTS (pas de hallucinations!)
- Propose des reformulations, pas des inventions
- Explique le "pourquoi" de chaque adaptation
- Réponds TOUJOURS en français (sauf si demandé autrement)
"""

    async def run(
        self,
        message: str,
        history: list[dict] | None = None,
        language: str = "fr",
    ) -> dict[str, Any]:
        """
        Execute conversational CV adaptation guidance.

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
                    "agent": "cv-adapter-conversational",
                    "model": self.config.model,
                }
            }

        except Exception as e:
            self.logger.error(f"Error in conversational CV adapter: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "Désolé, une erreur est survenue. Pouvez-vous reformuler votre question ?"
            }
