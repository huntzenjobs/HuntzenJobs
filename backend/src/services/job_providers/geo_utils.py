"""
Geo Utils — Geocodage hybride pour le filtrage par rayon
=========================================================
- API adresse.data.gouv.fr (Base Adresse Nationale) pour la France
- Fallback Nominatim pour l'international
- Cache mémoire agressif (les villes ne bougent pas)
- Calcul de distance haversine
"""

import logging
import math
import re
import unicodedata

import httpx

logger = logging.getLogger(__name__)

# Cache mémoire : "ville_normalisée|country" → (lat, lon) ou None
_geo_cache: dict[str, tuple[float, float] | None] = {}

# Regex pour nettoyer les locations avant geocodage
_NOISE_RE = re.compile(r"\b(cedex|cs\s*\d+|bp\s*\d+)\b", re.IGNORECASE)
_POSTAL_RE = re.compile(r"\b\d{4,5}\b")
_ARRONDISSEMENT_RE = re.compile(r"\b\d{1,2}e(me)?\b", re.IGNORECASE)
_PARENS_RE = re.compile(r"\([^)]*\)")


def _normalize_text(text: str) -> str:
    """Normalise un texte : minuscule, sans accents, sans bruit."""
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text


def extract_city_name(location: str) -> str:
    """
    Extrait le nom de ville depuis un champ location libre.

    Exemples:
        "44000 - Nantes" → "Nantes"
        "Nantes Cedex 3" → "Nantes"
        "Saint-Herblain (44)" → "Saint-Herblain"
        "Paris 15e" → "Paris"
        "Nantes, Pays de la Loire" → "Nantes"
        "69 - Lyon 3e - 69003" → "Lyon"
    """
    if not location:
        return ""

    text = location.strip()
    # Supprimer le contenu entre parenthèses : "Saint-Herblain (44)" → "Saint-Herblain"
    text = _PARENS_RE.sub("", text)
    # Supprimer cedex, CS, BP
    text = _NOISE_RE.sub("", text)
    # Supprimer codes postaux
    text = _POSTAL_RE.sub("", text)
    # Supprimer arrondissements : "15e", "3eme"
    text = _ARRONDISSEMENT_RE.sub("", text)

    # Prendre la première partie significative (avant virgule)
    parts = text.split(",")
    text = parts[0].strip()

    # Splitter par tiret/slash et prendre la partie la plus longue (souvent la ville)
    # "69 - Lyon" → ["69", "Lyon"] → "Lyon"
    segments = re.split(r"\s*[-/|]\s*", text)
    # Filtrer les segments vides et les nombres purs
    city_segments = [s.strip() for s in segments if s.strip() and not s.strip().isdigit()]

    if city_segments:
        # Prendre le segment le plus long (heuristique : c'est la ville)
        return max(city_segments, key=len).strip()

    return text.strip()


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcule la distance en km entre deux points GPS (formule haversine)."""
    R = 6371.0  # Rayon de la Terre en km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def geocode_fr(city: str) -> tuple[float, float] | None:
    """
    Geocode une ville française via api-adresse.data.gouv.fr (BAN).

    Gratuit, sans clé API, couvre 100% des communes françaises.
    Résultat caché en mémoire.
    """
    cache_key = f"{_normalize_text(city)}|fr"
    if cache_key in _geo_cache:
        return _geo_cache[cache_key]

    try:
        url = "https://api-adresse.data.gouv.fr/search"
        params = {"q": city, "type": "municipality", "limit": 1}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])
        if features:
            coords = features[0]["geometry"]["coordinates"]
            # GeoJSON = [lon, lat]
            result = (coords[1], coords[0])
            _geo_cache[cache_key] = result
            logger.debug(f"[GeoUtils] BAN geocoded '{city}' → {result}")
            return result

        # Pas trouvé comme municipality, essayer sans filtre type
        params2 = {"q": city, "limit": 1}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp2 = await client.get(url, params=params2)
            resp2.raise_for_status()
            data2 = resp2.json()

        features2 = data2.get("features", [])
        if features2:
            coords = features2[0]["geometry"]["coordinates"]
            result = (coords[1], coords[0])
            _geo_cache[cache_key] = result
            logger.debug(f"[GeoUtils] BAN geocoded '{city}' (fallback) → {result}")
            return result

        _geo_cache[cache_key] = None
        return None

    except Exception as e:
        logger.warning(f"[GeoUtils] BAN geocode failed for '{city}': {e}")
        return None


async def geocode_international(city: str, country_code: str) -> tuple[float, float] | None:
    """Geocode via Nominatim pour les pays hors France."""
    cache_key = f"{_normalize_text(city)}|{country_code.lower()}"
    if cache_key in _geo_cache:
        return _geo_cache[cache_key]

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": city, "countrycodes": country_code.lower(), "format": "json", "limit": 1}
        headers = {"User-Agent": "HuntZen/3.0 (job search platform)"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        if data:
            result = (float(data[0]["lat"]), float(data[0]["lon"]))
            _geo_cache[cache_key] = result
            return result

        _geo_cache[cache_key] = None
        return None
    except Exception as e:
        logger.warning(f"[GeoUtils] Nominatim geocode failed for '{city}': {e}")
        return None


async def geocode(city: str, country_code: str = "fr") -> tuple[float, float] | None:
    """Geocode une ville. BAN pour la France, Nominatim sinon."""
    if country_code.lower() == "fr":
        return await geocode_fr(city)
    return await geocode_international(city, country_code)
