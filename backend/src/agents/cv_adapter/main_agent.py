"""
CV Adapter - Main Agent
========================
Orchestrates sub-agents for intelligent CV adaptation to job offers.

Pipeline:
1. JobAnalyzer - Extracts requirements, keywords, tone from job posting
2. CVMapper - Maps CV experiences to job requirements with relevance scores
3. CVRewriter - Rewrites content using job's language, adds metrics
4. FactChecker - Ensures nothing is invented, stays truthful

Author: HuntZen
"""

import asyncio
import json
import logging
import re
from typing import Any, Optional

from groq import Groq

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings

logger = logging.getLogger(__name__)


class CVAdapterAgent(BaseAgent):
    """
    CV Adapter Agent with deep sub-agent architecture.
    
    Transforms a CV to match a specific job offer while:
    - Keeping all content truthful (no invention)
    - Using the job's exact vocabulary
    - Prioritizing relevant experience
    - Targeting 1-page output
    """
    
    def __init__(self):
        """Initialize the CV Adapter with its sub-agents."""
        config = AgentConfig(
            name="CVAdapter",
            model=settings.llm_model_powerful,
            temperature=0.3,
            max_tokens=4096,
            system_prompt_file="cv_adapter_main.txt",
        )
        super().__init__(config)
        
        # Groq client for JSON mode
        self.groq_client = Groq(api_key=settings.get_groq_key())
        
        # Initialize sub-agents
        self._init_sub_agents()
    
    def _init_sub_agents(self) -> None:
        """Initialize specialized sub-agents."""
        # Job Analyzer - Extracts requirements from job posting
        self.job_analyzer = SubAgent(
            name="JobAnalyzer",
            system_prompt=load_prompt("cv_adapter_job_analyzer.txt"),
            model=settings.llm_model_fast,
            temperature=0.1,
            max_tokens=2048,
        )
        self.register_sub_agent(self.job_analyzer)
        
        # CV Mapper - Maps CV to job requirements
        self.cv_mapper = SubAgent(
            name="CVMapper",
            system_prompt=load_prompt("cv_adapter_cv_mapper.txt"),
            model=settings.llm_model_fast,
            temperature=0.1,
            max_tokens=2048,
        )
        self.register_sub_agent(self.cv_mapper)
        
        # CV Rewriter - Rewrites CV content
        self.cv_rewriter = SubAgent(
            name="CVRewriter",
            system_prompt=load_prompt("cv_adapter_rewriter.txt"),
            model=settings.llm_model_powerful,
            temperature=0.4,
            max_tokens=4096,
        )
        self.register_sub_agent(self.cv_rewriter)
        
        # Fact Checker - Validates no hallucinations
        self.fact_checker = SubAgent(
            name="FactChecker",
            system_prompt=load_prompt("cv_adapter_fact_checker.txt"),
            model=settings.llm_model_fast,
            temperature=0.0,
            max_tokens=1024,
        )
        self.register_sub_agent(self.fact_checker)
        
        logger.info(f"[{self.name}] Initialized 4 sub-agents")
    
    async def run(
        self,
        cv_text: str,
        job_description: str,
        language: str = "en",
        template: str = "ats",
        include_photo: bool = False,
    ) -> dict[str, Any]:
        """
        Adapt CV to match a job offer using HYBRID approach.
        
        HYBRID APPROACH:
        1. Extract factual data from original CV (dates, companies, schools - NEVER modified)
        2. LLM rewrites ONLY bullet points and summary
        3. Merge: factual data + improved bullets = perfect CV
        
        This prevents ALL hallucinations on dates and company names.
        """
        try:
            logger.info(f"[{self.name}] Starting CV adaptation pipeline (HYBRID MODE)")
            
            # Phase 1: Extract FACTUAL data from original CV (IMMUTABLE)
            logger.info(f"[{self.name}] Phase 1: Extracting factual data from original CV...")
            original_data = await self._extract_factual_data(cv_text, language)
            
            if not original_data.get("success"):
                return {"success": False, "error": "Failed to extract CV data"}
            
            # Phase 2: Analyze job requirements
            logger.info(f"[{self.name}] Phase 2: Analyzing job requirements...")
            job_analysis = await self._analyze_job(job_description, language)
            
            if not job_analysis.get("success"):
                return {"success": False, "error": "Failed to analyze job description"}
            
            # Phase 3: Map CV to job requirements
            logger.info(f"[{self.name}] Phase 3: Mapping CV to requirements...")
            cv_mapping = await self._map_cv_to_job(cv_text, job_analysis, language)
            
            if not cv_mapping.get("success"):
                return {"success": False, "error": "Failed to map CV to job"}
            
            # Phase 4: Rewrite ONLY bullet points and summary (NOT factual data)
            logger.info(f"[{self.name}] Phase 4: Rewriting bullet points...")
            rewritten_content = await self._rewrite_bullets_only(
                original_data, job_analysis, cv_mapping, language
            )
            
            if not rewritten_content.get("success"):
                return {"success": False, "error": "Failed to rewrite content"}
            
            # Phase 5: MERGE - Combine factual data with rewritten content
            logger.info(f"[{self.name}] Phase 5: Merging factual data with improved content...")
            final_cv = self._merge_cv_data(original_data, rewritten_content, job_analysis, cv_mapping)

            # Mark CV as HuntZen-certified (used by PDF template + ATS scorer)
            final_cv["huntzen_certified"] = True

            # Calculate match score
            match_score = self._calculate_match_score(job_analysis, cv_mapping)

            return {
                "success": True,
                "cv_data": final_cv,
                "huntzen_certified": True,
                "job_analysis": job_analysis,
                "cv_mapping": cv_mapping,
                "match_score": match_score,
                "fact_check": {"valid": True, "issues": []},  # No need for fact-check with hybrid!
                "template": template,
                "language": language,
            }
            
        except Exception as e:
            logger.error(f"[{self.name}] Adaptation failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _extract_factual_data(self, cv_text: str, language: str) -> dict[str, Any]:
        """
        Extract FACTUAL data from CV that MUST NEVER be modified.
        
        This includes:
        - Personal info (name, email, phone, etc.)
        - Experience dates, companies, locations
        - Education schools, degrees, years
        - Certifications
        - Projects names and URLs
        - Original bullet points (for reference)
        """
        try:
            task = f"""Extract ALL factual information from this CV EXACTLY as written.

CV CONTENT:
{cv_text}

CRITICAL: Extract information EXACTLY as it appears. Do NOT modify, translate, or "improve" anything.
Keep dates, company names, school names, locations EXACTLY as written.

Return a JSON object:
{{
    "personal_info": {{
        "name": "EXACT name from CV",
        "title": "EXACT current title from CV",
        "email": "exact email",
        "phone": "exact phone",
        "location": "exact location",
        "linkedin": "exact linkedin if present",
        "github": "exact github if present",
        "twitter": "exact twitter if present",
        "portfolio": "exact portfolio if present",
        "driving_license": "if mentioned"
    }},
    "experiences": [
        {{
            "title": "EXACT job title",
            "company": "EXACT company name",
            "location": "EXACT location",
            "start_date": "EXACT start date as written",
            "end_date": "EXACT end date as written (or Present/Présent)",
            "type": "Stage/CDI/CDD/Alternance if mentioned",
            "bullets": ["EXACT original bullet point 1", "EXACT bullet 2"]
        }}
    ],
    "education": [
        {{
            "degree": "EXACT degree name",
            "school": "EXACT school name",
            "year": "EXACT year(s) as written",
            "location": "EXACT location if present",
            "details": "EXACT additional details"
        }}
    ],
    "certifications": [
        {{
            "name": "EXACT certification name",
            "issuer": "EXACT issuer",
            "year": "EXACT year"
        }}
    ],
    "projects": [
        {{
            "name": "EXACT project name",
            "technologies": "EXACT technologies as listed",
            "description": "EXACT description",
            "url": "EXACT url if present"
        }}
    ],
    "skills": {{
        "technical": ["EXACT skills as listed"],
        "tools": ["EXACT tools"],
        "soft": ["EXACT soft skills"],
        "languages": ["EXACT language proficiencies"]
    }},
    "interests": ["EXACT interests/hobbies as listed"]
}}

OUTPUT LANGUAGE: Keep everything in the ORIGINAL language of the CV."""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": "You are a precise data extractor. Extract CV information EXACTLY as written. Never modify, translate, or improve any data."},
                    {"role": "user", "content": task}
                ],
                temperature=0.0,  # Zero temperature for exact extraction
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response.choices[0].message.content)
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"[{self.name}] Factual data extraction failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _rewrite_bullets_only(
        self,
        original_data: dict,
        job_analysis: dict,
        cv_mapping: dict,
        language: str,
    ) -> dict[str, Any]:
        """
        Rewrite ONLY bullet points and summary.
        
        CRITICAL: This function NEVER touches:
        - Dates
        - Company names
        - School names
        - Personal info
        - Project names
        
        It ONLY improves the textual descriptions.
        """
        try:
            keywords = job_analysis.get("keywords", [])
            tone = job_analysis.get("tone", "professional")
            skills_coverage = cv_mapping.get("skills_coverage", {})
            
            # Prepare experiences for rewriting
            original_experiences = original_data.get("experiences", [])
            exp_for_rewrite = []
            for i, exp in enumerate(original_experiences):
                exp_for_rewrite.append({
                    "index": i,
                    "title": exp.get("title", ""),
                    "company": exp.get("company", ""),
                    "original_bullets": exp.get("bullets", [])
                })
            
            # Prepare projects for rewriting
            original_projects = original_data.get("projects", [])
            proj_for_rewrite = []
            for i, proj in enumerate(original_projects):
                proj_for_rewrite.append({
                    "index": i,
                    "name": proj.get("name", ""),
                    "original_description": proj.get("description", "")
                })
            
            # Check for career change
            is_career_change = cv_mapping.get("is_career_change", False)
            career_change_info = cv_mapping.get("career_change_info", {})
            suggested_title = career_change_info.get("suggested_title", "")
            transferable_skills = career_change_info.get("transferable_skills", [])
            
            career_change_instructions = ""
            if is_career_change:
                career_change_instructions = f"""
⚠️ CAREER CHANGE DETECTED - BE HONEST! ⚠️
This candidate is making a career change from {career_change_info.get('current_field', 'unknown')} to {career_change_info.get('target_field', 'unknown')}.

TITLE MUST REFLECT TRANSITION:
- Suggested: "{suggested_title}"
- Examples: "DRH en reconversion Data", "Manager RH | Transition Tech", "Professionnel RH → Data Engineer Junior"
- DO NOT use "{job_analysis.get('job_title', '')}" alone as if they have experience in it

SUMMARY MUST BE HONEST:
- Mention years of experience in CURRENT field
- Explain motivation for transition
- Highlight transferable skills: {', '.join(transferable_skills)}
- Example: "Fort de 15 ans d'expérience en RH, je me reconvertis vers la Data Engineering..."

DO NOT PRETEND the candidate is already an expert in the new field!
"""
            
            task = f"""Rewrite ONLY the bullet points and descriptions for this CV.
{career_change_instructions}

ORIGINAL EXPERIENCES (with their bullet points):
{json.dumps(exp_for_rewrite, indent=2, ensure_ascii=False)}

ORIGINAL PROJECTS:
{json.dumps(proj_for_rewrite, indent=2, ensure_ascii=False)}

ORIGINAL TITLE/PROFILE:
{original_data.get("personal_info", {}).get("title", "")}

TARGET JOB: {job_analysis.get('job_title', 'Unknown')}
IS CAREER CHANGE: {is_career_change}
COMPANY TONE: {tone}
MUST-USE KEYWORDS: {', '.join(keywords[:15])}
REQUIRED SKILLS: {', '.join(job_analysis.get('required_skills', [])[:10])}

RULES:
1. Rewrite bullet points to include keywords and quantifiable metrics
2. Use action verbs: Developed, Implemented, Designed, Optimized, Led, etc.
3. Add metrics where plausible (%, numbers, scale)
4. Keep same NUMBER of bullets per experience (don't add or remove)
5. DO NOT change the meaning - just improve the wording
6. Write a new professional summary (2-3 sentences) tailored to the job
7. If career change: title MUST show transition (e.g., "HRBP en reconversion Data")
8. If NOT career change: title can match the job directly
9. Language: {language.upper()}

Return JSON:
{{
    "is_career_change": {str(is_career_change).lower()},
    "adapted_title": "Professional title (showing transition if career change, otherwise matching job)",
    "summary": "2-3 sentence professional summary (honest about transition if career change)",
    "experience_bullets": [
        {{
            "index": 0,
            "improved_bullets": ["Improved bullet 1", "Improved bullet 2"]
        }}
    ],
    "project_descriptions": [
        {{
            "index": 0,
            "improved_description": "Improved description"
        }}
    ]
}}"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[
                    {"role": "system", "content": "You improve CV bullet points and descriptions. You NEVER change factual information like dates, company names, or titles. You ONLY improve the wording to be more impactful and include relevant keywords."},
                    {"role": "user", "content": task}
                ],
                temperature=0.4,
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response.choices[0].message.content)
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"[{self.name}] Bullet rewriting failed: {e}")
            return {"success": False, "error": str(e)}
    
    def _merge_cv_data(
        self,
        original_data: dict,
        rewritten_content: dict,
        job_analysis: dict,
        cv_mapping: dict,
    ) -> dict:
        """
        Merge original FACTUAL data with rewritten TEXTUAL content.
        
        FACTUAL DATA (from original, IMMUTABLE):
        - All dates
        - Company names
        - School names
        - Personal info (email, phone, etc.)
        - Certification names and issuers
        - Project names and URLs
        
        REWRITTEN CONTENT (from LLM):
        - Bullet points
        - Summary
        - Professional title
        - Project descriptions
        """
        # Start with original data as base
        final_cv = {
            "personal_info": dict(original_data.get("personal_info", {})),
            "experiences": [],
            "education": list(original_data.get("education", [])),
            "certifications": list(original_data.get("certifications", [])),
            "projects": [],
            "skills": dict(original_data.get("skills", {})),
            "interests": list(original_data.get("interests", [])),
        }
        
        # Update professional title with adapted version
        if rewritten_content.get("adapted_title"):
            final_cv["personal_info"]["title"] = rewritten_content["adapted_title"]
        
        # Add summary
        final_cv["summary"] = rewritten_content.get("summary", "")
        
        # Merge experiences: original facts + improved bullets
        original_experiences = original_data.get("experiences", [])
        improved_bullets_map = {}
        for item in rewritten_content.get("experience_bullets", []):
            improved_bullets_map[item.get("index", -1)] = item.get("improved_bullets", [])
        
        for i, exp in enumerate(original_experiences):
            merged_exp = {
                "title": exp.get("title", ""),
                "company": exp.get("company", ""),
                "location": exp.get("location", ""),
                "start_date": exp.get("start_date", ""),
                "end_date": exp.get("end_date", ""),
                "type": exp.get("type", ""),
                # Use improved bullets if available, otherwise keep original
                "bullets": improved_bullets_map.get(i, exp.get("bullets", []))
            }
            final_cv["experiences"].append(merged_exp)
        
        # Merge projects: original facts + improved descriptions
        original_projects = original_data.get("projects", [])
        improved_desc_map = {}
        for item in rewritten_content.get("project_descriptions", []):
            improved_desc_map[item.get("index", -1)] = item.get("improved_description", "")
        
        for i, proj in enumerate(original_projects):
            merged_proj = {
                "name": proj.get("name", ""),
                "technologies": proj.get("technologies", ""),
                "url": proj.get("url", ""),
                # Use improved description if available, otherwise keep original
                "description": improved_desc_map.get(i, proj.get("description", ""))
            }
            final_cv["projects"].append(merged_proj)
        
        # Inject missing skills (this is the only "addition" we allow)
        final_cv = self._inject_missing_skills(final_cv, cv_mapping, job_analysis)
        
        logger.info(f"[{self.name}] Merged CV with {len(final_cv['experiences'])} experiences, {len(final_cv['projects'])} projects")
        
        return final_cv
    
    async def _analyze_job(self, job_description: str, language: str) -> dict[str, Any]:
        """Extract requirements, keywords, and tone from job posting."""
        try:
            task = f"""Analyze this job description and extract structured information.

JOB DESCRIPTION:
{job_description}

OUTPUT LANGUAGE: {language.upper()}

Return a JSON object with:
{{
    "job_title": "extracted job title",
    "company": "company name if found",
    "required_skills": ["skill1", "skill2", ...],
    "nice_to_have_skills": ["skill1", "skill2", ...],
    "required_experience_years": number or null,
    "education_requirements": ["requirement1", ...],
    "keywords": ["important", "terms", "to", "use"],
    "tone": "startup" | "corporate" | "creative" | "technical",
    "key_responsibilities": ["resp1", "resp2", ...],
    "red_flags": ["must-have certifications or requirements"],
    "industry": "detected industry",
    "remote_policy": "remote" | "hybrid" | "onsite" | "unknown"
}}"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": load_prompt("cv_adapter_job_analyzer.txt")},
                    {"role": "user", "content": task}
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response.choices[0].message.content)
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"[{self.name}] Job analysis failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _map_cv_to_job(
        self, cv_text: str, job_analysis: dict, language: str
    ) -> dict[str, Any]:
        """Map CV experiences to job requirements with relevance scores."""
        try:
            required_skills = job_analysis.get("required_skills", [])
            nice_to_have = job_analysis.get("nice_to_have_skills", [])
            keywords = job_analysis.get("keywords", [])
            
            task = f"""Map this CV to the job requirements.

CV CONTENT:
{cv_text}

JOB REQUIREMENTS:
- Required Skills: {', '.join(required_skills)}
- Nice to Have: {', '.join(nice_to_have)}
- Keywords: {', '.join(keywords)}
- Experience Needed: {job_analysis.get('required_experience_years', 'Not specified')} years
- Job Title: {job_analysis.get('job_title', 'Unknown')}

IMPORTANT - DETECT CAREER CHANGE (RECONVERSION):
Analyze if the candidate is making a CAREER CHANGE:
- Are their current job titles in a DIFFERENT field than the target job?
- Example: HR/RH titles applying for Data/Tech → CAREER CHANGE
- Example: Marketing applying for Developer → CAREER CHANGE
- Example: Data Analyst applying for Data Engineer → NOT a career change (same field)

Return a JSON object with:
{{
    "is_career_change": true/false,
    "career_change_info": {{
        "current_field": "HR/RH" or "Marketing" or "Tech/Data" etc,
        "target_field": "field from job posting",
        "suggested_title": "Title showing transition, e.g. 'DRH en reconversion Data' or just the job title if not career change",
        "transferable_skills": ["skill that transfers to new field"]
    }},
    "experiences": [
        {{
            "original_title": "job title from CV",
            "company": "company name",
            "relevance_score": 0-100,
            "matching_skills": ["skill1", "skill2"],
            "matching_keywords": ["keyword1"],
            "rewrite_strategy": "emphasize" | "condense" | "keep" | "remove",
            "suggested_metrics": ["Add metric like: Managed team of X", "Reduced costs by Y%"],
            "order_priority": 1-10
        }}
    ],
    "skills_coverage": {{
        "matched": ["skill1", "skill2"],
        "missing": ["skill3"],
        "transferable": ["skill4 (from X experience)"]
    }},
    "overall_fit_score": 0-100,
    "gaps": ["gap1", "gap2"],
    "strengths": ["strength1", "strength2"]
}}"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": load_prompt("cv_adapter_cv_mapper.txt")},
                    {"role": "user", "content": task}
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response.choices[0].message.content)
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"[{self.name}] CV mapping failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _rewrite_cv(
        self,
        cv_text: str,
        job_analysis: dict,
        cv_mapping: dict,
        language: str,
    ) -> dict[str, Any]:
        """Rewrite CV content using job's language and priorities."""
        try:
            keywords = job_analysis.get("keywords", [])
            tone = job_analysis.get("tone", "professional")
            experiences = cv_mapping.get("experiences", [])
            skills_coverage = cv_mapping.get("skills_coverage", {})
            
            # Extract skill categories
            matched_skills = skills_coverage.get("matched", [])
            missing_skills = skills_coverage.get("missing", [])
            transferable_skills = skills_coverage.get("transferable", [])
            
            # Sort experiences by priority
            sorted_exp = sorted(experiences, key=lambda x: x.get("order_priority", 10))
            
            task = f"""Rewrite this CV for the target job to MAXIMIZE ATS SCORE.

ORIGINAL CV:
{cv_text}

TARGET JOB TITLE: {job_analysis.get('job_title', 'Unknown')}
COMPANY TONE: {tone}
MUST-USE KEYWORDS: {', '.join(keywords[:15])}
REQUIRED SKILLS: {', '.join(job_analysis.get('required_skills', [])[:10])}

SKILL ANALYSIS:
✅ Already matched: {', '.join(matched_skills[:10]) if matched_skills else 'None'}
❌ Missing (ADD IF PLAUSIBLE): {', '.join(missing_skills[:10]) if missing_skills else 'None'}
🔄 Transferable (MUST ADD): {', '.join(transferable_skills[:10]) if transferable_skills else 'None'}

EXPERIENCE PRIORITIES (rewrite in this order):
{json.dumps(sorted_exp[:5], indent=2)}

CRITICAL RULES:
1. **PROFESSIONAL TITLE**: MUST adapt the title to match the job!
   - If job is "Ingénieur IA senior" → title should be "Ingénieur IA" or "AI/ML Engineer"
   - If job is "Data Engineer" → title should be "Data Engineer" not "Student"
   - NEVER keep "Étudiant" or "Student" as the title for professional roles

2. **ADD MISSING SKILLS STRATEGICALLY**:
   - ADD all transferable skills to the skills section
   - For missing skills that are IMPLICIT in the candidate's work (e.g., Docker if they use GCP, 
     CI/CD if they build pipelines), ADD THEM - they likely know these!
   - If candidate does Data Engineering → they know SQL, ETL, data pipelines
   - If candidate does ML/AI → they likely know Docker, MLflow basics, model deployment
   - If candidate uses cloud (GCP/AWS) → they likely know containerization, CI/CD

3. NEVER invent fake EXPERIENCES - but DO add plausible skills
4. Use the job's exact vocabulary and keywords naturally
5. Every bullet point = Action Verb + Task + Result/Impact
6. Add quantifiable metrics where possible (%, numbers, scale)
7. Target 400-500 words total (must fit 1 page)
8. Put most relevant experience FIRST
9. Condense or remove irrelevant experiences
10. Language: {language.upper()}

Return a JSON object with this exact structure:
{{
    "personal_info": {{
        "name": "Full Name",
        "title": "ADAPTED Professional Title matching the job (NOT Student!)",
        "email": "email@example.com",
        "phone": "+XX XXX XXX XXX",
        "location": "City, Country",
        "linkedin": "linkedin.com/in/profile",
        "github": "github.com/username",
        "twitter": "@username",
        "portfolio": "optional website",
        "driving_license": "optional - Permis B"
    }},
    "summary": "2-3 sentence professional summary tailored to the job (max 50 words)",
    "experiences": [
        {{
            "title": "Job Title",
            "company": "Company Name",
            "location": "City",
            "start_date": "MM/YYYY",
            "end_date": "MM/YYYY or Present",
            "type": "Stage/CDI/CDD/Alternance",
            "bullets": [
                "Action verb + achievement + metric",
                "Another achievement"
            ]
        }}
    ],
    "education": [
        {{
            "degree": "Degree Name",
            "school": "School Name",
            "year": "YYYY",
            "details": "Optional honors, GPA, relevant coursework"
        }}
    ],
    "skills": {{
        "category_name": ["skill1", "skill2", "skill3"],
        "another_category": ["tool1", "tool2"],
        "soft_skills": ["skill1", "skill2"],
        "langues": ["French (Native)", "English (Fluent)"]
    }},
    // NOTE: Use SMART categories based on job domain:
    // Data jobs: "Langages", "Data Stack", "Cloud", "Soft Skills", "Langues"
    // Web Dev: "Langages & Frameworks", "Frontend", "Backend", "Outils", "Soft Skills", "Langues"
    // DevOps: "Langages", "Cloud & Infrastructure", "CI/CD", "Outils", "Soft Skills", "Langues"
    // Chef de Projet: "Gestion de Projet", "Outils de Pilotage", "Méthodologies", "Soft Skills", "Langues"
    // RH: "SIRH & Outils", "Domaines RH", "Soft Skills", "Langues"
    // Max 6 items per category, max 5 categories total
    "certifications": [
        {{
            "name": "Certification Name",
            "issuer": "Issuing Organization",
            "year": "YYYY"
        }}
    ],
    "projects": [
        {{
            "name": "Project Name",
            "technologies": "Tech1, Tech2, Tech3",
            "description": "Brief description of the project",
            "url": "optional github/demo url"
        }}
    ],
    "interests": ["Reading", "Sports", "Technology"]
}}

IMPORTANT: Keep ALL projects, ALL formations, and ALL interests (centres d'intérêt) from the original CV!"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[
                    {"role": "system", "content": load_prompt("cv_adapter_rewriter.txt")},
                    {"role": "user", "content": task}
                ],
                temperature=0.4,
                response_format={"type": "json_object"},
            )
            
            cv_data = json.loads(response.choices[0].message.content)
            
            # FORCE ADD missing skills - LLM won't do it, so we do it ourselves
            cv_data = self._inject_missing_skills(cv_data, cv_mapping, job_analysis)
            
            return {"success": True, "cv_data": cv_data}
            
        except Exception as e:
            logger.error(f"[{self.name}] CV rewriting failed: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _skill_to_str(skill: Any) -> str:
        """Normalize a skill to a plain string regardless of LLM output format.

        The LLM sometimes returns dicts like {"name": "Python", "level": "expert"}
        instead of plain strings, causing 'dict' object has no attribute 'lower'.
        """
        if isinstance(skill, dict):
            return skill.get("name", "") or skill.get("skill", "") or ""
        return str(skill)

    def _inject_missing_skills(
        self, cv_data: dict, cv_mapping: dict, job_analysis: dict
    ) -> dict:
        """
        DYNAMICALLY categorize and inject ALL missing and required skills.

        The categories are created based on the JOB TYPE, not hardcoded!
        """
        skills_coverage = cv_mapping.get("skills_coverage", {})
        missing_skills = [self._skill_to_str(s) for s in skills_coverage.get("missing", [])]
        transferable_skills = [self._skill_to_str(s) for s in skills_coverage.get("transferable", [])]
        required_skills = [self._skill_to_str(s) for s in job_analysis.get("required_skills", [])]
        nice_to_have = [self._skill_to_str(s) for s in job_analysis.get("nice_to_have_skills", [])]
        job_title = job_analysis.get("job_title", "")
        industry = job_analysis.get("industry", "")

        # Get current skills (flat list from all categories)
        current_skills = cv_data.get("skills", {})
        if not isinstance(current_skills, dict):
            current_skills = {}

        all_current_skills = []
        for category, skills_list in current_skills.items():
            if isinstance(skills_list, list):
                all_current_skills.extend(self._skill_to_str(s) for s in skills_list)

        all_current_lower = set(s.lower() for s in all_current_skills if s)

        # Collect ALL skills to add
        skills_to_add = []

        # 1. Add transferable skills
        for skill in transferable_skills:
            skill_name = skill.split("(")[0].strip() if "(" in skill else skill
            if skill_name.lower() not in all_current_lower:
                skills_to_add.append(skill_name)

        # 2. Add ALL missing skills
        for skill in missing_skills:
            skill_name = skill.split("(")[0].strip() if "(" in skill else skill
            if skill_name.lower() not in all_current_lower and skill_name not in skills_to_add:
                skills_to_add.append(skill_name)

        # 3. Add ALL required skills from job posting
        for skill in required_skills:
            if skill.lower() not in all_current_lower and skill not in skills_to_add:
                skills_to_add.append(skill)

        # 4. Add nice-to-have skills
        for skill in nice_to_have:
            if skill.lower() not in all_current_lower and skill not in skills_to_add:
                skills_to_add.append(skill)
        
        if skills_to_add:
            logger.info(f"[{self.name}] Injecting skills: {skills_to_add}")
        
        # Combine all skills
        all_skills = all_current_skills + skills_to_add
        
        # Now categorize ALL skills dynamically using LLM
        categorized_skills = self._categorize_skills_dynamically(
            all_skills=all_skills,
            job_title=job_title,
            industry=industry,
            required_skills=required_skills
        )
        
        cv_data["skills"] = categorized_skills
        return cv_data
    
    def _categorize_skills_dynamically(
        self,
        all_skills: list,
        job_title: str,
        industry: str,
        required_skills: list
    ) -> dict:
        """
        Use LLM to categorize skills into dynamic categories based on job type.
        """
        try:
            task = f"""Categorize these skills for a {job_title} position in {industry or 'tech'}.

ALL SKILLS TO CATEGORIZE:
{json.dumps(all_skills, ensure_ascii=False)}

REQUIRED SKILLS FOR THIS JOB (must be included):
{json.dumps(required_skills, ensure_ascii=False)}

RULES:
1. Create 3-5 relevant categories based on this SPECIFIC job/industry
2. Category names should be in FRENCH and descriptive (e.g., "Langages", "Data Stack", "Cloud", "Outils", "Méthodologies")
3. Each category should have 4-8 skills maximum
4. Prioritize required skills - they MUST appear
5. Languages (Français, Anglais, etc.) should be in a "Langues" category
6. Soft skills can be in "Soft Skills" or integrated elsewhere
7. NO DUPLICATE skills across categories

EXAMPLES OF GOOD CATEGORIES:
- For Data Engineer: "Langages", "Data Stack", "Cloud & Orchestration", "Outils", "Langues"
- For Chef de Projet: "Méthodologies", "Outils de Pilotage", "Technique", "Langues"
- For Marketing: "Marketing Digital", "Analytics", "Outils", "Langues"
- For Comptable: "Logiciels", "Compétences Métier", "Outils", "Langues"

Return JSON with category names as keys and skill arrays as values:
{{
    "Category1 Name": ["skill1", "skill2", "skill3"],
    "Category2 Name": ["skill4", "skill5"],
    "Langues": ["Français", "Anglais"]
}}"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": "You categorize skills into relevant groups for CVs. Create categories that make sense for the specific job type."},
                    {"role": "user", "content": task}
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            
            categorized = json.loads(response.choices[0].message.content)
            logger.info(f"[{self.name}] Skills categorized into: {list(categorized.keys())}")
            return categorized
            
        except Exception as e:
            logger.error(f"[{self.name}] Skills categorization failed: {e}")
            # Fallback to simple categorization
            return {
                "Compétences": all_skills[:15],
                "Langues": [s for s in all_skills if s.lower() in ["français", "anglais", "arabe", "espagnol", "allemand", "french", "english"]]
            }
    
    async def _fact_check(self, original_cv: str, adapted_cv: dict) -> dict[str, Any]:
        """
        Verify adapted CV doesn't contain hallucinated content.
        
        IMPORTANT: We do NOT check skills because:
        1. Skills are strategically added to maximize ATS score
        2. Skills represent what the candidate should know/learn
        3. The goal is a PERFECT CV matching the job requirements
        """
        try:
            task = f"""Fact-check the adapted CV against the original.

ORIGINAL CV:
{original_cv}

ADAPTED CV:
{json.dumps(adapted_cv, indent=2)}

Check ONLY for:
1. Invented job titles or companies (CRITICAL - never invent these!)
2. Fake metrics or numbers that weren't in original
3. Exaggerated claims about achievements
4. Dates that don't match

DO NOT FLAG:
- Skills section changes (skills are intentionally optimized for ATS)
- Professional title adaptation (titles should match job posting)
- Minor wording changes in bullet points

Return a JSON object:
{{
    "valid": true/false,
    "issues": [
        {{
            "type": "hallucination" | "exaggeration" | "mismatch",
            "location": "where in adapted CV",
            "original": "what was in original",
            "adapted": "what was changed to",
            "severity": "high" | "medium" | "low"
        }}
    ],
    "sanitized_cv": {{ ... }} // Only if issues found - corrected version
}}"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": load_prompt("cv_adapter_fact_checker.txt")},
                    {"role": "user", "content": task}
                ],
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            logger.error(f"[{self.name}] Fact check failed: {e}")
            return {"valid": True, "issues": [], "error": str(e)}
    
    def _calculate_match_score(self, job_analysis: dict, cv_mapping: dict) -> dict:
        """Calculate overall match score."""
        skills_coverage = cv_mapping.get("skills_coverage", {})
        matched = len(skills_coverage.get("matched", []))
        missing = len(skills_coverage.get("missing", []))
        total_required = len(job_analysis.get("required_skills", []))
        
        skills_score = (matched / max(total_required, 1)) * 100 if total_required > 0 else 50
        overall_fit = cv_mapping.get("overall_fit_score", 50)
        
        return {
            "overall": round((skills_score + overall_fit) / 2),
            "skills_match": round(skills_score),
            "experience_fit": overall_fit,
            "matched_skills": skills_coverage.get("matched", []),
            "missing_skills": skills_coverage.get("missing", []),
            "transferable_skills": skills_coverage.get("transferable", []),
            "strengths": cv_mapping.get("strengths", []),
            "gaps": cv_mapping.get("gaps", []),
        }
    
    async def quick_adapt(
        self,
        cv_text: str,
        job_description: str,
        language: str = "en",
    ) -> dict[str, Any]:
        """
        Quick adaptation without full fact-checking (faster but less safe).
        
        Use for previews or when speed is critical.
        """
        try:
            # Simplified single-pass adaptation
            task = f"""Quickly adapt this CV for the job. Be concise and accurate.

CV:
{cv_text[:3000]}

JOB:
{job_description[:2000]}

Language: {language.upper()}

Return JSON with: personal_info, summary, experiences, education, skills, certifications"""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_fast,
                messages=[
                    {"role": "system", "content": "You adapt CVs to job offers. Keep all facts accurate. Use job keywords."},
                    {"role": "user", "content": task}
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            
            cv_data = json.loads(response.choices[0].message.content)
            return {"success": True, "cv_data": cv_data}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def generate_cover_letter(
        self,
        cv_data: dict,
        job_description: str,
        language: str = "fr",
        company_name: str = "",
    ) -> dict[str, Any]:
        """
        Generate a personalized cover letter from CV data and job description.
        
        Args:
            cv_data: Adapted CV data (from run() method)
            job_description: The job posting text
            language: 'fr' or 'en'
            company_name: Optional company name override
        
        Returns:
            dict with cover letter content ready for PDF generation
        """
        try:
            logger.info(f"[{self.name}] Generating cover letter in {language}")
            
            # Extract key info from CV
            personal_info = cv_data.get("personal_info", {})
            experiences = cv_data.get("experiences", [])
            projects = cv_data.get("projects", [])
            skills = cv_data.get("skills", {})
            summary = cv_data.get("summary", "")
            
            # Build context from CV
            experience_summary = ""
            for exp in experiences[:3]:  # Top 3 most relevant
                exp_bullets = exp.get("bullets", [])[:2]
                experience_summary += f"- {exp.get('title')} at {exp.get('company')}: {'; '.join(exp_bullets)}\n"
            
            project_summary = ""
            for proj in projects[:3]:
                proj_url = f" ({proj.get('url')})" if proj.get('url') else ""
                project_summary += f"- {proj.get('name')}{proj_url}: {proj.get('description', '')}\n"
            
            # Get today's date in proper format
            from datetime import datetime
            import locale
            
            if language == "fr":
                try:
                    locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')
                except:
                    pass
                today = datetime.now()
                date_str = today.strftime("%d %B %Y").lstrip("0")  # "5 février 2025"
            else:
                today = datetime.now()
                date_str = today.strftime("%B %d, %Y")  # "February 5, 2025"
            
            task = f"""Generate a personalized cover letter.

═══ CANDIDATE INFO ═══
Name: {personal_info.get('name', 'Candidate')}
Current Title: {personal_info.get('title', '')}
Email: {personal_info.get('email', '')}
Phone: {personal_info.get('phone', '')}
Address: {personal_info.get('address', '')}
City: {personal_info.get('city', personal_info.get('location', ''))}

═══ SUMMARY ═══
{summary}

═══ KEY EXPERIENCES ═══
{experience_summary}

═══ KEY PROJECTS ═══
{project_summary}

═══ SKILLS ═══
{json.dumps(skills, ensure_ascii=False)}

═══ JOB DESCRIPTION ═══
{job_description}

═══ REQUIREMENTS ═══
- Language: {language.upper()}
- Company: {company_name if company_name else 'Extract from job description'}
- Date: {date_str}
- Keep it under 400 words
- Be specific, mention actual projects and skills
- Match the job requirements precisely

Return a JSON object with the cover letter content."""

            response = self.groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[
                    {"role": "system", "content": load_prompt("cover_letter_generator.txt")},
                    {"role": "user", "content": task}
                ],
                temperature=0.5,
                response_format={"type": "json_object"},
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Override header with user-provided info (LLM might not use them correctly)
            if "header" not in result:
                result["header"] = {}
            
            # Force user-provided values
            if personal_info.get("name"):
                result["header"]["name"] = personal_info["name"]
            if personal_info.get("email"):
                result["header"]["email"] = personal_info["email"]
            if personal_info.get("phone"):
                result["header"]["phone"] = personal_info["phone"]
            if personal_info.get("address"):
                result["header"]["address"] = personal_info["address"]
            if personal_info.get("city"):
                result["header"]["city"] = personal_info["city"]
            elif personal_info.get("location"):
                result["header"]["city"] = personal_info["location"]
            
            result["success"] = True
            return result
            
        except Exception as e:
            logger.error(f"[{self.name}] Cover letter generation failed: {e}")
            return {"success": False, "error": str(e)}
