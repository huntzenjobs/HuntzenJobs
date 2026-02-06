"""
DynamicPDF Service
===================
Generates professional PDF CVs using DynamicPDF Cloud API.

Two templates available:
- Modern: Beautiful 2-column design with photo (for direct HR contact)
- ATS: Simple 1-column design optimized for ATS systems (90%+ score)
"""

import base64
import html
import logging
import httpx
from typing import Any, Optional

from src.config.settings import settings

logger = logging.getLogger(__name__)

DYNAMICPDF_API_URL = "https://api.dynamicpdf.com/v1.0/pdf"


class DynamicPDFGenerator:
    """
    CV PDF Generator using DynamicPDF Cloud API.
    
    Templates:
    - modern: 2-column, photo, timeline - beautiful but less ATS friendly
    - ats: 1-column, no graphics - 90%+ ATS score guaranteed
    """
    
    def __init__(self):
        """Initialize DynamicPDF generator."""
        self.api_key = settings.get_dynamic_pdf_key()
        if not self.api_key:
            logger.warning("[DynamicPDF] No API key configured!")
    
    async def generate(
        self,
        cv_data: dict[str, Any],
        template: str = "ats",
        language: str = "fr",
        photo_base64: Optional[str] = None,
    ) -> bytes:
        """
        Generate PDF from CV data using DynamicPDF API.
        
        Args:
            cv_data: Structured CV data
            template: 'modern' or 'ats'
            language: Output language
            photo_base64: Base64 encoded photo (for modern template)
            
        Returns:
            PDF bytes
        """
        try:
            # Sanitize data and ensure required fields exist
            cv_data = self._sanitize_data(cv_data)
            cv_data = self._ensure_required_fields(cv_data)
            
            logger.info(f"[DynamicPDF] Generating {template} PDF for: {cv_data.get('personal_info', {}).get('name', 'Unknown')}")
            
            # Generate HTML based on template
            if template == "modern":
                html_content = self._generate_modern_html(cv_data, photo_base64, language)
            else:
                html_content = self._generate_ats_html(cv_data, language)
            
            # Call DynamicPDF API
            pdf_bytes = await self._call_api(html_content)
            
            logger.info(f"[DynamicPDF] Generated {template} PDF, size: {len(pdf_bytes)} bytes")
            return pdf_bytes
            
        except Exception as e:
            logger.error(f"[DynamicPDF] Generation failed: {e}")
            raise
    
    def _ensure_required_fields(self, cv_data: dict) -> dict:
        """Ensure all required fields exist with default values."""
        # Ensure personal_info exists
        if "personal_info" not in cv_data or cv_data["personal_info"] is None:
            cv_data["personal_info"] = {}
        
        personal = cv_data["personal_info"]
        personal["name"] = personal.get("name") or "Candidate Name"
        personal["title"] = personal.get("title") or "Professional"
        personal["email"] = personal.get("email") or ""
        personal["phone"] = personal.get("phone") or ""
        personal["location"] = personal.get("location") or ""
        personal["linkedin"] = personal.get("linkedin") or ""
        personal["portfolio"] = personal.get("portfolio") or ""
        
        # Ensure other sections exist with non-null values
        cv_data["summary"] = cv_data.get("summary") or ""
        cv_data["experiences"] = cv_data.get("experiences") or []
        cv_data["education"] = cv_data.get("education") or []
        cv_data["certifications"] = cv_data.get("certifications") or []
        
        # Ensure each experience has all required fields
        for exp in cv_data["experiences"]:
            exp["title"] = exp.get("title") or ""
            exp["company"] = exp.get("company") or ""
            exp["location"] = exp.get("location") or ""
            exp["start_date"] = exp.get("start_date") or ""
            exp["end_date"] = exp.get("end_date") or "Present"
            exp["bullets"] = exp.get("bullets") or []
        
        # Ensure each education has all required fields
        for edu in cv_data["education"]:
            edu["degree"] = edu.get("degree") or ""
            edu["school"] = edu.get("school") or ""
            edu["year"] = edu.get("year") or ""
            edu["details"] = edu.get("details") or ""
        
        # Ensure skills has proper structure
        skills = cv_data.get("skills") or {}
        if isinstance(skills, list):
            cv_data["skills"] = {"technical": skills, "tools": [], "soft": [], "languages": []}
        else:
            cv_data["skills"] = {
                "technical": skills.get("technical") or [],
                "tools": skills.get("tools") or [],
                "soft": skills.get("soft") or [],
                "languages": skills.get("languages") or [],
            }
        
        return cv_data
    
    async def _call_api(self, html_content: str) -> bytes:
        """Call DynamicPDF API to convert HTML to PDF."""
        # Build the correct JSON structure per DynamicPDF docs
        # NO "instructions" wrapper - just direct inputs array
        payload = {
            "author": "HuntZen CV Adapter",
            "title": "Adapted CV",
            "inputs": [
                {
                    "type": "html",
                    "htmlString": html_content,
                    "pageWidth": 210,
                    "pageHeight": 297,
                    "unit": "millimeter",
                }
            ]
        }
        
        logger.debug(f"[DynamicPDF] Sending request to API...")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                DYNAMICPDF_API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"[DynamicPDF] API error: {response.status_code} - {error_text}")
                raise Exception(f"DynamicPDF API error: {response.status_code}")
            
            return response.content
    
    def _sanitize_data(self, data: Any) -> Any:
        """Recursively sanitize data - fix HTML entities and null values."""
        if data is None:
            return ""
        if isinstance(data, str):
            # Unescape HTML entities and remove problematic characters
            result = html.unescape(data)
            # Replace any remaining problematic characters
            result = result.replace("\u0000", "")  # Null char
            return result
        elif isinstance(data, dict):
            return {k: self._sanitize_data(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._sanitize_data(item) for item in data]
        return data
    
    def _generate_modern_html(
        self, cv_data: dict, photo_base64: Optional[str], language: str
    ) -> str:
        """Generate modern 2-column CV HTML."""
        personal = cv_data.get("personal_info", {})
        experiences = cv_data.get("experiences", [])
        education = cv_data.get("education", [])
        skills = cv_data.get("skills", {})
        certifications = cv_data.get("certifications", [])
        
        # Labels based on language
        labels = {
            "fr": {
                "experience": "Expériences Professionnelles",
                "education": "Formations",
                "skills": "Compétences",
                "languages": "Langues",
                "soft_skills": "Soft Skills",
                "links": "Liens",
                "certifications": "Certifications",
                "contact": "Contact",
            },
            "en": {
                "experience": "Professional Experience",
                "education": "Education",
                "skills": "Skills",
                "languages": "Languages",
                "soft_skills": "Soft Skills",
                "links": "Links",
                "certifications": "Certifications",
                "contact": "Contact",
            }
        }.get(language, {})
        
        # Default labels
        labels = labels or {
            "experience": "Experience", "education": "Education",
            "skills": "Skills", "languages": "Languages",
            "soft_skills": "Soft Skills", "links": "Links",
            "certifications": "Certifications", "contact": "Contact"
        }
        
        # Photo section
        photo_html = ""
        if photo_base64:
            photo_html = f'<img src="data:image/jpeg;base64,{photo_base64}" class="photo" alt="Photo">'
        else:
            photo_html = '<div class="photo-placeholder"></div>'
        
        # Build experience HTML with timeline
        exp_html = ""
        for exp in experiences[:5]:
            bullets = "".join(f"<li>{b}</li>" for b in exp.get("bullets", [])[:4])
            exp_html += f"""
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="job-title">{exp.get('title', '')}</div>
                    <div class="job-meta">
                        {exp.get('start_date', '')} - {exp.get('end_date', '')} 
                        <span class="company">{exp.get('company', '')}</span>
                        {exp.get('location', '')}
                    </div>
                    <ul class="bullets">{bullets}</ul>
                </div>
            </div>
            """
        
        # Build education HTML with timeline
        edu_html = ""
        for edu in education[:4]:
            details = f"<p class='edu-details'>{edu.get('details', '')}</p>" if edu.get('details') else ""
            edu_html += f"""
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="edu-title">{edu.get('degree', '')}</div>
                    <div class="edu-meta">{edu.get('year', '')} <span class="school">{edu.get('school', '')}</span></div>
                    {details}
                </div>
            </div>
            """
        
        # Skills sections
        technical = skills.get("technical", [])
        tools = skills.get("tools", [])
        soft = skills.get("soft", [])
        languages = skills.get("languages", [])
        
        def skill_list(items, title):
            if not items:
                return ""
            items_html = "".join(f"<span class='skill-tag'>{s}</span>" for s in items[:8])
            return f"<div class='skill-group'><h4>{title}</h4><div class='skill-tags'>{items_html}</div></div>"
        
        skills_html = ""
        if technical:
            skills_html += f"<div class='skill-category'><h4>Tech Stack</h4><p>{', '.join(technical[:12])}</p></div>"
        if tools:
            skills_html += f"<div class='skill-category'><h4>Tools</h4><p>{', '.join(tools[:10])}</p></div>"
        
        # Languages
        lang_html = ""
        if languages:
            lang_html = "<div class='languages'>"
            for lang in languages[:4]:
                lang_html += f"<div class='lang-item'><strong>{lang}</strong></div>"
            lang_html += "</div>"
        
        # Soft skills
        soft_html = ""
        if soft:
            soft_html = "<div class='soft-skills'>"
            for s in soft[:5]:
                soft_html += f"<div class='soft-item'>{s}</div>"
            soft_html += "</div>"
        
        # Contact info
        contact_html = f"""
        <div class="contact-item"><span class="icon">✉</span> {personal.get('email', '')}</div>
        <div class="contact-item"><span class="icon">📍</span> {personal.get('location', '')}</div>
        """
        if personal.get('phone'):
            contact_html += f'<div class="contact-item"><span class="icon">📞</span> {personal.get("phone")}</div>'
        if personal.get('linkedin'):
            contact_html += f'<div class="contact-item"><span class="icon">🔗</span> {personal.get("linkedin")}</div>'
        if personal.get('portfolio'):
            contact_html += f'<div class="contact-item"><span class="icon">🌐</span> {personal.get("portfolio")}</div>'
        
        # Certifications
        cert_html = ""
        if certifications:
            cert_html = f"<h3>{labels['certifications']}</h3><div class='certifications'>"
            for cert in certifications[:4]:
                cert_html += f"<div class='cert-item'><strong>{cert.get('name', '')}</strong><br>{cert.get('issuer', '')} - {cert.get('year', '')}</div>"
            cert_html += "</div>"
        
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 9pt;
            line-height: 1.4;
            color: #1a1a1a;
            background: #fff;
        }}
        
        .container {{
            display: flex;
            min-height: 100vh;
        }}
        
        /* Left Sidebar */
        .sidebar {{
            width: 200px;
            background: linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #fff;
            padding: 0;
            position: relative;
        }}
        
        .sidebar-header {{
            background: linear-gradient(135deg, #00b4d8 0%, #0077b6 100%);
            padding: 20px 15px;
            clip-path: polygon(0 0, 100% 0, 100% 85%, 0 100%);
            padding-bottom: 40px;
        }}
        
        .photo {{
            width: 100px;
            height: 100px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid #fff;
            margin-bottom: 10px;
        }}
        
        .photo-placeholder {{
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            margin-bottom: 10px;
        }}
        
        .sidebar-content {{
            padding: 20px 15px;
        }}
        
        .sidebar h3 {{
            font-size: 10pt;
            font-weight: 600;
            color: #00b4d8;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        
        .contact-item {{
            margin-bottom: 8px;
            font-size: 8pt;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }}
        
        .contact-item .icon {{
            width: 16px;
            text-align: center;
        }}
        
        .skill-category {{
            margin-bottom: 12px;
        }}
        
        .skill-category h4 {{
            font-size: 9pt;
            font-weight: 600;
            color: #00b4d8;
            margin-bottom: 4px;
        }}
        
        .skill-category p {{
            font-size: 8pt;
            color: #ccc;
            line-height: 1.5;
        }}
        
        .languages, .soft-skills {{
            margin-top: 15px;
        }}
        
        .lang-item, .soft-item {{
            font-size: 8pt;
            padding: 4px 0;
            border-bottom: 1px solid #444;
        }}
        
        .certifications {{
            margin-top: 8px;
        }}
        
        .cert-item {{
            font-size: 8pt;
            margin-bottom: 8px;
            color: #ccc;
        }}
        
        .cert-item strong {{
            color: #fff;
        }}
        
        /* Main Content */
        .main {{
            flex: 1;
            padding: 25px 30px;
        }}
        
        .header {{
            margin-bottom: 20px;
        }}
        
        .name {{
            font-size: 24pt;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 5px;
        }}
        
        .title {{
            font-size: 11pt;
            color: #666;
            margin-bottom: 15px;
        }}
        
        .summary {{
            font-size: 9pt;
            color: #444;
            line-height: 1.6;
            padding-bottom: 15px;
            border-bottom: 2px solid #00b4d8;
        }}
        
        .section {{
            margin-top: 20px;
        }}
        
        .section h2 {{
            font-size: 12pt;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .section h2::before {{
            content: '';
            width: 4px;
            height: 20px;
            background: #00b4d8;
            border-radius: 2px;
        }}
        
        /* Timeline */
        .timeline {{
            position: relative;
            padding-left: 20px;
        }}
        
        .timeline::before {{
            content: '';
            position: absolute;
            left: 5px;
            top: 5px;
            bottom: 5px;
            width: 2px;
            background: #e0e0e0;
        }}
        
        .timeline-item {{
            position: relative;
            margin-bottom: 15px;
            padding-bottom: 10px;
        }}
        
        .timeline-dot {{
            position: absolute;
            left: -19px;
            top: 5px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #00b4d8;
            border: 2px solid #fff;
            box-shadow: 0 0 0 2px #00b4d8;
        }}
        
        .job-title, .edu-title {{
            font-size: 10pt;
            font-weight: 600;
            color: #1a1a1a;
        }}
        
        .job-meta, .edu-meta {{
            font-size: 8pt;
            color: #666;
            margin-top: 2px;
        }}
        
        .company, .school {{
            color: #00b4d8;
            font-weight: 500;
        }}
        
        .bullets {{
            margin-top: 8px;
            padding-left: 15px;
        }}
        
        .bullets li {{
            font-size: 8pt;
            color: #444;
            margin-bottom: 4px;
            line-height: 1.4;
        }}
        
        .edu-details {{
            font-size: 8pt;
            color: #666;
            margin-top: 5px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="sidebar-header">
                {photo_html}
            </div>
            <div class="sidebar-content">
                <h3>{labels['contact']}</h3>
                {contact_html}
                
                <h3 style="margin-top: 20px;">{labels['skills']}</h3>
                {skills_html}
                
                <h3 style="margin-top: 20px;">{labels['languages']}</h3>
                {lang_html}
                
                <h3 style="margin-top: 20px;">{labels['soft_skills']}</h3>
                {soft_html}
                
                {cert_html}
            </div>
        </div>
        
        <div class="main">
            <div class="header">
                <div class="name">{personal.get('name', 'Name')}</div>
                <div class="title">{personal.get('title', 'Professional Title')}</div>
                <div class="summary">{cv_data.get('summary', '')}</div>
            </div>
            
            <div class="section">
                <h2>{labels['experience']}</h2>
                <div class="timeline">
                    {exp_html}
                </div>
            </div>
            
            <div class="section">
                <h2>{labels['education']}</h2>
                <div class="timeline">
                    {edu_html}
                </div>
            </div>
        </div>
    </div>
</body>
</html>"""
    
    def _generate_ats_html(self, cv_data: dict, language: str) -> str:
        """Generate ATS-optimized 1-column CV HTML."""
        personal = cv_data.get("personal_info", {})
        experiences = cv_data.get("experiences", [])
        education = cv_data.get("education", [])
        skills = cv_data.get("skills", {})
        certifications = cv_data.get("certifications", [])
        
        # Labels
        labels = {
            "fr": {
                "experience": "EXPÉRIENCE PROFESSIONNELLE",
                "education": "FORMATION",
                "skills": "COMPÉTENCES",
                "certifications": "CERTIFICATIONS",
            },
            "en": {
                "experience": "PROFESSIONAL EXPERIENCE",
                "education": "EDUCATION",
                "skills": "SKILLS",
                "certifications": "CERTIFICATIONS",
            }
        }.get(language, {"experience": "EXPERIENCE", "education": "EDUCATION", "skills": "SKILLS", "certifications": "CERTIFICATIONS"})
        
        # Experience section
        exp_html = ""
        for exp in experiences[:5]:
            bullets = "".join(f"<li>{b}</li>" for b in exp.get("bullets", [])[:5])
            exp_html += f"""
            <div class="exp-item">
                <div class="exp-header">
                    <div class="exp-title">{exp.get('title', '')}</div>
                    <div class="exp-date">{exp.get('start_date', '')} - {exp.get('end_date', '')}</div>
                </div>
                <div class="exp-company">{exp.get('company', '')} | {exp.get('location', '')}</div>
                <ul class="exp-bullets">{bullets}</ul>
            </div>
            """
        
        # Education section
        edu_html = ""
        for edu in education[:4]:
            details = f" - {edu.get('details')}" if edu.get('details') else ""
            edu_html += f"""
            <div class="edu-item">
                <div class="edu-header">
                    <div class="edu-degree">{edu.get('degree', '')}</div>
                    <div class="edu-year">{edu.get('year', '')}</div>
                </div>
                <div class="edu-school">{edu.get('school', '')}{details}</div>
            </div>
            """
        
        # Skills (flat list for ATS)
        technical = skills.get("technical", [])
        tools = skills.get("tools", [])
        soft = skills.get("soft", [])
        languages = skills.get("languages", [])
        
        all_skills = []
        if technical:
            all_skills.append(f"<strong>Technical:</strong> {', '.join(technical)}")
        if tools:
            all_skills.append(f"<strong>Tools:</strong> {', '.join(tools)}")
        if soft:
            all_skills.append(f"<strong>Soft Skills:</strong> {', '.join(soft)}")
        if languages:
            all_skills.append(f"<strong>Languages:</strong> {', '.join(languages)}")
        
        skills_html = "<br>".join(all_skills)
        
        # Certifications
        cert_html = ""
        if certifications:
            certs = [f"{c.get('name', '')} - {c.get('issuer', '')} ({c.get('year', '')})" for c in certifications[:5]]
            cert_html = f"""
            <div class="section">
                <h2>{labels['certifications']}</h2>
                <p>{'  •  '.join(certs)}</p>
            </div>
            """
        
        # Contact line
        contact_parts = [personal.get('email', '')]
        if personal.get('phone'):
            contact_parts.append(personal.get('phone'))
        if personal.get('location'):
            contact_parts.append(personal.get('location'))
        if personal.get('linkedin'):
            contact_parts.append(personal.get('linkedin'))
        contact_line = "  |  ".join(filter(None, contact_parts))
        
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Open Sans', Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #000;
            background: #fff;
            padding: 30px 40px;
        }}
        
        .header {{
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #000;
        }}
        
        .name {{
            font-size: 22pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 5px;
        }}
        
        .title {{
            font-size: 12pt;
            font-weight: 600;
            color: #333;
            margin-bottom: 10px;
        }}
        
        .contact {{
            font-size: 9pt;
            color: #444;
        }}
        
        .summary {{
            margin: 15px 0;
            font-size: 10pt;
            line-height: 1.5;
            color: #333;
        }}
        
        .section {{
            margin-top: 20px;
        }}
        
        .section h2 {{
            font-size: 11pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid #000;
            padding-bottom: 5px;
            margin-bottom: 12px;
        }}
        
        .exp-item, .edu-item {{
            margin-bottom: 15px;
        }}
        
        .exp-header, .edu-header {{
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }}
        
        .exp-title, .edu-degree {{
            font-weight: 700;
            font-size: 10pt;
        }}
        
        .exp-date, .edu-year {{
            font-size: 9pt;
            color: #555;
        }}
        
        .exp-company, .edu-school {{
            font-size: 9pt;
            color: #333;
            margin-top: 2px;
            font-style: italic;
        }}
        
        .exp-bullets {{
            margin-top: 5px;
            padding-left: 20px;
        }}
        
        .exp-bullets li {{
            font-size: 9pt;
            margin-bottom: 3px;
            line-height: 1.4;
        }}
        
        .skills-content {{
            font-size: 9pt;
            line-height: 1.8;
        }}
        
        .skills-content strong {{
            font-weight: 600;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="name">{personal.get('name', 'NAME')}</div>
        <div class="title">{personal.get('title', 'Professional Title')}</div>
        <div class="contact">{contact_line}</div>
    </div>
    
    <div class="summary">{cv_data.get('summary', '')}</div>
    
    <div class="section">
        <h2>{labels['experience']}</h2>
        {exp_html}
    </div>
    
    <div class="section">
        <h2>{labels['education']}</h2>
        {edu_html}
    </div>
    
    <div class="section">
        <h2>{labels['skills']}</h2>
        <div class="skills-content">{skills_html}</div>
    </div>
    
    {cert_html}
</body>
</html>"""


# Singleton instance
_dynamic_pdf_generator: Optional[DynamicPDFGenerator] = None


def get_dynamic_pdf_generator() -> DynamicPDFGenerator:
    """Get DynamicPDF generator singleton."""
    global _dynamic_pdf_generator
    if _dynamic_pdf_generator is None:
        _dynamic_pdf_generator = DynamicPDFGenerator()
    return _dynamic_pdf_generator
