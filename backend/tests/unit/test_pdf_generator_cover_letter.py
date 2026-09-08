from src.services.pdf_generator import PDFGenerator


def _cv_with_project_technologies(technologies: object) -> dict:
    return {
        "personal_info": {"name": "Test User"},
        "projects": [
            {
                "name": "Projet test",
                "technologies": technologies,
                "description": "Description conservée",
            }
        ],
    }


def test_cover_letter_subject_removes_rendered_french_prefix() -> None:
    letter = {"subject": "Objet : Candidature pour le poste de Data Engineer"}

    normalized = PDFGenerator._normalize_cover_letter_subject(letter, "fr")

    assert normalized["subject"] == "Candidature pour le poste de Data Engineer"


def test_cover_letter_subject_removes_rendered_english_prefix() -> None:
    letter = {"subject": "Re: Application for Data Engineer"}

    normalized = PDFGenerator._normalize_cover_letter_subject(letter, "en")

    assert normalized["subject"] == "Application for Data Engineer"


def test_pdf_preview_renders_project_technologies_without_python_syntax() -> None:
    html = PDFGenerator().generate_preview_html(
        _cv_with_project_technologies(["Python", "React"]),
        template="ats",
        language="fr",
    )

    assert "Python, React" in html
    assert "['Python', 'React']" not in html


def test_pdf_preview_keeps_string_project_technologies_unchanged() -> None:
    html = PDFGenerator().generate_preview_html(
        _cv_with_project_technologies("Python, React"),
        template="ats",
        language="fr",
    )

    assert "Python, React" in html


def test_pdf_preview_escapes_project_technology_html() -> None:
    html = PDFGenerator().generate_preview_html(
        _cv_with_project_technologies(["Python <script>", "React & Vue"]),
        template="ats",
        language="fr",
    )

    assert "Python &lt;script&gt;, React &amp; Vue" in html
    assert "<script>" not in html


def test_pdf_preview_omits_technology_separator_for_empty_list() -> None:
    html = PDFGenerator().generate_preview_html(
        _cv_with_project_technologies([]),
        template="ats",
        language="fr",
    )

    assert 'class="proj-tech"' not in html
    assert "Projet test" in html
    assert "Description conservée" in html
