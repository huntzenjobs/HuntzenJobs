# AGENTS.md — backend/

> Conventions spécifiques au backend FastAPI. Complète le `AGENTS.md` racine.
> Tout est basé sur l'exploration réelle du code.

---

## Stack exacte

| Outil | Version |
|-------|---------|
| Python | >=3.11, <=3.12 |
| FastAPI | >=0.109.0 |
| Uvicorn | >=0.27.0 |
| Gunicorn | ==25.0.2 (production multi-worker) |
| Pydantic | >=2.5.0 (v2 — `BaseModel`, `Field`, `model_config`) |
| Pydantic Settings | >=2.1.0 (`BaseSettings`, `SettingsConfigDict`) |
| LangChain | >=0.1.0 (NO LangGraph) |
| LangChain-Groq | >=0.0.1 |
| Groq | >=0.4.0 |
| IBM Docling | ==2.70.0 (NE PAS mettre à jour) |
| Supabase Python | ==2.3.4 |
| psycopg[pool] | >=3.1.0 |
| Stripe | >=8.0.0 |
| Resend | >=2.0.0 |
| Redis | ==5.0.1 |
| ARQ | >=0.26.0 (task queue async) |
| SlowAPI | ==0.1.9 (rate limiting) |
| Sentry SDK | ==2.19.2 |
| structlog | >=24.1.0 (logging structuré) |
| Ruff | >=0.1.0 (lint, line-length=100) |
| pytest | >=7.4.0 + asyncio mode auto |

---

## Structure src/

```
src/
├── main.py                    # Entry point FastAPI + lifespan
├── agents/
│   ├── base.py                # BaseAgent + SubAgent + load_prompt()
│   ├── coach/                 # CareerCoachAgent (5 sub-agents)
│   ├── cv_adapter/
│   ├── cv_analyzer/
│   ├── job_scout/
│   ├── interview_sim/
│   ├── branding/
│   └── insider_finder/
├── api/
│   ├── middleware.py          # CORS, SlowAPI, Logging, IP Ban, GZip
│   ├── deps.py                # Dépendances FastAPI (agents, supabase, auth, quota)
│   └── routes/
│       ├── __init__.py        # 35+ router.include_router(...)
│       ├── auth.py
│       ├── coach.py
│       ├── jobs.py
│       └── [31 autres modules]
├── config/
│   └── settings.py            # Pydantic BaseSettings (SecretStr pour secrets)
├── models/
│   └── schemas.py             # Pydantic BaseModels request/response
├── services/
│   ├── job_providers/         # Adzuna, FranceTravail, RemoteOK, SerpAPI + aggregator
│   ├── recruiter_finder/      # Hunter.io
│   ├── salary/
│   ├── email.py               # Resend
│   ├── notifications.py
│   └── pdf_generator.py       # WeasyPrint + Docling
├── utils/
│   ├── cache.py               # Redis async (redis.asyncio)
│   ├── logger.py              # structlog setup
│   ├── groq_retry.py          # Retry + rotation clés Groq
│   └── geo.py                 # Validation pays/ville
└── workers/
    ├── tasks.py               # 4 tâches ARQ async
    └── settings.py            # WorkerSettings (max_jobs=750, timeout=120s)
```

---

## Commandes

```bash
# Développement (port 8000, hot-reload)
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
# ou depuis la racine :
npm run dev:backend

# Tests (depuis tests/ à la racine)
cd tests && python -m pytest -v --tb=short
# ou depuis la racine :
npm run test:backend

# Tests avec coverage
cd tests && python -m pytest -v --cov=../src --cov-report=term-missing

# Lint (depuis la racine)
ruff check . --ignore E501

# Lint avec fix automatique
ruff check . --ignore E501 --fix

# Type check (mypy strict)
python -m mypy src/

# Lancer les workers ARQ (service séparé)
python -m arq src.workers.settings.WorkerSettings
```

---

## Pattern de route FastAPI

Basé sur `src/api/routes/auth.py` et les autres routes :

```python
"""
Route Module Description
=========================
Courte description.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request, status

from src.api.middleware import limiter
from src.config.settings import get_settings
from src.models.schemas import RequestModel, ResponseModel

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


@router.post("/api/endpoint")
@limiter.limit("30/minute")  # Obligatoire sur tous les endpoints publics
async def my_endpoint(
    request: Request,           # Obligatoire pour SlowAPI
    payload: RequestModel,
    authorization: Optional[str] = Header(None),
) -> ResponseModel:
    """Docstring courte."""
    # 1. Extraire et valider le token
    user = get_user_from_token(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou manquant"
        )

    # 2. Logique métier
    try:
        result = await do_something(payload, user["id"])
    except Exception as e:
        logger.error(f"Erreur endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne"
        )

    # 3. Retourner le modèle de réponse
    return ResponseModel(data=result)
```

**Règles :**
- `router = APIRouter()` sans prefix (le prefix est défini dans `routes/__init__.py`)
- `request: Request` en premier paramètre (obligatoire pour `@limiter.limit`)
- `@limiter.limit("30/minute")` sur tous les endpoints non-internes
- Logger avec `logger = logging.getLogger(__name__)`
- Jamais de `print()` — toujours `logger.info/error/warning`

---

## Pattern d'extraction de token JWT

Basé sur `src/api/deps.py` et `src/api/routes/auth.py` :

```python
from typing import Optional
from fastapi import Header, HTTPException, status


def get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    """
    Extrait le user depuis le header Authorization.
    Utilise Supabase pour valider le token (pas de vérification JWT locale).
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        from src.api.deps import get_supabase_anon_client
        supabase = get_supabase_anon_client()
        response = supabase.auth.get_user(token)
        if response and response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "user_metadata": response.user.user_metadata,
            }
    except Exception as e:
        logger.warning(f"Token invalide: {e}")

    return None


def get_user_id_from_token(authorization: Optional[str]) -> Optional[str]:
    """Extrait seulement le user_id (plus rapide, pas de call Supabase)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        import base64, json
        parts = token.split(".")
        if len(parts) == 3:
            padded = parts[1] + "=" * (-len(parts[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded))
            return payload.get("sub")
    except Exception:
        pass
    return None


# Route qui exige l'auth
@router.get("/api/protected")
@limiter.limit("60/minute")
async def protected_route(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    user = get_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Auth requise")
    ...
```

---

## Pattern Pydantic v2

Basé sur `src/models/schemas.py` et `src/config/settings.py` :

```python
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


# ── Modèle de données ──────────────────────────────────────────────────────────

class JobSearchRequest(BaseModel):
    """Pydantic v2 : validation stricte."""
    job_title: str = Field(..., min_length=2, max_length=200)
    country_code: str = Field(default="fr", min_length=2, max_length=3)
    contract_type: Literal["", "cdi", "cdd", "freelance", "internship"] = ""
    max_results: int = Field(default=100, ge=5, le=200)

    # Pydantic v2 : model_config remplace class Config
    model_config = {"json_schema_extra": {"example": {
        "job_title": "Data Engineer",
        "country_code": "fr",
    }}}


class JobSearchResponse(BaseModel):
    success: bool = True
    jobs: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


# ── Settings ───────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Secrets via SecretStr (jamais loggués)
    groq_api_key: SecretStr
    supabase_service_role_key: SecretStr
    stripe_webhook_secret: SecretStr

    # Valeurs normales
    app_name: str = "HuntZen"
    environment: str = "development"
    debug: bool = False

    def get_groq_key(self) -> str:
        return self.groq_api_key.get_secret_value()
```

**Règles Pydantic v2 :**
- `model_config = SettingsConfigDict(...)` (pas `class Config`)
- `SecretStr` pour TOUS les secrets (API keys, tokens, passwords)
- `.get_secret_value()` pour lire un SecretStr
- `Field(...)` avec contraintes (`min_length`, `ge`, `le`, etc.)
- `Literal[...]` pour les valeurs énumérées

---

## Pattern agent LangChain

Basé sur `src/agents/base.py` :

```python
"""
MyAgent
=======
Description de l'agent.
"""

from src.agents.base import BaseAgent, load_prompt
from src.config.settings import settings


class MyAgent(BaseAgent):
    """Agent pour [objectif]."""

    def __init__(self):
        super().__init__(
            model=settings.llm_model_powerful,  # ou llm_model_fast
            temperature=0.7,
        )
        # Charger le prompt : DB d'abord, fallback fichier .txt
        self.system_prompt = load_prompt("my_agent_prompt.txt")

    async def run(
        self,
        message: str,
        language: str = "fr",
        history: list[dict] | None = None,
    ) -> dict:
        """
        Exécute l'agent.
        Retourne toujours : {"success": bool, "response": str, ...}
        """
        try:
            # Construire les messages LangChain
            messages = self._build_messages(message, history or [])

            # Appel Groq avec retry automatique
            response = await self._call_with_retry(messages)

            return {
                "success": True,
                "response": response.content,
                "language": language,
            }
        except Exception as e:
            logger.error(f"Agent error: {e}", exc_info=True)
            return {
                "success": False,
                "response": "Une erreur est survenue.",
                "error": str(e),
            }
```

**Règles agents :**
- Toujours dans `src/agents/<nom>/main_agent.py` ou `conversational_agent.py`
- Prompt dans `prompts/<nom>.txt` (chargé via `load_prompt()`)
- Utiliser `load_prompt()` — cherche d'abord en DB (`ai_prompts`), puis fichier
- Retourner `{"success": bool, "response": str}` toujours
- **Jamais LangGraph** — uniquement LangChain

---

## Pattern Supabase (backend)

```python
from supabase import create_client
from src.config.settings import get_settings

settings = get_settings()


def get_supabase_client():
    """Client service role — bypass RLS (admin operations)."""
    return create_client(
        settings.supabase_url,
        settings.get_supabase_service_role_key()
    )


def get_supabase_anon_client():
    """Client anon — respecte RLS (user operations)."""
    return create_client(
        settings.supabase_url,
        settings.get_supabase_key()  # anon key
    )


# Requêtes
supabase = get_supabase_client()

# Select
result = supabase.table("user_subscriptions") \
    .select("plan_name, is_active") \
    .eq("user_id", user_id) \
    .maybe_single() \
    .execute()

if result.data:
    plan = result.data["plan_name"]

# Insert
supabase.table("user_notifications") \
    .insert({"user_id": user_id, "message": msg}) \
    .execute()

# Update
supabase.table("usage_quotas") \
    .update({"count": count + 1}) \
    .eq("user_id", user_id) \
    .execute()

# RPC
result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
```

**Règles :**
- `service_role_key` pour les opérations admin (bypass RLS)
- `anon_key` pour la validation des tokens utilisateur
- Toujours vérifier `result.data` avant d'utiliser
- `.maybe_single()` si 0 ou 1 résultat (pas `.single()` qui lève une erreur si 0)

---

## Pattern gestion d'erreurs HTTP

```python
from fastapi import HTTPException, status

# 401 — Auth manquante ou invalide
raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token manquant ou invalide"
)

# 403 — Accès refusé (user authentifié mais pas autorisé)
raise HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Accès non autorisé"
)

# 404 — Ressource introuvable
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"Ressource {id} introuvable"
)

# 422 — Validation échouée (géré automatiquement par Pydantic)

# 429 — Quota dépassé (format enrichi)
raise HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail={
        "code": "QUOTA_EXCEEDED",
        "feature": "assistant_messages",
        "limit": 10,
        "used": 10,
        "message": "Quota journalier atteint."
    }
)

# 500 — Erreur interne (logger AVANT de lever)
logger.error(f"Erreur critique: {e}", exc_info=True)
raise HTTPException(
    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    detail="Erreur interne"
)
```

---

## Conventions de nommage Python

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Fichiers/modules | snake_case | `career_score.py`, `main_agent.py` |
| Fonctions | snake_case | `get_user_from_token()` |
| Variables | snake_case | `user_id`, `_coach_agent` |
| Classes | PascalCase | `CareerCoachAgent`, `BaseAgent` |
| Constantes | UPPER_SNAKE | `MAX_JOBS = 750` |
| Privé/interne | `_` prefix | `_coach_agent`, `_groq_semaphore` |
| Routes | kebab-case URL | `/api/career-score` |
| Paramètres Supabase RPC | `p_` prefix | `p_user_id` |

---

## Tests — Patterns pytest

**Structure** :
```
tests/                         # À la racine (pas dans backend/)
├── conftest.py                # Fixtures : coach_agent, cv_analyzer, job_scout
├── test_coach_agent.py
├── test_cv_analyzer.py
├── test_job_scout.py
├── test_france_travail.py
└── unit/
    └── test_base_agent.py
```

```python
# Pattern test async (pytest-asyncio)
import pytest

@pytest.mark.asyncio
async def test_my_feature(coach_agent):
    """Docstring du test — décrit ce qui est testé."""
    result = await coach_agent.run(
        message="Test message",
        language="fr"
    )
    assert result["success"] is True
    assert isinstance(result["response"], str)
    assert len(result["response"]) > 10


# conftest.py — charger .env avant tout
from pathlib import Path
from dotenv import load_dotenv
root_dir = Path(__file__).parent.parent
load_dotenv(root_dir / ".env", override=True)
```

---

## Rate limiting — SlowAPI

```python
# Déjà configuré dans src/api/middleware.py
# Import et usage dans les routes :
from src.api.middleware import limiter

@router.post("/endpoint")
@limiter.limit("30/minute")  # Valeurs courantes : 10, 30, 60/minute
async def my_route(request: Request, ...):
    ...
```

**Limites recommandées :**
- Endpoints LLM (coach, assistant) : `10/minute`
- Endpoints search (jobs) : `30/minute`
- Endpoints auth : `10/minute`
- Endpoints publics généraux : `60/minute`
- Webhooks Stripe : pas de rate limit (vérifier signature à la place)

---

## Workers ARQ

```python
# Enqueue une tâche (depuis une route)
from arq import create_pool
from src.workers.settings import _get_redis_settings

pool = await create_pool(_get_redis_settings())
job = await pool.enqueue_job(
    "coach_task",
    message=message,
    session_id=session_id,
    language=language,
)
job_id = job.job_id

# Définir une nouvelle tâche (dans src/workers/tasks.py)
async def my_new_task(
    ctx: dict,
    param1: str,
    param2: int = 0,
) -> dict:
    """ARQ task — timeout=120s, max_tries=3."""
    # logique...
    return {"success": True, "result": ...}

# Enregistrer dans WorkerSettings.functions (workers/settings.py)
```

---

## LLM Models disponibles

```python
# settings.py
llm_model_fast = "meta-llama/llama-4-scout-17b-16e-instruct"   # Rapide, résistant jailbreak
llm_model_powerful = "llama-3.3-70b-versatile"                  # Puissant, optimisé français

# Usage dans les agents
from src.config.settings import settings
model = settings.llm_model_powerful  # ou .llm_model_fast
```

---

## Validation avant commit

```bash
# Obligatoire avant tout commit backend
ruff check . --ignore E501      # Lint Python
python -m mypy src/             # Type check strict
cd tests && python -m pytest -v --tb=short  # Tests
```

---

## Erreurs fréquentes à éviter

```python
# ❌ print() en production
print(f"User: {user_id}")  # → logger.info(f"User: {user_id}")

# ❌ Secret hardcodé
api_key = "gsk_xxxx"  # → settings.get_groq_key()

# ❌ LangGraph
from langgraph import ...  # → LangChain uniquement

# ❌ .single() si résultat peut être vide
supabase.table("x").select("*").eq("id", id).single()  # → .maybe_single()

# ❌ Pas de type hints
def my_func(data):  # → def my_func(data: dict[str, Any]) -> str:

# ❌ Docling mis à jour sans tests
# docling==2.70.0 est pinnée — NE PAS changer

# ❌ any dans Pydantic
field: Any = None  # → Typer précisément, ou Optional[str] = None

# ❌ Oublier request: Request avec @limiter.limit
@limiter.limit("30/minute")
async def my_route(payload: Model):  # → ajouter request: Request EN PREMIER

# ❌ Service role pour valider les tokens user
supabase_service = get_supabase_client()
supabase_service.auth.get_user(token)  # → utiliser get_supabase_anon_client()

# ❌ Dépendre de profiles.subscription_* (deprecated)
supabase.table("profiles").select("subscription_plan")  # → table user_subscriptions
```
