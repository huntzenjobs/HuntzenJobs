"""Tests unitaires pour Contact Finder V2."""

import pytest


class TestApolloTitles:
    """Verifie que les titres RH couvrent FR et EN."""

    def test_hr_titles_contains_french_variants(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        french_titles = ["recruteur", "chargé de recrutement", "DRH", "responsable RH", "HRBP"]
        for title in french_titles:
            assert title in PERSON_TITLES_HR, f"Missing FR title: {title}"

    def test_hr_titles_contains_english_variants(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        english_titles = ["recruiter", "talent acquisition manager", "HR manager", "head of talent"]
        for title in english_titles:
            assert title in PERSON_TITLES_HR, f"Missing EN title: {title}"

    def test_hr_titles_minimum_count(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        assert len(PERSON_TITLES_HR) >= 20, f"Only {len(PERSON_TITLES_HR)} titles, need >= 20"


class TestDomainGuessing:
    """Verify multi-TLD domain guessing with SSRF protection."""

    def test_slug_generation(self):
        from src.services.recruiter_finder.hunter import _generate_domain_slug
        assert _generate_domain_slug("La Banque Postale") == "la-banque-postale"
        assert _generate_domain_slug("BNP Paribas") == "bnp-paribas"
        assert _generate_domain_slug("L'Oréal") == "loreal"

    def test_ssrf_protection_rejects_ip(self):
        from src.services.recruiter_finder.hunter import _is_safe_slug
        assert not _is_safe_slug("192.168.1.1")
        assert not _is_safe_slug("127-0-0-1")
        assert _is_safe_slug("societe-generale")

    def test_domain_candidates_max_six(self):
        from src.services.recruiter_finder.hunter import _generate_domain_candidates
        candidates = _generate_domain_candidates("Societe Generale")
        assert len(candidates) <= 6


class TestLinkedInCompanyUrl:
    """Verify LinkedIn company URL construction."""

    def test_basic_slug(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("Societe Generale")
        assert url == "https://www.linkedin.com/company/societe-generale/people/?keywords=recruteur"

    def test_special_chars_removed(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("L'Oréal Group")
        assert "linkedin.com/company/" in url
        assert "'" not in url

    def test_custom_keywords(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("LVMH", keywords="recruiter")
        assert "keywords=recruiter" in url
