"""
Expat Countries Classification
================================
Three procedure categories for foreign students coming to France:
- DAP: Campus France mandatory (40+ countries)
- EU/EEA: No visa needed, free circulation
- DIRECT: Visa via embassy, no Campus France obligation
"""

# Countries where Campus France procedure (DAP) is mandatory
DAP_COUNTRIES: set[str] = {
    "Algeria", "Argentina", "Bahrain", "Benin", "Brazil", "Burkina Faso",
    "Cameroon", "Chile", "China", "Colombia", "Comoros", "Congo",
    "Ivory Coast", "Egypt", "Ethiopia", "Gabon", "Guinea", "Haiti",
    "India", "Indonesia", "Japan", "Jordan", "Kuwait", "Lebanon",
    "Madagascar", "Mali", "Mauritania", "Mauritius", "Mexico", "Morocco",
    "Niger", "Nigeria", "Oman", "Peru", "Qatar", "Russia", "Saudi Arabia",
    "Senegal", "South Korea", "Taiwan", "Togo", "Tunisia", "Turkey",
    "UAE", "Ukraine", "United States", "Venezuela", "Vietnam",
}

# EU/EEA/Switzerland — free circulation, no visa needed
EU_EEA_COUNTRIES: set[str] = {
    "Germany", "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "Greece",
    "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
    "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
    "Slovenia", "Spain", "Sweden", "Norway", "Iceland", "Liechtenstein",
    "Switzerland",
}

# Campus France links per country (DAP countries)
CAMPUS_FRANCE_LINKS: dict[str, str] = {
    "Morocco": "https://maroc.campusfrance.org",
    "Algeria": "https://algerie.campusfrance.org",
    "Tunisia": "https://tunisie.campusfrance.org",
    "Senegal": "https://senegal.campusfrance.org",
    "Cameroon": "https://cameroun.campusfrance.org",
    "Ivory Coast": "https://cotedivoire.campusfrance.org",
    "China": "https://chine.campusfrance.org",
    "India": "https://inde.campusfrance.org",
    "Brazil": "https://bresil.campusfrance.org",
    "Mexico": "https://mexique.campusfrance.org",
    "Vietnam": "https://vietnam.campusfrance.org",
    "Japan": "https://japon.campusfrance.org",
    "South Korea": "https://coree.campusfrance.org",
    "United States": "https://usa.campusfrance.org",
}

# Average visa processing times in weeks (approximate)
AVG_VISA_DELAY: dict[str, int] = {
    "Morocco": 3, "Algeria": 4, "Tunisia": 3, "Senegal": 3,
    "Cameroon": 4, "Ivory Coast": 4, "China": 6, "India": 5,
    "Brazil": 3, "Vietnam": 4, "Japan": 2, "South Korea": 2,
    "United States": 3, "Nigeria": 6, "Egypt": 4, "Turkey": 3,
}


SUPPORTED_COUNTRIES: set[str] = DAP_COUNTRIES | EU_EEA_COUNTRIES


def get_country_procedure(country: str) -> str:
    """Returns 'DAP', 'EU', or 'DIRECT' for a given country."""
    if country in EU_EEA_COUNTRIES:
        return "EU"
    if country in DAP_COUNTRIES:
        return "DAP"
    return "DIRECT"


def get_campus_france_link(country: str) -> str:
    return CAMPUS_FRANCE_LINKS.get(country, "https://www.campusfrance.org")


def get_avg_visa_delay(country: str) -> int:
    """Returns average visa delay in weeks, defaults to 4."""
    return AVG_VISA_DELAY.get(country, 4)
