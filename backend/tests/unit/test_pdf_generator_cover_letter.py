from src.services.pdf_generator import PDFGenerator


def test_cover_letter_subject_removes_rendered_french_prefix() -> None:
    letter = {"subject": "Objet : Candidature pour le poste de Data Engineer"}

    normalized = PDFGenerator._normalize_cover_letter_subject(letter, "fr")

    assert normalized["subject"] == "Candidature pour le poste de Data Engineer"


def test_cover_letter_subject_removes_rendered_english_prefix() -> None:
    letter = {"subject": "Re: Application for Data Engineer"}

    normalized = PDFGenerator._normalize_cover_letter_subject(letter, "en")

    assert normalized["subject"] == "Application for Data Engineer"
