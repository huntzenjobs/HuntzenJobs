"""
Pytest configuration and fixtures for HuntZen tests.
"""
import pytest
import asyncio
from typing import Generator, AsyncGenerator
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
import sys
import os
import uuid
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app, sessions, session_timestamps, usage_tracking


# ============================================
# EVENT LOOP FIXTURES
# ============================================

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================
# CLIENT FIXTURES
# ============================================

@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    """Create a test client for synchronous tests."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client for async tests."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def fresh_client() -> Generator[TestClient, None, None]:
    """Create a fresh test client for each test (isolated)."""
    with TestClient(app) as c:
        yield c


# ============================================
# SESSION MANAGEMENT FIXTURES
# ============================================

@pytest.fixture
def valid_session_id() -> str:
    """Valid UUID format session ID."""
    return "123e4567-e89b-12d3-a456-426614174000"


@pytest.fixture
def unique_session_id() -> str:
    """Generate a unique session ID for each test."""
    return str(uuid.uuid4())


@pytest.fixture
def clean_sessions():
    """Clean sessions before and after test."""
    # Clear sessions
    sessions.clear()
    session_timestamps.clear()
    yield
    # Clean up after test
    sessions.clear()
    session_timestamps.clear()


# ============================================
# FREEMIUM FIXTURES
# ============================================

@pytest.fixture
def valid_client_id() -> str:
    """Valid client ID for freemium testing."""
    return "hzn_test_client_12345678901234567890"


@pytest.fixture
def unique_client_id() -> str:
    """Generate a unique client ID for each test."""
    return f"hzn_test_{uuid.uuid4().hex[:30]}"


@pytest.fixture
def clean_usage():
    """Clean usage tracking before and after test."""
    usage_tracking.clear()
    yield
    usage_tracking.clear()


# ============================================
# CV FIXTURES
# ============================================

@pytest.fixture
def sample_cv_text() -> str:
    """Sample CV text for testing."""
    return """
    Jean Dupont
    Développeur Full Stack Senior
    Paris, France
    jean.dupont@email.com | +33 6 12 34 56 78

    EXPÉRIENCE PROFESSIONNELLE

    Tech Company SAS - Développeur Full Stack Senior (2020-2024)
    - Développement d'applications web avec React et Node.js
    - Architecture microservices avec Docker et Kubernetes
    - Gestion d'équipe de 5 développeurs
    - Mise en place de CI/CD avec GitLab

    Startup Inc - Développeur Backend (2018-2020)
    - API REST avec Python/FastAPI
    - Base de données PostgreSQL et MongoDB
    - Tests automatisés avec pytest

    FORMATION
    - Master Informatique, Université Paris-Saclay (2018)
    - Licence Informatique, Université Paris-Saclay (2016)

    COMPÉTENCES
    - Langages: Python, JavaScript, TypeScript, Java
    - Frontend: React, Vue.js, Next.js
    - Backend: Node.js, FastAPI, Django
    - DevOps: Docker, Kubernetes, AWS, GCP
    - Bases de données: PostgreSQL, MongoDB, Redis

    LANGUES
    - Français: Natif
    - Anglais: Courant (C1)
    """


@pytest.fixture
def sample_cv_text_minimal() -> str:
    """Minimal CV text (just above minimum length)."""
    return """
    Jean Dupont - Développeur
    Paris, France
    Email: jean@email.com

    COMPÉTENCES: Python, JavaScript

    EXPÉRIENCE:
    - Développeur chez Company (2020-2024)
    """


@pytest.fixture
def sample_cv_text_english() -> str:
    """Sample CV text in English."""
    return """
    John Smith
    Senior Software Engineer
    New York, USA
    john.smith@email.com | +1 555 123 4567

    PROFESSIONAL EXPERIENCE

    Tech Corp - Senior Software Engineer (2020-2024)
    - Developed web applications with React and Node.js
    - Microservices architecture with Docker and Kubernetes
    - Team lead for 5 developers
    - CI/CD implementation with GitHub Actions

    Startup LLC - Backend Developer (2018-2020)
    - REST APIs with Python/FastAPI
    - PostgreSQL and MongoDB databases
    - Automated testing with pytest

    EDUCATION
    - MS Computer Science, MIT (2018)
    - BS Computer Science, MIT (2016)

    SKILLS
    - Languages: Python, JavaScript, TypeScript, Go
    - Frontend: React, Vue.js, Next.js
    - Backend: Node.js, FastAPI, Django
    - DevOps: Docker, Kubernetes, AWS, GCP
    - Databases: PostgreSQL, MongoDB, Redis

    LANGUAGES
    - English: Native
    - French: Intermediate (B2)
    """


# ============================================
# JOB FIXTURES
# ============================================

@pytest.fixture
def sample_job_description() -> str:
    """Sample job description for testing."""
    return """
    Développeur Full Stack Senior - Paris

    Nous recherchons un développeur Full Stack Senior pour rejoindre notre équipe.

    Missions:
    - Développer des fonctionnalités front et back
    - Participer à l'architecture technique
    - Mentorer les développeurs juniors

    Profil recherché:
    - 5+ ans d'expérience en développement web
    - Maîtrise de React et Node.js
    - Expérience avec les bases de données SQL et NoSQL
    - Connaissance de Docker et Kubernetes
    - Anglais courant

    Salaire: 55K-70K EUR
    """


@pytest.fixture
def sample_job_search_params() -> dict:
    """Sample job search parameters."""
    return {
        "job_title": "Développeur Python",
        "country_code": "fr",
        "city": "Paris",
        "contract_type": "CDI"
    }


@pytest.fixture
def sample_job_search_params_minimal() -> dict:
    """Minimal job search parameters (only required fields)."""
    return {
        "job_title": "Developer",
        "country_code": "fr"
    }


@pytest.fixture
def sample_job_result() -> dict:
    """Sample job result from search."""
    return {
        "title": "Développeur Python Senior",
        "company": "Tech Company",
        "location": "Paris, France",
        "salary": "55K-70K EUR",
        "url": "https://example.com/job/123",
        "description": "Nous recherchons un développeur Python...",
        "source": "adzuna",
        "posted_date": "2024-01-15"
    }


@pytest.fixture
def sample_jobs_list(sample_job_result) -> list:
    """List of sample job results."""
    return [
        sample_job_result,
        {
            **sample_job_result,
            "title": "Backend Engineer",
            "company": "Another Company",
            "source": "google_jobs"
        },
        {
            **sample_job_result,
            "title": "Python Developer",
            "company": "Startup Inc",
            "source": "remoteok"
        }
    ]


# ============================================
# RECRUITER FIXTURES
# ============================================

@pytest.fixture
def sample_recruiter_search_params() -> dict:
    """Sample recruiter search parameters."""
    return {
        "company_name": "Google",
        "location": "Paris"
    }


@pytest.fixture
def sample_recruiter_result() -> dict:
    """Sample recruiter result."""
    return {
        "name": "Marie Martin",
        "title": "Technical Recruiter",
        "company": "Google",
        "linkedin_url": "https://linkedin.com/in/marie-martin",
        "email": "marie.martin@google.com"
    }


# ============================================
# MOCK FIXTURES
# ============================================

@pytest.fixture
def mock_groq_response():
    """Mock Groq API response."""
    mock = MagicMock()
    mock.content = "Voici mon analyse de votre CV..."
    return mock


@pytest.fixture
def mock_huntzen_app():
    """Mock the huntzen graph app."""
    with patch('main.huntzen_app') as mock:
        # Use side_effect to return a NEW dict each time (for session isolation)
        # while preserving messages from input state
        async def create_new_state(input_state, *args, **kwargs):
            # Preserve existing messages and add an AI response
            existing_messages = input_state.get("messages", []) if isinstance(input_state, dict) else []
            new_messages = list(existing_messages)  # Copy to avoid mutation
            new_messages.append(MagicMock(content="Bonjour ! Je suis votre assistant."))
            return {
                "messages": new_messages,
                "user_language": "fr",
                "next_agent": "CareerCoach",
                "search_results": []
            }
        mock.ainvoke = AsyncMock(side_effect=create_new_state)
        yield mock


@pytest.fixture
def mock_job_search():
    """Mock job search function."""
    with patch('main.search_jobs_aggregated') as mock:
        mock.return_value = {
            "jobs": [
                {
                    "title": "Python Developer",
                    "company": "Test Company",
                    "location": "Paris",
                    "url": "https://example.com/job/1",
                    "source": "adzuna"
                }
            ],
            "corrected_query": None,
            "original_query": "Python Developer"
        }
        yield mock


@pytest.fixture
def mock_cv_analysis():
    """Mock CV analysis functions."""
    with patch('main.analyze_cv_ats') as mock_ats, \
         patch('main.analyze_cv_with_job') as mock_job:
        mock_ats.return_value = {
            "success": True,
            "type": "ats_analysis",
            "score": 75,
            "analysis": "Votre CV a un bon score ATS..."
        }
        mock_job.return_value = {
            "success": True,
            "type": "job_matching",
            "score": 80,
            "analysis": "Bonne compatibilité avec le poste..."
        }
        yield {"ats": mock_ats, "job": mock_job}


@pytest.fixture
def mock_pdf_extraction():
    """Mock PDF text extraction."""
    with patch('main.extract_text_from_pdf_bytes') as mock:
        mock.return_value = """
        Jean Dupont
        Développeur Full Stack
        Paris, France
        jean.dupont@email.com

        EXPÉRIENCE: Développeur chez Company (2020-2024)
        COMPÉTENCES: Python, JavaScript, React
        """
        yield mock


# ============================================
# PDF FIXTURES
# ============================================

@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Sample PDF bytes (minimal valid PDF)."""
    # This is a minimal valid PDF structure
    return b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
196
%%EOF"""


@pytest.fixture
def sample_text_file_bytes() -> bytes:
    """Sample text file bytes (not a PDF)."""
    return b"This is a text file, not a PDF."


# ============================================
# UTILITY FIXTURES
# ============================================

@pytest.fixture
def freeze_time():
    """Fixture to freeze time for testing date-dependent code."""
    with patch('main.datetime') as mock_datetime:
        mock_datetime.now.return_value = datetime(2024, 1, 15, 12, 0, 0)
        mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
        yield mock_datetime


@pytest.fixture
def rate_limit_bypass():
    """Bypass rate limiting for tests."""
    with patch('main.limiter.limit', return_value=lambda f: f):
        yield


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset the rate limiter storage before each test."""
    from main import limiter
    # Reset the storage to clear rate limit counters
    if hasattr(limiter, '_storage') and limiter._storage is not None:
        try:
            limiter._storage.reset()
        except (AttributeError, Exception):
            pass
    # Alternative: reset via limiter's internal storage
    if hasattr(limiter, '_limiter') and limiter._limiter is not None:
        try:
            limiter._limiter.reset()
        except (AttributeError, Exception):
            pass
    yield


# ============================================
# INTEGRATION TEST FIXTURES
# ============================================

@pytest.fixture
def integration_client(clean_sessions, clean_usage) -> Generator[TestClient, None, None]:
    """Client with clean state for integration tests."""
    with TestClient(app) as c:
        yield c


# ============================================
# DATABASE FIXTURES (Sprint 6 - Connection Pool)
# ============================================

@pytest.fixture(scope="session", autouse=True)
async def init_connection_pool_for_tests():
    """
    Initialize connection pool once for all tests (session scope).
    This ensures the pool is available for all tests that need it.
    """
    from app.database import init_connection_pool_async, close_connection_pool
    from dotenv import load_dotenv

    # Load environment variables
    load_dotenv()

    # Initialize pool (async)
    await init_connection_pool_async()

    yield

    # Cleanup pool
    await close_connection_pool()


# Note: cleanup now handled in init_connection_pool_for_tests fixture


@pytest.fixture
async def test_db():
    """
    Create test database connection for integration tests.
    Uses psycopg3 (async) for connection pool testing.
    """
    import psycopg
    from dotenv import load_dotenv

    # Load test environment variables
    load_dotenv(".env.test")

    test_database_url = os.getenv("DATABASE_URL")
    if not test_database_url:
        pytest.skip("DATABASE_URL not set in .env.test")

    # Create async connection
    conn = await psycopg.AsyncConnection.connect(test_database_url)

    try:
        yield conn
    finally:
        await conn.close()


@pytest.fixture
def test_database_url() -> str:
    """Get test database URL from environment."""
    from dotenv import load_dotenv
    load_dotenv(".env.test")

    url = os.getenv("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set in .env.test")
    return url


@pytest.fixture
async def test_user_in_db(test_db):
    """
    Create a test user in the database with Free plan subscription.
    Returns user_id for testing.
    """
    user_id = str(uuid.uuid4())

    # Insert test user (assumes subscription_plans table exists)
    # This will be used after S6-2 migration
    async with test_db.cursor() as cur:
        # For now, just return the user_id
        # After S6-2, this will actually insert into user_subscriptions
        pass

    yield user_id

    # Cleanup after test
    async with test_db.cursor() as cur:
        # Clean up test data
        pass
