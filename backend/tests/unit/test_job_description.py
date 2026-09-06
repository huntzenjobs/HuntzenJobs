"""La description doit exclure la navigation et les autres offres."""

import json

from src.api.routes.jobs import _extract_job_description


def test_structured_description_excludes_page_chrome():
    description = "<p>Vos missions : surveiller les machines et contrôler la qualité.</p><ul><li>Horaires de journée.</li></ul>"
    page = '<main>Dernière recherche <a>Postes similaires</a></main>'
    page += '<script type="application/ld+json">' + json.dumps({
        "@graph": [{"@type": "JobPosting", "description": description}],
    }) + '</script>'
    result = _extract_job_description(page)
    assert "surveiller les machines" in result
    assert "<li>Horaires de journée.</li>" in result
    assert "Dernière recherche" not in result
    assert "Postes similaires" not in result


def test_generic_main_is_not_a_description():
    page = '<main><p>' + 'Recevez des offres similaires par email. ' * 20 + '</p></main>'
    assert _extract_job_description(page) == ""


def test_specific_description_removes_navigation_and_empty_spacing():
    page = '''<section class="job-description">
        <nav><a href="/search">Dernière recherche</a></nav>
        <p>Surveiller les machines et contrôler la qualité de la production.</p>
        <p>\u00a0</p><p><br><br></p>
        <form>Créer une alerte</form>
        <p>Travail de journée du lundi au vendredi.</p>
    </section>'''
    result = _extract_job_description(page)
    assert "Surveiller les machines" in result
    assert "Travail de journée" in result
    assert "Dernière recherche" not in result
    assert "Créer une alerte" not in result
    assert "<br" not in result


def test_search_page_with_multiple_jobs_is_not_a_single_description():
    page = '<script type="application/ld+json">' + json.dumps([
        {"@type": "JobPosting", "description": "Premier poste " * 20},
        {"@type": "JobPosting", "description": "Autre poste " * 20},
    ]) + '</script>'
    assert _extract_job_description(page) == ""


def test_invalid_json_does_not_hide_a_specific_description():
    page = '<script type="application/ld+json">invalid</script>'
    page += '<div itemprop="description"><p>Contrôler la qualité de la production et entretenir les équipements.</p></div>'
    assert "entretenir les équipements" in _extract_job_description(page)


def test_long_description_keeps_the_last_paragraph():
    description = '<p>Une mission industrielle détaillée.</p>' * 250 + '<p>Dernière condition : horaires de journée.</p>'
    page = '<script type="application/ld+json">' + json.dumps({
        "@type": "JobPosting", "description": description,
    }) + '</script>'
    assert _extract_job_description(page).endswith('<p>Dernière condition : horaires de journée.</p>')
