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
SOURCE_REGISTRY: dict[str, list[dict[str, str]]] = {
    # ── FRANCE ──────────────────────────────────────────────────────────────
    "FR": [
        {
            "url": "https://www.service-public.fr/particuliers/vosdroits/F2231",
            "visa_type": "etude",
            "content_selector": "#page-content",
        },
        {
            "url": "https://france-visas.gouv.fr/web/france-visas/etudes",
            "visa_type": "etude",
            "content_selector": "",
        },
        {
            "url": "https://www.campusfrance.org/fr/les-visas-pour-etudier-en-france",
            "visa_type": "etude",
            "content_selector": "",
        },
        {
            "url": "https://www.service-public.fr/particuliers/vosdroits/F2784",
            "visa_type": "travail",
            "content_selector": "#page-content",
        },
    ],
    # ── CANADA ──────────────────────────────────────────────────────────────
    "CA": [
        {
            "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/etudier-canada/permis-etudes.html",
            "visa_type": "etude",
            "content_selector": "main",
        },
        {
            "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/travailler-canada/permis.html",
            "visa_type": "travail",
            "content_selector": "main",
        },
        {
            "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/travailler-canada/pvt.html",
            "visa_type": "pvt",
            "content_selector": "main",
        },
    ],
    # ── ALLEMAGNE ────────────────────────────────────────────────────────────
    "DE": [
        {
            "url": "https://www.make-it-in-germany.com/fr/visa-pour-lallemagne/chercheurs-demploi/visa-de-recherche-demploi",
            "visa_type": "travail",
            "content_selector": "",
        },
        {
            "url": "https://www.bamf.de/FR/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Bildung/Studium/studium-node.html",
            "visa_type": "etude",
            "content_selector": "",
        },
        {
            "url": "https://www.make-it-in-germany.com/fr/visa-pour-lallemagne/travailler/visa-demploi-qualifie",
            "visa_type": "travail",
            "content_selector": "",
        },
    ],
}

# Balises à supprimer avant conversion Markdown
_TAGS_TO_REMOVE: list[str] = [
    "nav", "footer", "header", "aside", "script", "style",
    "noscript", "iframe", "form", "button", "svg", "img",
]

# En-têtes HTTP réalistes pour éviter les blocages basiques
_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
async def scrape_url(url: str, content_selector: str = "") -> dict[str, Any]:
    """
    Scrape une URL et retourne le contenu en Markdown.

    Args:
        url:              URL à scraper.
        content_selector: Sélecteur CSS de la zone principale (optionnel).

    Returns:
        dict avec clés : url, title, markdown, scraped_at.
        En cas d'erreur : markdown="" et l'erreur est loggée (pas propagée).
    """
    scraped_at = datetime.now(UTC).isoformat()
    logger.info("Scraping URL", extra={"url": url})

    try:
        async with httpx.AsyncClient(
            http2=True,
            follow_redirects=True,
            timeout=20.0,
            headers=_HEADERS,
        ) as client:
            response = await client.get(url)

        if response.status_code not in {200, 201}:
            raise _ScraperHTTPError(response.status_code, url)

        html = response.text
        title = _extract_title(html)
        content_html = _extract_content(html, content_selector)

        markdown = md(
            content_html,
            heading_style="ATX",
            strip=["a", "img"],
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
        markdown = "\n".join(cleaned_lines).strip()

        logger.info(
            "Scraping réussi",
            extra={"url": url, "title": title, "markdown_len": len(markdown)},
        )
        return {"url": url, "title": title, "markdown": markdown, "scraped_at": scraped_at}

    except _ScraperHTTPError:
        raise  # Propagée pour le retry tenacity

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
