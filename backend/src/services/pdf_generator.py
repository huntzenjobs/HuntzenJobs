"""
PDF Generator Service
======================
Generates professional PDF CVs using WeasyPrint.

Features:
- Multiple templates (ATS, Modern)
- Auto-fit to 1 page
- HTML entity sanitization
- Compact mode fallback
"""

import html
import io
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

logger = logging.getLogger(__name__)

# Template directory
TEMPLATE_DIR = Path(__file__).parent.parent.parent / "templates" / "cv_pdf"


class PDFGenerator:
    """
    CV PDF Generator using WeasyPrint.
    
    Generates professional PDFs with:
    - ATS-friendly or Modern templates
    - Automatic 1-page fitting
    - Proper encoding handling
    """
    
    def __init__(self):
        """Initialize the PDF generator."""
        self.template_dir = TEMPLATE_DIR
        self.env = Environment(
            loader=FileSystemLoader(str(self.template_dir)),
            autoescape=select_autoescape(['html', 'xml']),
        )
        self.font_config = FontConfiguration()
        
        # Ensure template directory exists
        self.template_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"[PDFGenerator] Initialized with template dir: {self.template_dir}")
    
    def generate(
        self,
        cv_data: dict[str, Any],
        template: str = "ats",
        compact: bool = False,
        language: str = "en",
        photo_base64: Optional[str] = None,
    ) -> bytes:
        """
        Generate PDF from CV data.
        
        Args:
            cv_data: Structured CV data from adapter
            template: Template name (ats/modern/classic)
            compact: Use compact mode for fitting
            language: Output language
            photo_base64: Optional base64 encoded photo
            
        Returns:
            PDF bytes
        """
        try:
            # Sanitize and ensure required fields exist
            cv_data = self._sanitize_data(cv_data)
            cv_data = self._ensure_required_fields(cv_data)
            
            # Load template
            template_file = f"cv_{template}.html"
            
            try:
                jinja_template = self.env.get_template(template_file)
            except Exception as e:
                logger.warning(f"[PDFGenerator] Template {template_file} not found, using ats")
                jinja_template = self.env.get_template("cv_ats.html")
            
            # Render HTML with photo support
            html_content = jinja_template.render(
                cv=cv_data,
                compact=compact,
                language=language,
                photo_base64=photo_base64,
            )
            
            # Generate PDF (CSS is now embedded in templates)
            html_doc = HTML(string=html_content, base_url=str(self.template_dir))
            pdf_bytes = html_doc.write_pdf(font_config=self.font_config)
            
            logger.info(f"[PDFGenerator] Generated {template} PDF ({len(pdf_bytes)} bytes)")
            return pdf_bytes
            
        except Exception as e:
            logger.error(f"[PDFGenerator] Generation failed: {e}")
            raise
    
    def _sanitize_data(self, data: Any) -> Any:
        """
        Recursively sanitize data to fix HTML encoding issues.
        
        Fixes:
        - &lt; &gt; &amp; entities
        - Unicode issues
        - Whitespace normalization
        """
        if isinstance(data, dict):
            return {k: self._sanitize_data(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._sanitize_data(item) for item in data]
        elif isinstance(data, str):
            # Unescape HTML entities
            text = html.unescape(data)
            # Normalize whitespace
            text = ' '.join(text.split())
            # Remove any remaining problematic characters
            text = text.replace('\x00', '').replace('\ufffd', '')
            return text
        return data
    
    def _count_pages(self, pdf_bytes: bytes) -> int:
        """
        Count pages in a PDF.
        
        Uses a simple heuristic based on PDF structure.
        """
        try:
            # Simple page count from PDF structure
            content = pdf_bytes.decode('latin-1', errors='ignore')
            # Count /Type /Page occurrences (rough estimate)
            page_markers = content.count('/Type /Page')
            # Subtract catalog references
            return max(1, page_markers - content.count('/Type /Pages'))
        except Exception:
            return 1  # Assume 1 page on error
    
    def generate_preview_html(
        self,
        cv_data: dict[str, Any],
        template: str = "ats",
        compact: bool = False,
        language: str = "fr",
    ) -> str:
        """
        Generate HTML preview (for web display).

        Returns rendered HTML string for preview without PDF conversion.
        """
        cv_data = self._sanitize_data(cv_data)

        try:
            jinja_template = self.env.get_template(f"cv_{template}.html")
        except Exception:
            jinja_template = self.env.get_template("cv_ats.html")

        return jinja_template.render(cv=cv_data, compact=compact, language=language)
    
    def get_available_templates(self) -> list[dict]:
        """List available CV templates."""
        templates = []
        
        for html_file in self.template_dir.glob("cv_*.html"):
            name = html_file.stem.replace("cv_", "")
            templates.append({
                "id": name,
                "name": name.title(),
                "description": self._get_template_description(name),
            })
        
        # Default templates if none exist
        if not templates:
            templates = [
                {"id": "ats", "name": "ATS Optimized", "description": "Clean, parser-friendly format"},
                {"id": "modern", "name": "Modern", "description": "Two-column professional design"},
            ]
        
        return templates
    
    def _get_template_description(self, name: str) -> str:
        """Get template description."""
        descriptions = {
            "ats": "Clean, ATS-friendly single-column format. Best for job applications.",
            "modern": "Professional two-column design with sidebar. Great for creative roles.",
            "timeline": "Sidebar orange + timeline design. Like your original CV.",
            "minimal": "Minimalist design focusing on content. Works for all industries.",
        }
        return descriptions.get(name, "Professional CV template")
    
    def _ensure_required_fields(self, cv_data: dict) -> dict:
        """Ensure all required fields exist with default values."""
        # Ensure personal_info exists
        if "personal_info" not in cv_data:
            cv_data["personal_info"] = {}
        
        personal = cv_data["personal_info"]
        personal.setdefault("name", "")
        personal.setdefault("title", "")
        personal.setdefault("email", "")
        personal.setdefault("phone", "")
        personal.setdefault("location", "")
        personal.setdefault("linkedin", "")
        personal.setdefault("github", "")
        personal.setdefault("twitter", "")
        personal.setdefault("portfolio", "")
        personal.setdefault("driving_license", "")
        
        # Ensure other sections exist
        cv_data.setdefault("summary", "")
        cv_data.setdefault("experiences", [])
        cv_data.setdefault("education", [])
        cv_data.setdefault("skills", {})
        cv_data.setdefault("certifications", [])
        cv_data.setdefault("projects", [])
        cv_data.setdefault("interests", [])
        
        # Ensure skills is a dict (dynamic categories now supported)
        skills = cv_data["skills"]
        if isinstance(skills, list):
            # Convert list to dict with single category
            cv_data["skills"] = {"compétences": skills}
        elif not isinstance(skills, dict):
            cv_data["skills"] = {}
        
        return cv_data
    
    def generate_cover_letter(
        self,
        letter_data: dict[str, Any],
        language: str = "fr",
    ) -> bytes:
        """
        Generate PDF cover letter from letter data.
        
        Args:
            letter_data: Cover letter content from LLM
            language: Output language (fr/en)
            
        Returns:
            PDF bytes
        """
        try:
            # Sanitize data
            letter_data = self._sanitize_data(letter_data)
            
            # Ensure required fields
            letter_data.setdefault("header", {})
            letter_data["header"].setdefault("name", "")
            letter_data["header"].setdefault("email", "")
            letter_data["header"].setdefault("phone", "")
            letter_data["header"].setdefault("city", "")
            letter_data["header"].setdefault("address", "")
            letter_data.setdefault("company", "")
            letter_data.setdefault("date", "")
            letter_data.setdefault("subject", "")
            letter_data.setdefault("salutation", "Madame, Monsieur," if language == "fr" else "Dear Hiring Manager,")
            letter_data.setdefault("paragraph_1", "")
            letter_data.setdefault("paragraph_2", "")
            letter_data.setdefault("paragraph_3", "")
            letter_data.setdefault("closing", "")
            letter_data.setdefault("signature", letter_data["header"].get("name", ""))
            
            # Load template
            try:
                jinja_template = self.env.get_template("cover_letter.html")
            except Exception as e:
                logger.error(f"[PDFGenerator] Cover letter template not found: {e}")
                raise
            
            # Render HTML
            html_content = jinja_template.render(
                letter=letter_data,
                language=language,
            )
            
            # Generate PDF
            html_doc = HTML(string=html_content, base_url=str(self.template_dir))
            pdf_bytes = html_doc.write_pdf(font_config=self.font_config)
            
            logger.info(f"[PDFGenerator] Generated cover letter PDF ({len(pdf_bytes)} bytes)")
            return pdf_bytes
            
        except Exception as e:
            logger.error(f"[PDFGenerator] Cover letter generation failed: {e}")
            raise


# Singleton instance - Thread-safe
_pdf_generator: Optional[PDFGenerator] = None
_pdf_generator_lock = threading.Lock()


def get_pdf_generator() -> PDFGenerator:
    """Get PDF generator singleton (thread-safe)."""
    global _pdf_generator

    if _pdf_generator is None:  # Fast path (no lock)
        with _pdf_generator_lock:
            if _pdf_generator is None:  # Double-check inside lock
                _pdf_generator = PDFGenerator()
                logger.info("[pdf_generator] PDFGenerator singleton created")

    return _pdf_generator
