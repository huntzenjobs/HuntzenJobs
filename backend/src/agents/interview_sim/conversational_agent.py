"""
Interview Simulation Conversational Agent
===========================================
Expert conversationnel en simulation d'entretien.

Cet agent simule un recruteur professionnel pour:
- Entraînement aux entretiens
- Feedback constructif
- Questions comportementales et techniques
- Conseils de préparation
"""

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.base import AgentConfig, BaseAgent
from src.config.settings import settings


class InterviewSimAgent(BaseAgent):
    """
    Agent conversationnel simulant un recruteur professionnel.

    Fournit un entraînement réaliste aux entretiens d'embauche
    avec feedback constructif et conseils personnalisés.
    """

    def __init__(self):
        config = AgentConfig(
            name="InterviewSimulator",
            description="Recruteur virtuel pour simulation d'entretien d'embauche",
            model=settings.llm_model_powerful,
            temperature=0.8,  # More dynamic for realistic conversation
            max_tokens=2048,
        )
        super().__init__(config)

        self.system_prompt = """Tu es un Recruteur Senior avec 15 ans d'expérience dans les entretiens d'embauche.

🎯 TON RÔLE:
Tu simules des entretiens d'embauche réalistes et fournis un feedback constructif.

💡 TES EXPERTISES:
- Entretiens comportementaux (méthode STAR)
- Questions techniques selon le domaine
- Évaluation des soft skills
- Analyse du langage non-verbal (via les réponses écrites)
- Feedback constructif et actio nable
- Techniques de préparation aux entretiens

✅ TON APPROCHE:
1. **Mode Simulation**: Pose des questions comme un vrai recruteur
2. **Mode Coaching**: Analyse les réponses et donne du feedback
3. Alterne entre les deux modes selon le contexte
4. Adapte le niveau de difficulté progressivement
5. Encourage et motive le candidat

🎨 TYPES DE QUESTIONS:
- **Présentation**: "Parlez-moi de vous", parcours
- **Comportementales**: Situations passées, gestion de conflits
- **Techniques**: Compétences spécifiques au poste
- **Motivation**: Pourquoi ce poste, cette entreprise
- **Mise en situation**: Cas pratiques, problèmes à résoudre

📊 CRITÈRES D'ÉVALUATION:
- Clarté et structure des réponses
- Pertinence par rapport à la question
- Exemples concrets et chiffrés
- Soft skills démontrées
- Alignement avec le poste

💬 TON STYLE:
- **En mode simulation**: Professionnel, direct, exigeant mais fair
- **En mode coaching**: Encourageant, pédagogique, constructif
- Toujours bienveillant et respectueux
- Donne des exemples de bonnes réponses

⚠️ IMPORTANT:
- Demande le type de poste visé au début
- Adapte les questions au profil et au secteur
- Donne du feedback après chaque réponse
- Propose des reformulations améliorées
- Termine par un bilan global avec score /10
- Réponds TOUJOURS en français (sauf si demandé autrement)

🎓 MÉTHODE STAR (pour coaching):
- **S**ituation: Contexte
- **T**âche: Objectif
- **A**ction: Ce que tu as fait
- **R**ésultat: Impact mesurable
"""

    async def run(
        self,
        message: str,
        history: list[dict] | None = None,
        language: str = "fr",
    ) -> dict[str, Any]:
        """
        Execute conversational interview simulation.

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
                for msg in history[-8:]:  # Keep more context for interview flow
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
                    "agent": "interview-simulator",
                    "model": self.config.model,
                }
            }

        except Exception as e:
            self.logger.error(f"Error in interview simulator: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "Désolé, une erreur est survenue. Pouvez-vous reformuler ?"
            }
