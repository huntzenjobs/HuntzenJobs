"""
Static Data API Routes
======================
Provides static/reference data for the application.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/countries")
async def get_countries():
    """
    Get list of all countries for job search (ISO 3166-1 alpha-2).

    Returns:
        List of all countries with name and ISO code
    """
    return {
        "success": True,
        "data": [
            {"name": "Afghanistan", "code": "af"},
            {"name": "Afrique du Sud", "code": "za"},
            {"name": "Albanie", "code": "al"},
            {"name": "Algérie", "code": "dz"},
            {"name": "Allemagne", "code": "de"},
            {"name": "Andorre", "code": "ad"},
            {"name": "Angola", "code": "ao"},
            {"name": "Antigua-et-Barbuda", "code": "ag"},
            {"name": "Arabie Saoudite", "code": "sa"},
            {"name": "Argentine", "code": "ar"},
            {"name": "Arménie", "code": "am"},
            {"name": "Australie", "code": "au"},
            {"name": "Autriche", "code": "at"},
            {"name": "Azerbaïdjan", "code": "az"},
            {"name": "Bahamas", "code": "bs"},
            {"name": "Bahreïn", "code": "bh"},
            {"name": "Bangladesh", "code": "bd"},
            {"name": "Barbade", "code": "bb"},
            {"name": "Belgique", "code": "be"},
            {"name": "Belize", "code": "bz"},
            {"name": "Bénin", "code": "bj"},
            {"name": "Bhoutan", "code": "bt"},
            {"name": "Biélorussie", "code": "by"},
            {"name": "Birmanie", "code": "mm"},
            {"name": "Bolivie", "code": "bo"},
            {"name": "Bosnie-Herzégovine", "code": "ba"},
            {"name": "Botswana", "code": "bw"},
            {"name": "Brésil", "code": "br"},
            {"name": "Brunei", "code": "bn"},
            {"name": "Bulgarie", "code": "bg"},
            {"name": "Burkina Faso", "code": "bf"},
            {"name": "Burundi", "code": "bi"},
            {"name": "Cambodge", "code": "kh"},
            {"name": "Cameroun", "code": "cm"},
            {"name": "Canada", "code": "ca"},
            {"name": "Cap-Vert", "code": "cv"},
            {"name": "Chili", "code": "cl"},
            {"name": "Chine", "code": "cn"},
            {"name": "Chypre", "code": "cy"},
            {"name": "Colombie", "code": "co"},
            {"name": "Comores", "code": "km"},
            {"name": "Congo", "code": "cg"},
            {"name": "Corée du Nord", "code": "kp"},
            {"name": "Corée du Sud", "code": "kr"},
            {"name": "Costa Rica", "code": "cr"},
            {"name": "Côte d'Ivoire", "code": "ci"},
            {"name": "Croatie", "code": "hr"},
            {"name": "Cuba", "code": "cu"},
            {"name": "Danemark", "code": "dk"},
            {"name": "Djibouti", "code": "dj"},
            {"name": "Dominique", "code": "dm"},
            {"name": "Égypte", "code": "eg"},
            {"name": "Émirats Arabes Unis", "code": "ae"},
            {"name": "Équateur", "code": "ec"},
            {"name": "Érythrée", "code": "er"},
            {"name": "Espagne", "code": "es"},
            {"name": "Estonie", "code": "ee"},
            {"name": "Eswatini", "code": "sz"},
            {"name": "États-Unis", "code": "us"},
            {"name": "Éthiopie", "code": "et"},
            {"name": "Fidji", "code": "fj"},
            {"name": "Finlande", "code": "fi"},
            {"name": "France", "code": "fr"},
            {"name": "Gabon", "code": "ga"},
            {"name": "Gambie", "code": "gm"},
            {"name": "Géorgie", "code": "ge"},
            {"name": "Ghana", "code": "gh"},
            {"name": "Grèce", "code": "gr"},
            {"name": "Grenade", "code": "gd"},
            {"name": "Guatemala", "code": "gt"},
            {"name": "Guinée", "code": "gn"},
            {"name": "Guinée équatoriale", "code": "gq"},
            {"name": "Guinée-Bissau", "code": "gw"},
            {"name": "Guyana", "code": "gy"},
            {"name": "Haïti", "code": "ht"},
            {"name": "Honduras", "code": "hn"},
            {"name": "Hongrie", "code": "hu"},
            {"name": "Inde", "code": "in"},
            {"name": "Indonésie", "code": "id"},
            {"name": "Irak", "code": "iq"},
            {"name": "Iran", "code": "ir"},
            {"name": "Irlande", "code": "ie"},
            {"name": "Islande", "code": "is"},
            {"name": "Israël", "code": "il"},
            {"name": "Italie", "code": "it"},
            {"name": "Jamaïque", "code": "jm"},
            {"name": "Japon", "code": "jp"},
            {"name": "Jordanie", "code": "jo"},
            {"name": "Kazakhstan", "code": "kz"},
            {"name": "Kenya", "code": "ke"},
            {"name": "Kirghizistan", "code": "kg"},
            {"name": "Kiribati", "code": "ki"},
            {"name": "Koweït", "code": "kw"},
            {"name": "Laos", "code": "la"},
            {"name": "Lesotho", "code": "ls"},
            {"name": "Lettonie", "code": "lv"},
            {"name": "Liban", "code": "lb"},
            {"name": "Liberia", "code": "lr"},
            {"name": "Libye", "code": "ly"},
            {"name": "Liechtenstein", "code": "li"},
            {"name": "Lituanie", "code": "lt"},
            {"name": "Luxembourg", "code": "lu"},
            {"name": "Macédoine du Nord", "code": "mk"},
            {"name": "Madagascar", "code": "mg"},
            {"name": "Malaisie", "code": "my"},
            {"name": "Malawi", "code": "mw"},
            {"name": "Maldives", "code": "mv"},
            {"name": "Mali", "code": "ml"},
            {"name": "Malte", "code": "mt"},
            {"name": "Maroc", "code": "ma"},
            {"name": "Maurice", "code": "mu"},
            {"name": "Mauritanie", "code": "mr"},
            {"name": "Mexique", "code": "mx"},
            {"name": "Micronésie", "code": "fm"},
            {"name": "Moldavie", "code": "md"},
            {"name": "Monaco", "code": "mc"},
            {"name": "Mongolie", "code": "mn"},
            {"name": "Monténégro", "code": "me"},
            {"name": "Mozambique", "code": "mz"},
            {"name": "Namibie", "code": "na"},
            {"name": "Nauru", "code": "nr"},
            {"name": "Népal", "code": "np"},
            {"name": "Nicaragua", "code": "ni"},
            {"name": "Niger", "code": "ne"},
            {"name": "Nigeria", "code": "ng"},
            {"name": "Norvège", "code": "no"},
            {"name": "Nouvelle-Zélande", "code": "nz"},
            {"name": "Oman", "code": "om"},
            {"name": "Ouganda", "code": "ug"},
            {"name": "Ouzbékistan", "code": "uz"},
            {"name": "Pakistan", "code": "pk"},
            {"name": "Palaos", "code": "pw"},
            {"name": "Palestine", "code": "ps"},
            {"name": "Panama", "code": "pa"},
            {"name": "Papouasie-Nouvelle-Guinée", "code": "pg"},
            {"name": "Paraguay", "code": "py"},
            {"name": "Pays-Bas", "code": "nl"},
            {"name": "Pérou", "code": "pe"},
            {"name": "Philippines", "code": "ph"},
            {"name": "Pologne", "code": "pl"},
            {"name": "Portugal", "code": "pt"},
            {"name": "Qatar", "code": "qa"},
            {"name": "RD Congo", "code": "cd"},
            {"name": "République Centrafricaine", "code": "cf"},
            {"name": "République Dominicaine", "code": "do"},
            {"name": "République Tchèque", "code": "cz"},
            {"name": "Roumanie", "code": "ro"},
            {"name": "Royaume-Uni", "code": "gb"},
            {"name": "Russie", "code": "ru"},
            {"name": "Rwanda", "code": "rw"},
            {"name": "Saint-Christophe-et-Niévès", "code": "kn"},
            {"name": "Saint-Marin", "code": "sm"},
            {"name": "Saint-Vincent-et-les-Grenadines", "code": "vc"},
            {"name": "Sainte-Lucie", "code": "lc"},
            {"name": "Salvador", "code": "sv"},
            {"name": "Samoa", "code": "ws"},
            {"name": "São Tomé-et-Príncipe", "code": "st"},
            {"name": "Sénégal", "code": "sn"},
            {"name": "Serbie", "code": "rs"},
            {"name": "Seychelles", "code": "sc"},
            {"name": "Sierra Leone", "code": "sl"},
            {"name": "Singapour", "code": "sg"},
            {"name": "Slovaquie", "code": "sk"},
            {"name": "Slovénie", "code": "si"},
            {"name": "Somalie", "code": "so"},
            {"name": "Soudan", "code": "sd"},
            {"name": "Soudan du Sud", "code": "ss"},
            {"name": "Sri Lanka", "code": "lk"},
            {"name": "Suède", "code": "se"},
            {"name": "Suisse", "code": "ch"},
            {"name": "Suriname", "code": "sr"},
            {"name": "Syrie", "code": "sy"},
            {"name": "Tadjikistan", "code": "tj"},
            {"name": "Tanzanie", "code": "tz"},
            {"name": "Tchad", "code": "td"},
            {"name": "Thaïlande", "code": "th"},
            {"name": "Timor oriental", "code": "tl"},
            {"name": "Togo", "code": "tg"},
            {"name": "Tonga", "code": "to"},
            {"name": "Trinité-et-Tobago", "code": "tt"},
            {"name": "Tunisie", "code": "tn"},
            {"name": "Turkménistan", "code": "tm"},
            {"name": "Turquie", "code": "tr"},
            {"name": "Tuvalu", "code": "tv"},
            {"name": "Ukraine", "code": "ua"},
            {"name": "Uruguay", "code": "uy"},
            {"name": "Vanuatu", "code": "vu"},
            {"name": "Vatican", "code": "va"},
            {"name": "Venezuela", "code": "ve"},
            {"name": "Vietnam", "code": "vn"},
            {"name": "Yémen", "code": "ye"},
            {"name": "Zambie", "code": "zm"},
            {"name": "Zimbabwe", "code": "zw"},
        ]
    }


@router.get("/api/cities/{country_name}")
async def get_cities(country_name: str):
    """
    Get list of major cities for a country.

    Args:
        country_name: Country name (e.g., "France", "Belgique")

    Returns:
        List of city names for the country
    """
    # Map country names to major cities (Top 50 countries by job market size)
    cities_by_country = {
        # Europe
        "France": ["Paris", "Lyon", "Marseille", "Toulouse", "Lille", "Bordeaux", "Nantes", "Nice", "Strasbourg", "Rennes", "Grenoble", "Montpellier"],
        "Allemagne": ["Berlin", "Munich", "Hambourg", "Francfort", "Cologne", "Stuttgart", "Düsseldorf", "Dortmund", "Leipzig", "Hanovre"],
        "Royaume-Uni": ["Londres", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Newcastle", "Sheffield", "Bristol", "Édimbourg"],
        "Espagne": ["Madrid", "Barcelone", "Valence", "Séville", "Saragosse", "Malaga", "Murcie", "Bilbao", "Alicante", "Cordoue"],
        "Italie": ["Rome", "Milan", "Naples", "Turin", "Palerme", "Gênes", "Bologne", "Florence", "Bari", "Catane"],
        "Pays-Bas": ["Amsterdam", "Rotterdam", "La Haye", "Utrecht", "Eindhoven", "Groningue", "Tilburg", "Almere", "Breda"],
        "Belgique": ["Bruxelles", "Anvers", "Gand", "Charleroi", "Liège", "Bruges", "Namur", "Louvain", "Mons"],
        "Suisse": ["Zurich", "Genève", "Bâle", "Lausanne", "Berne", "Winterthour", "Lucerne", "Saint-Gall", "Lugano"],
        "Portugal": ["Lisbonne", "Porto", "Braga", "Coimbra", "Funchal", "Setúbal", "Faro", "Aveiro"],
        "Pologne": ["Varsovie", "Cracovie", "Łódź", "Wrocław", "Poznań", "Gdańsk", "Szczecin", "Bydgoszcz"],
        "Suède": ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping"],
        "Norvège": ["Oslo", "Bergen", "Trondheim", "Stavanger", "Drammen", "Fredrikstad"],
        "Danemark": ["Copenhague", "Aarhus", "Odense", "Aalborg", "Esbjerg", "Randers"],
        "Finlande": ["Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu", "Turku", "Jyväskylä"],
        "Irlande": ["Dublin", "Cork", "Limerick", "Galway", "Waterford", "Drogheda"],
        "Autriche": ["Vienne", "Graz", "Linz", "Salzbourg", "Innsbruck", "Klagenfurt"],
        "République Tchèque": ["Prague", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc"],
        "Roumanie": ["Bucarest", "Cluj-Napoca", "Timișoara", "Iași", "Constanța", "Craiova", "Brașov"],
        "Grèce": ["Athènes", "Thessalonique", "Patras", "Héraklion", "Larissa", "Volos"],
        "Luxembourg": ["Luxembourg", "Esch-sur-Alzette", "Differdange", "Dudelange"],

        # Amérique du Nord
        "États-Unis": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphie", "San Antonio", "San Diego", "Dallas", "San José", "Austin", "Jacksonville", "San Francisco", "Seattle", "Denver", "Washington", "Boston", "Nashville", "Las Vegas", "Portland"],
        "Canada": ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa", "Edmonton", "Québec", "Winnipeg", "Hamilton", "Kitchener"],
        "Mexique": ["Mexico", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "León", "Juárez", "Zapopan"],

        # Amérique du Sud
        "Brésil": ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Porto Alegre"],
        "Argentine": ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "San Miguel de Tucumán", "Mar del Plata"],
        "Chili": ["Santiago", "Valparaíso", "Concepción", "La Serena", "Antofagasta", "Temuco", "Rancagua"],
        "Colombie": ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Cúcuta", "Bucaramanga"],
        "Pérou": ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Iquitos", "Cusco"],

        # Asie
        "Chine": ["Pékin", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Hangzhou", "Wuhan", "Xi'an", "Suzhou", "Tianjin"],
        "Inde": ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Surat"],
        "Japon": ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Kawasaki", "Saitama"],
        "Corée du Sud": ["Séoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan"],
        "Singapour": ["Singapour"],
        "Thaïlande": ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Nonthaburi", "Udon Thani"],
        "Vietnam": ["Hanoï", "Hô Chi Minh-Ville", "Haiphong", "Da Nang", "Cần Thơ", "Biên Hòa"],
        "Indonésie": ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang"],
        "Philippines": ["Manille", "Quezon City", "Davao", "Cebu", "Caloocan", "Zamboanga"],
        "Malaisie": ["Kuala Lumpur", "George Town", "Ipoh", "Johor Bahru", "Malacca", "Kota Kinabalu"],
        "Émirats Arabes Unis": ["Dubaï", "Abu Dhabi", "Sharjah", "Ajman", "Ras al Khaïmah"],
        "Arabie Saoudite": ["Riyad", "Jeddah", "La Mecque", "Médine", "Dammam", "Taïf"],
        "Israël": ["Tel Aviv", "Jérusalem", "Haïfa", "Rishon LeZion", "Petah Tikva", "Ashdod"],
        "Turquie": ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Gaziantep", "Konya"],

        # Afrique
        "Afrique du Sud": ["Johannesburg", "Le Cap", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein"],
        "Nigeria": ["Lagos", "Kano", "Ibadan", "Abuja", "Port Harcourt", "Benin City"],
        "Égypte": ["Le Caire", "Alexandrie", "Gizeh", "Shubra El-Kheima", "Port-Saïd", "Suez"],
        "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika"],
        "Maroc": ["Casablanca", "Rabat", "Fès", "Marrakech", "Agadir", "Tanger", "Meknès"],
        "Algérie": ["Alger", "Oran", "Constantine", "Annaba", "Blida", "Batna", "Sétif"],
        "Tunisie": ["Tunis", "Sfax", "Sousse", "Kairouan", "Bizerte", "Gabès"],

        # Océanie
        "Australie": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle"],
        "Nouvelle-Zélande": ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin"],
    }

    cities = cities_by_country.get(country_name, [])
    return {
        "success": True,
        "data": cities
    }


@router.get("/api/contract-types")
async def get_contract_types():
    """
    Get list of contract types.

    Returns:
        List of contract type objects with id and label
    """
    return {
        "success": True,
        "data": [
            {"id": "cdi", "label": "CDI", "label_en": "Permanent Contract"},
            {"id": "cdd", "label": "CDD", "label_en": "Fixed-term Contract"},
            {"id": "stage", "label": "Stage", "label_en": "Internship"},
            {"id": "alternance", "label": "Alternance", "label_en": "Work-study"},
            {"id": "freelance", "label": "Freelance", "label_en": "Freelance"},
            {"id": "interim", "label": "Intérim", "label_en": "Temporary"},
            {"id": "contrat_pro", "label": "Contrat pro", "label_en": "Professional Contract"},
            {"id": "vie", "label": "VIE", "label_en": "International Volunteer"},
        ]
    }
