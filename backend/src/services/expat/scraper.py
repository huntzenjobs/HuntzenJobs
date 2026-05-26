"""
Expat RAG — Official Sources Scraper
======================================
Scrape les sources officielles (service-public.fr, canada.ca, make-it-in-germany.com…)
pour alimenter le pipeline RAG de l'agent Expadation.

Pipeline par URL :
    httpx (HTTP/2) → selectolax (parse HTML) → markdownify (HTML→Markdown)

Politesse :
    - Retry tenacity 3× sur 429/503
    - Délai 2 s entre requêtes du même domaine (sleep simple dans scrape_all_sources)
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from markdownify import markdownify as md
from selectolax.parser import HTMLParser
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registre des sources officielles
# Extensible : ajouter de nouvelles entrées sans modifier la logique de scraping
# ---------------------------------------------------------------------------
_SP = "https://www.service-public.fr/particuliers/vosdroits/"
_CA = "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/"
_MIG = "https://www.make-it-in-germany.com/fr/visa-sejour/"

SOURCE_REGISTRY: dict[str, list[dict[str, str]]] = {
    # ── FRANCE — fiches service-public.fr (identifiants vérifiés) ────────────
    "FR": [
        {"url": _SP + "F2231", "visa_type": "etudiant", "content_selector": "#page-content"},
        {"url": _SP + "F35796", "visa_type": "etudiant-mobilite", "content_selector": "#page-content"},
        {"url": _SP + "F17312", "visa_type": "stagiaire", "content_selector": "#page-content"},
        {"url": _SP + "F15898", "visa_type": "salarie", "content_selector": "#page-content"},
        {"url": _SP + "F16922", "visa_type": "talent", "content_selector": "#page-content"},
        {"url": _SP + "F35795", "visa_type": "entrepreneur", "content_selector": "#page-content"},
        {"url": _SP + "F21516", "visa_type": "saisonnier", "content_selector": "#page-content"},
        {"url": _SP + "F17319", "visa_type": "recherche-emploi", "content_selector": "#page-content"},
        {"url": _SP + "F2209", "visa_type": "vie-privee-familiale", "content_selector": "#page-content"},
        {"url": _SP + "F2208", "visa_type": "resident", "content_selector": "#page-content"},
        {"url": _SP + "F17359", "visa_type": "resident-longue-duree-ue", "content_selector": "#page-content"},
        {"url": _SP + "F35799", "visa_type": "pluriannuelle", "content_selector": "#page-content"},
        {"url": _SP + "F302", "visa_type": "visiteur", "content_selector": "#page-content"},
        {"url": _SP + "F39", "visa_type": "sejour-plus-3-mois", "content_selector": "#page-content"},
        {"url": _SP + "F17048", "visa_type": "integration", "content_selector": "#page-content"},
    ],
    # ── CANADA — canada.ca (IRCC) ────────────────────────────────────────────
    "CA": [
        {"url": _CA + "etudier-canada/permis-etudes/admissibilite.html", "visa_type": "permis-etudes", "content_selector": "main"},
        {"url": _CA + "travailler-canada/permis/temporaire/admissibilite.html", "visa_type": "permis-travail", "content_selector": "main"},
        {"url": _CA + "immigrer-canada/entree-express/admissibilite.html", "visa_type": "entree-express", "content_selector": "main"},
    ],
    # ── ALLEMAGNE — make-it-in-germany.com ───────────────────────────────────
    "DE": [
        {"url": _MIG + "loi-immigration-travailleurs-qualifies", "visa_type": "travailleur-qualifie", "content_selector": ""},
        {"url": _MIG + "types/carte-bleue-europeenne", "visa_type": "carte-bleue-ue", "content_selector": ""},
        {"url": _MIG + "residence-permanente", "visa_type": "residence-permanente", "content_selector": ""},
        {"url": _MIG + "regroupement-familial", "visa_type": "regroupement-familial", "content_selector": ""},
    ],
    # ── ROYAUME-UNI — gov.uk ─────────────────────────────────────────────────
    "GB": [
        {"url": "https://www.gov.uk/skilled-worker-visa", "visa_type": "salarie-qualifie", "content_selector": ""},
        {"url": "https://www.gov.uk/student-visa", "visa_type": "etudiant", "content_selector": ""},
        {"url": "https://www.gov.uk/global-talent", "visa_type": "talent", "content_selector": ""},
        {"url": "https://www.gov.uk/graduate-visa", "visa_type": "diplome", "content_selector": ""},
        {"url": "https://www.gov.uk/health-care-worker-visa", "visa_type": "personnel-sante", "content_selector": ""},
    ],
    # ── ETATS-UNIS — travel.state.gov ────────────────────────────────────────
    "US": [
        {"url": "https://travel.state.gov/content/travel/en/us-visas/immigrate.html", "visa_type": "immigration", "content_selector": ""},
        {"url": "https://travel.state.gov/content/travel/en/us-visas/study.html", "visa_type": "etudiant", "content_selector": ""},
        {"url": "https://travel.state.gov/content/travel/en/us-visas/employment.html", "visa_type": "emploi", "content_selector": ""},
        {"url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/the-immigrant-visa-process.html", "visa_type": "processus-visa-immigrant", "content_selector": ""},
    ],
    # ── IRLANDE — irishimmigration.ie ────────────────────────────────────────
    "IE": [
        {"url": "https://www.irishimmigration.ie/coming-to-work-in-ireland/", "visa_type": "travail", "content_selector": ""},
        {"url": "https://www.irishimmigration.ie/coming-to-study-in-ireland/", "visa_type": "etudes", "content_selector": ""},
        {"url": "https://www.irishimmigration.ie/coming-to-live-in-ireland/", "visa_type": "sejour", "content_selector": ""},
    ],
    # ── BELGIQUE — Office des etrangers ──────────────────────────────────────
    "BE": [
        {"url": "https://dofi.ibz.be/fr/themes/ressortissants-dun-pays-tiers/travail", "visa_type": "travail", "content_selector": ""},
    ],
    # ── SUISSE — sem.admin.ch ────────────────────────────────────────────────
    "CH": [
        {"url": "https://www.sem.admin.ch/sem/fr/home/themen/aufenthalt.html", "visa_type": "sejour", "content_selector": ""},
        {"url": "https://www.sem.admin.ch/sem/fr/home/themen/arbeit.html", "visa_type": "travail", "content_selector": ""},
    ],
    # ── SUEDE — migrationsverket.se ──────────────────────────────────────────
    "SE": [
        {"url": "https://www.migrationsverket.se/English/Private-individuals/Working-in-Sweden.html", "visa_type": "travail", "content_selector": ""},
        {"url": "https://www.migrationsverket.se/English/Private-individuals/Studying-in-Sweden.html", "visa_type": "etudes", "content_selector": ""},
    ],
    # ── NORVEGE — udi.no ─────────────────────────────────────────────────────
    "NO": [
        {"url": "https://www.udi.no/en/want-to-apply/work-immigration/", "visa_type": "travail", "content_selector": ""},
        {"url": "https://www.udi.no/en/want-to-apply/studies/", "visa_type": "etudes", "content_selector": ""},
    ],
    # ── FINLANDE — migri.fi ──────────────────────────────────────────────────
    "FI": [
        {"url": "https://migri.fi/en/working-in-finland", "visa_type": "travail", "content_selector": ""},
        {"url": "https://migri.fi/en/studying-in-finland", "visa_type": "etudes", "content_selector": ""},
    ],
    # ── JAPON — mofa.go.jp ───────────────────────────────────────────────────
    "JP": [
        {"url": "https://www.mofa.go.jp/j_info/visit/visa/index.html", "visa_type": "visa", "content_selector": ""},
    ],
}

# Balises à supprimer avant conversion Markdown
_TAGS_TO_REMOVE: list[str] = [
    "nav", "footer", "header", "aside", "script", "style",
    "noscript", "iframe", "form", "button", "svg", "img",
]

# En-têtes HTTP réalistes pour éviter les blocages basiques
# En-têtes navigateur complets : les sites .gouv (canada.ca notamment) refusent
# les requêtes sans les en-têtes Sec-* / Sec-Fetch-* émis par un vrai navigateur.
_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}


# ---------------------------------------------------------------------------
# Helpers internes
# ---------------------------------------------------------------------------

def _is_retryable_scrape(exc: BaseException) -> bool:
    """Retente sur erreurs réseau et statuts 429 / 503."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, _ScraperHTTPError) and exc.status_code in {429, 503}:
        return True
    return False


class _ScraperHTTPError(Exception):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"HTTP {status_code} pour {url}")
        self.status_code = status_code


def _extract_content(html: str, content_selector: str) -> str:
    """
    Extrait la zone de contenu principale depuis le HTML.

    Ordre de préférence :
      1. content_selector si fourni
      2. <main>
      3. <article>
      4. <body>
    """
    tree = HTMLParser(html)

    # Supprimer les balises parasites
    for tag in _TAGS_TO_REMOVE:
        for node in tree.css(tag):
            node.decompose()

    # Chercher la zone de contenu
    node = None
    if content_selector:
        node = tree.css_first(content_selector)
    if node is None:
        node = tree.css_first("main")
    if node is None:
        node = tree.css_first("article")
    if node is None:
        node = tree.body

    if node is None:
        return ""

    return node.html or ""


def _extract_title(html: str) -> str:
    """Extrait le titre de la page depuis <title> ou <h1>."""
    tree = HTMLParser(html)
    title_node = tree.css_first("title")
    if title_node and title_node.text(strip=True):
        return title_node.text(strip=True)
    h1_node = tree.css_first("h1")
    if h1_node and h1_node.text(strip=True):
        return h1_node.text(strip=True)
    return ""


# ---------------------------------------------------------------------------
# Fonctions publiques
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception(_is_retryable_scrape),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=3, max=30),
    reraise=True,
)
async def _scrape_url_with_retry(url: str, content_selector: str, scraped_at: str) -> dict[str, Any]:
    """
    Fonction interne décorée par tenacity.

    Laisse remonter les exceptions retryables (httpx.TransportError, _ScraperHTTPError 429/503)
    pour que tenacity puisse les intercepter et relancer.
    Les autres exceptions (ex. parsing HTML) sont propagées telles quelles.
    """
    async with httpx.AsyncClient(
        http2=True,
        follow_redirects=True,
        timeout=20.0,
        headers=_HEADERS,
    ) as client:
        response = await client.get(url)

    if response.status_code not in {200, 201}:
        raise _ScraperHTTPError(response.status_code, url)

    parsed = parse_html(response.text, content_selector)
    logger.info(
        "Scraping réussi",
        extra={"url": url, "title": parsed["title"], "markdown_len": len(parsed["markdown"])},
    )
    return {
        "url": url,
        "title": parsed["title"],
        "markdown": parsed["markdown"],
        "scraped_at": scraped_at,
    }


def parse_html(html: str, content_selector: str = "") -> dict[str, str]:
    """
    Convertit du HTML brut en {title, markdown}.

    Partagé entre le scraping httpx et l'ingestion depuis du HTML pré-rendu
    (ex. pages SPA rendues par un navigateur headless).
    """
    title = _extract_title(html)
    content_html = _extract_content(html, content_selector)

    # convert seul = whitelist : les balises non listées (a, img) ne sont pas
    # converties — les liens deviennent du texte brut, les images disparaissent.
    # markdownify interdit de passer strip et convert ensemble.
    markdown = md(
        content_html,
        heading_style="ATX",
        convert=["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table"],
    )
    # Nettoyage basique : supprimer les lignes vides consécutives
    lines = [line.rstrip() for line in markdown.splitlines()]
    cleaned_lines: list[str] = []
    prev_empty = False
    for line in lines:
        if line == "":
            if not prev_empty:
                cleaned_lines.append(line)
            prev_empty = True
        else:
            cleaned_lines.append(line)
            prev_empty = False
    return {"title": title, "markdown": "\n".join(cleaned_lines).strip()}


async def scrape_url(url: str, content_selector: str = "") -> dict[str, Any]:
    """
    Scrape une URL et retourne le contenu en Markdown.

    Wrapper autour de `_scrape_url_with_retry` : le retry tenacity est appliqué
    à l'intérieur (sur les erreurs réseau et 429/503). Ce wrapper capture les
    erreurs non récupérables après épuisement des retries et retourne un résultat vide.

    Args:
        url:              URL à scraper.
        content_selector: Sélecteur CSS de la zone principale (optionnel).

    Returns:
        dict avec clés : url, title, markdown, scraped_at.
        En cas d'erreur définitive : markdown="" et l'erreur est loggée (pas propagée).
    """
    scraped_at = datetime.now(UTC).isoformat()
    logger.info("Scraping URL", extra={"url": url})

    try:
        return await _scrape_url_with_retry(url, content_selector, scraped_at)
    except Exception as exc:
        logger.error("Erreur scraping", extra={"url": url, "error": str(exc)}, exc_info=True)
        return {"url": url, "title": "", "markdown": "", "scraped_at": scraped_at}


async def scrape_all_sources(country: str = "") -> list[dict[str, Any]]:
    """
    Scrape toutes les sources du registre (ou celles d'un pays donné).

    Args:
        country: Code pays "FR" | "CA" | "DE". Vide = tous les pays.

    Returns:
        Liste de dicts enrichis avec country et visa_type.
    """
    results: list[dict[str, Any]] = []
    domain_last_fetch: dict[str, float] = {}

    countries = [country.upper()] if country else list(SOURCE_REGISTRY.keys())

    for c in countries:
        sources = SOURCE_REGISTRY.get(c, [])
        for source in sources:
            url = source["url"]
            domain = urlparse(url).netloc

            # Politesse : attendre 2 s entre requêtes du même domaine
            if domain in domain_last_fetch:
                elapsed = asyncio.get_event_loop().time() - domain_last_fetch[domain]
                if elapsed < 2.0:
                    await asyncio.sleep(2.0 - elapsed)

            result = await scrape_url(url, content_selector=source.get("content_selector", ""))
            domain_last_fetch[domain] = asyncio.get_event_loop().time()

            result["country"] = c
            result["visa_type"] = source.get("visa_type", "")
            results.append(result)

    logger.info(
        "Scraping terminé",
        extra={"nb_sources": len(results), "countries": countries},
    )
    return results
