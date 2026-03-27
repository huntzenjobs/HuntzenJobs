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
import re
from typing import Any

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings
from src.models.schemas import TrainingRecommendation
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
            model=settings.llm_model_fast,  # User-facing → needs jailbreak resistance (Llama 4)
            temperature=0.3,
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

    # ── Meta-message patterns (language switch, greetings, formatting) ──
    _META_PATTERNS = [
        r"^(salut|bonjour|hello|hi|hey|coucou|bonsoir)\b",
        r"\b(parle|répond[s]?|écri[st]|speak|write|answer|switch)\b.*(fran[çc]ais|fran[çc]aise|english|anglais|espagnol|spanish|arabe|arabic|allemand|german)",
        r"^(merci|thanks|thank you|ok|d'accord|compris|parfait|super|cool|nice)\W*$",
        r"\b(sois|be) (plus |more )?(concis|bref|court|short|detailed|détaillé)",
        r"^(oui|non|yes|no)\W*$",
    ]

    # ── Crisis/SOS patterns ──
    _CRISIS_PATTERNS = [
        r"\b(licenci[eé]|viré|fired|laid off|layoff|perdu.{0,10}(emploi|travail|job))\b",
        r"\b(burnout|burn.out|épuis[eé]|j.en.peux.plus|can.t take it)\b",
        r"\b(harcèlement|harcel[eé]|harassment|bullying|toxic|toxique)\b",
        r"\b(fin de droit|plus d.allocation|end of benefit|sans emploi)\b",
        r"\b(déprim[eé]|dépress|desperate|désespéré|urgent|au secours|help me)\b",
        r"\b(démission|resign|quit.{0,10}(job|travail|work)|rupture conventionnelle)\b",
    ]

    # ── Orientation/lost patterns ──
    _ORIENTATION_PATTERNS = [
        r"\b(sais pas quoi faire|don.t know what to do|perdu|lost|aucune idée)\b",
        r"\b(quel (métier|domaine|secteur|orientation)|what (career|job|field))\b",
        r"\b(reconversion|changer de (métier|voie|carrière)|career change|switch career)\b",
        r"\b(orientation|m.orienter|guidance|bilan de compétences)\b",
        r"\b(terminale|licence|master|bac\+?\d|étudiant|student|diplôm[eé])\b.{0,30}(quoi|what|comment|how|sais pas|don.t know)",
        r"\b(j.aime rien|nothing interests|je sais pas (ce que|quoi)|pas de passion)\b",
    ]

    def _is_meta_message(self, message: str) -> bool:
        """Detect messages that are about communication, not career content."""
        msg = message.strip().lower()
        if len(msg) < 5 and not any(c.isalpha() for c in msg):
            return True
        return any(re.search(p, msg, re.IGNORECASE) for p in self._META_PATTERNS)

    def _is_crisis_message(self, message: str) -> bool:
        """Detect SOS/crisis situations (layoff, burnout, harassment, etc.)."""
        msg = message.strip().lower()
        return any(re.search(p, msg, re.IGNORECASE) for p in self._CRISIS_PATTERNS)

    def _is_orientation_message(self, message: str) -> bool:
        """Detect orientation/exploration needs (lost, don't know what to do, student)."""
        msg = message.strip().lower()
        return any(re.search(p, msg, re.IGNORECASE) for p in self._ORIENTATION_PATTERNS)

    def _classify_message_needs(self, message: str) -> set[str]:
        """Classify which sub-agents are actually needed — avoids running all 4 for every query."""
        msg = message.lower()
        needs: set[str] = set()

        # Salary / compensation / negotiation
        salary_kw = [
            "salaire", "salary", "rémunération", "argent", "paye", "payer",
            "négocier", "négociation", "negotiate", "combien", "augmentation", "raise",
            "tjm", "taux journalier", "tarif", "daily rate",
            "brut", "net", "package", "offre salariale", "grille",
            "indemnité", "prime", "bonus", "equity", "stock", "bspce",
            "smic", "valeur marché", "market value", "worth",
            "charges", "urssaf", "superbrut", "coût employeur",
            "k€", "€/an", "€/mois", "€/jour", "€/j",
        ]
        if any(kw in msg for kw in salary_kw):
            needs.add("salary")

        # Training / learning / education
        training_kw = [
            "formation", "certification", "cours", "apprendre", "diplôme",
            "école", "training", "learn", "study", "course", "bootcamp",
            "cpf", "rncp", "vae", "bilan", "mooc",
        ]
        if any(kw in msg for kw in training_kw):
            needs.add("training")

        # Skills / competencies
        skills_kw = [
            "compétences", "skills", "gap", "manque", "améliorer",
            "improve", "atout", "force", "faiblesse", "transférable",
        ]
        if any(kw in msg for kw in skills_kw):
            needs.add("skills")

        # Career planning / paths
        career_kw = [
            "carrière", "évolution", "parcours", "plan", "reconversion",
            "transition", "career", "path", "progression", "promotion",
            "orientation", "métier", "avenir", "objectif",
        ]
        if any(kw in msg for kw in career_kw):
            needs.add("career")

        # Crisis → career planner + salary advisor (for indemnités, droits)
        if self._is_crisis_message(message):
            needs.update(["career", "salary"])

        # Orientation → career planner + training advisor
        if self._is_orientation_message(message):
            needs.update(["career", "training"])

        # Fallback: if nothing specific matched, run career + skills
        if not needs:
            needs = {"career", "skills"}

        return needs

    def _extract_user_profile(self, message: str, history: list[dict] | None = None) -> dict[str, str]:
        """
        Extract user domain, country, and level from the conversation history.
        Returns best-effort profile dict.
        """
        all_text = message
        if history:
            all_text = " ".join(
                m.get("content", "") for m in history if m.get("role") == "user"
            ) + " " + message

        text_lower = all_text.lower()

        # ── Domain detection ──
        domain_map = {
            "tech": ["développeur", "developer", "data", "devops", "frontend", "backend", "fullstack", "software", "cloud", "sre", "machine learning", "ia ", " ai ", "cybersécurité", "cybersecurity"],
            "healthcare": ["infirmier", "nurse", "médecin", "doctor", "pharmacien", "aide-soignant", "santé", "health", "hôpital", "hospital", "clinique"],
            "trades": ["électricien", "plombier", "soudeur", "chantier", "btp", "menuisier", "maçon", "couvreur", "plumber", "electrician", "welder"],
            "business": ["marketing", "commercial", "vente", "sales", "management", "rh", "ressources humaines", "comptab", "finance", "audit", "consultant", "gestion"],
            "legal": ["avocat", "lawyer", "juriste", "notaire", "droit", "juridique", "legal", "compliance"],
            "education": ["enseignant", "teacher", "professeur", "formateur", "éducation", "pédagog"],
            "creative": ["design", "graphi", "ux", "ui", "créati", "photo", "video", "architect"],
            "hospitality": ["cuisine", "chef", "hôtel", "restaurant", "tourisme", "hospitality"],
            "logistics": ["logistique", "supply chain", "transport", "entrepôt", "warehouse"],
            "public_sector": ["fonction publique", "concours", "administration", "fonctionnaire", "civil servant"],
            "entrepreneurship": ["entrepreneur", "créer", "startup", "indépendant", "freelance", "auto-entrepreneur", "micro-entreprise", "business plan", "portage"],
            "student": ["étudiant", "student", "terminale", "licence", "master", "bac", "université", "école", "prépa", "orientation"],
        }
        domain = "general"
        for d, keywords in domain_map.items():
            if any(kw in text_lower for kw in keywords):
                domain = d
                break

        # ── Country detection ──
        country_map = {
            "france": ["france", "paris", "lyon", "marseille", "toulouse", "nantes", "bordeaux", "lille", "cpf", "pôle emploi", "france travail", "rncp", "cdi", "cdd"],
            "morocco": ["maroc", "morocco", "casablanca", "rabat", "anapec", "ofppt"],
            "canada": ["canada", "montréal", "toronto", "vancouver", "québec"],
            "uk": ["uk", "united kingdom", "london", "england", "british"],
            "us": ["usa", "united states", "new york", "california", "silicon valley"],
            "belgium": ["belgique", "belgium", "bruxelles"],
            "switzerland": ["suisse", "switzerland", "genève", "zürich"],
        }
        country = "unknown"
        for c, keywords in country_map.items():
            if any(kw in text_lower for kw in keywords):
                country = c
                break

        # ── Level detection ──
        level = "unknown"
        if any(w in text_lower for w in ["junior", "débutant", "beginner", "étudiant", "student", "stage", "intern", "alternance", "apprenti"]):
            level = "junior"
        elif any(w in text_lower for w in ["senior", "lead", "principal", "expert", "manager", "directeur", "director", "10 ans", "15 ans", "20 ans"]):
            level = "senior"
        elif any(w in text_lower for w in ["3 ans", "5 ans", "expérience", "confirmé", "mid"]):
            level = "mid"

        return {"domain": domain, "country": country, "level": level}

    async def run(
        self,
        message: str,
        history: list[dict] | None = None,
        language: str = "fr",
        deep_analysis: bool = False,
    ) -> dict[str, Any]:
        try:
            # Prepare language instruction - ALWAYS enforce language (even for French)
            # Map language codes to full names for clarity
            lang_names = {"fr": "French", "en": "English", "es": "Spanish", "de": "German", "ar": "Arabic"}
            lang_name = lang_names.get(language, language)
            lang_instruction = f"[IMPORTANT: You MUST respond in {lang_name}. This is a strict requirement.] "

            # Add code hint only for genuine code requests (from PR #16)
            # Avoid false positives: "code du travail", "code postal", "code NAF", "dress code"
            msg_lower = message.lower()
            _CODE_PATTERNS = [
                "python", "javascript", "sql", "html", "css", "java ",
                "react", "docker", "bash", "script", "regex", "api",
                "écrire du code", "write code", "code python", "code sql",
                "fonction", "function", "algorithme", "algorithm",
            ]
            if any(p in msg_lower for p in _CODE_PATTERNS):
                lang_instruction += "[If the user asks for code, provide it in a Markdown code block.] "

            full_message = f"{lang_instruction}{message}"

            # Main conversation (coach principal always responds)
            response = await self.chat(full_message, history)

            result = {
                "success": True,
                "response": response,
                "language": language,
                "training_suggestions": [],
                "career_insights": {},
            }

            # Filter: do NOT invoke sub-agents for meta messages
            if self._is_meta_message(message):
                return result

            # Tag crisis and orientation for richer context
            is_crisis = self._is_crisis_message(message)
            is_orientation = self._is_orientation_message(message)
            result["is_crisis"] = is_crisis
            result["is_orientation"] = is_orientation

            # Deep analysis with sub-agents — always for crisis/orientation
            if deep_analysis or is_crisis or is_orientation or self._should_invoke_sub_agents(message):
                profile = self._extract_user_profile(message, history)
                if is_crisis:
                    profile["situation"] = "crisis"
                elif is_orientation:
                    profile["situation"] = "orientation"
                insights = await self._gather_deep_insights(message, language, profile, history)
                result["training_suggestions"] = insights.get("training", [])
                result["career_insights"] = insights.get("career", {})

            return result

        except Exception as e:
            # Re-raise Groq rate limit errors so coach.py can return 429 instead of 500
            err_str = str(e).lower()
            if "rate limit" in err_str or "429" in err_str or "ratelimit" in err_str.replace(" ", ""):
                raise
            return {
                "success": False,
                "error": str(e),
                "response": "I'm sorry, an error occurred while processing your request.",
            }

    def _should_invoke_sub_agents(self, message: str) -> bool:
        """Determine if message requires deep analysis — intentionally broad."""
        trigger_words = [
            # Training & learning
            "formation", "certification", "cours", "apprendre", "diplôme", "école",
            "training", "learn", "study", "studies", "course", "bootcamp",
            "cpf", "rncp", "vae", "bilan",
            # Career & paths
            "carrière", "évolution", "parcours", "plan", "reconversion", "transition",
            "career", "path", "progression", "promotion", "orientation",
            # Skills
            "compétences", "skills", "gap", "manque", "améliorer", "improve",
            # Salary & negotiation
            "salaire", "salary", "rémunération", "argent", "paye", "négocier", "combien",
            "tjm", "freelance", "taux journalier", "augmentation", "raise",
            # Contracts
            "contrat", "contract", "cdi", "cdd", "intérim", "portage", "alternance",
            "freelance", "auto-entrepreneur", "stage", "statut",
            # Entrepreneurship
            "entreprendre", "créer", "business", "indépendant", "micro-entreprise",
            "entrepreneur", "startup",
            # Crisis
            "licenciement", "chômage", "burnout", "harcèlement", "démission",
            "prud", "tribunal", "droit", "allocation",
            # Employer / recruitment
            "recruteur", "recruiter", "entretien", "interview", "candidature",
            "cv", "lettre de motivation", "linkedin",
        ]
        message_lower = message.lower()
        # Also trigger for crisis and orientation messages
        if self._is_crisis_message(message) or self._is_orientation_message(message):
            return True
        return any(word in message_lower for word in trigger_words)

    def _build_sub_agent_context(self, message: str, language: str, profile: dict[str, str]) -> str:
        """Build a context block for sub-agents with user profile info."""
        lang_name = {"fr": "French", "en": "English", "es": "Spanish", "de": "German", "ar": "Arabic"}.get(language, language)
        situation = profile.get("situation", "standard")
        situation_note = ""
        if situation == "crisis":
            situation_note = "\n⚠️ USER IS IN CRISIS (layoff/burnout/harassment/emergency). Prioritize immediate practical steps and resources."
        elif situation == "orientation":
            situation_note = "\n🧭 USER NEEDS ORIENTATION (lost/unsure/student). Propose exploration paths, not rigid plans."
        return (
            f"=== USER PROFILE CONTEXT ===\n"
            f"Communication language: {lang_name} (respond in this language — this is NOT a training topic)\n"
            f"Professional domain: {profile.get('domain', 'general')}\n"
            f"Country: {profile.get('country', 'unknown')}\n"
            f"Experience level: {profile.get('level', 'unknown')}\n"
            f"Situation: {situation}{situation_note}\n"
            f"=== END CONTEXT ===\n\n"
            f"User request: {message}"
        )

    # Country name → ISO code mapping for Adzuna API
    _COUNTRY_TO_CODE = {
        "france": "fr", "morocco": "ma", "canada": "ca", "uk": "gb",
        "us": "us", "belgium": "be", "switzerland": "ch",
    }

    async def _gather_deep_insights(
        self, message: str, language: str = "fr",
        profile: dict[str, str] | None = None,
        history: list[dict] | None = None,
    ) -> dict[str, Any]:
        """
        Gather insights from RELEVANT sub-agents only (smart routing).

        Fixes applied:
        - Only invokes sub-agents that match the message intent (not all 4 every time)
        - Parameter extractor receives conversation history for richer extraction
        - Salary trigger keywords massively expanded
        - Enriched parameters (contract_type, XP, current_salary) passed to salary advisor
        """
        if profile is None:
            profile = {"domain": "general", "country": "unknown", "level": "unknown"}

        ctx = self._build_sub_agent_context(message, language, profile)
        needs = self._classify_message_needs(message)
        insights = {"training": [], "career": {}}
        logger.info(f"[{self.name}] Smart routing → {needs} for: {message[:80]}...")

        # ── 1. Training recommendations (only if needed) ──
        if "training" in needs:
            try:
                training_result = await self.training_advisor.run(
                    task=f"Recommend professional training for this user.\n\n{ctx}"
                )
                training_data = self._parse_json(training_result)

                if training_data and "recommendations" in training_data:
                    recs = []
                    for rec in training_data["recommendations"][:3]:
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

        # ── 2. Skill gap analysis (only if needed) ──
        if "skills" in needs:
            try:
                skills_result = await self.skill_analyzer.run(
                    task=f"Analyze skill gaps for this user.\n\n{ctx}"
                )
                skills_data = self._parse_json(skills_result)

                if skills_data:
                    insights["career"]["skill_gaps"] = skills_data.get("gaps", [])
                    insights["career"]["strengths"] = skills_data.get("strengths_to_leverage", [])
            except Exception as e:
                logger.warning(f"[{self.name}] Skill analyzer failed: {e}")

        # ── 3. Salary insights (only if needed — with enriched extraction) ──
        if "salary" in needs:
            try:
                # Build extraction context from conversation history (not just raw message)
                extraction_input = message
                if history:
                    recent_user_msgs = [
                        m["content"] for m in history[-6:]
                        if m.get("role") == "user" and m.get("content")
                    ]
                    if recent_user_msgs:
                        extraction_input = (
                            "Conversation context:\n"
                            + "\n".join(recent_user_msgs)
                            + "\n\nCurrent question: " + message
                        )

                # Extract enriched parameters (job, city, country + contract, XP, salary)
                params_result = await self.parameter_extractor.run(task=extraction_input)
                params = self._parse_json(params_result) or {}

                job = params.get("job_title", "")
                cc = params.get("country_code") or self._COUNTRY_TO_CODE.get(
                    profile.get("country", ""), "fr"
                )
                city = params.get("city", "")

                # Fallback: use profile domain as job hint if extractor found nothing
                if not job:
                    domain = profile.get("domain", "general")
                    job = domain if domain != "general" else message[:60]

                # Fetch Adzuna market data
                stats = await get_realtime_salary(job, cc, city)

                # Build enriched context for salary advisor with extra parameters
                extra_parts = []
                if params.get("contract_type") and params["contract_type"] != "unknown":
                    extra_parts.append(f"Contract type: {params['contract_type']}")
                if params.get("years_experience") is not None:
                    extra_parts.append(f"Years of experience: {params['years_experience']}")
                if params.get("current_salary"):
                    extra_parts.append(f"Current salary: {params['current_salary']}")
                if params.get("company_size") and params["company_size"] != "unknown":
                    extra_parts.append(f"Company size: {params['company_size']}")
                extra_block = ("\n" + "\n".join(extra_parts)) if extra_parts else ""

                salary_result = await self.salary_advisor.run(
                    task=f"Analyze salary and provide negotiation advice for this user.\n\n{ctx}",
                    context=(
                        f"Market data from Adzuna for '{job}' in {city or cc}: {json.dumps(stats)}"
                        f"{extra_block}"
                    ),
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


def get_career_coach() -> CareerCoachAgent:
    """
    Get CareerCoach singleton instance.

    DEPRECATED: This function is maintained for backward compatibility only.
    New code should use src.api.deps.get_coach_agent() instead, which provides
    thread-safe singleton initialization.

    Returns:
        CareerCoachAgent singleton instance (thread-safe via deps.py)
    """
    from src.api.deps import get_coach_agent
    return get_coach_agent()


async def career_coach_chat(
    message: str,
    history: list[dict] | None = None,
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
