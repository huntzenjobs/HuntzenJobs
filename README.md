# HuntZen - AI-Powered Career Platform

A professional-grade AI career platform built with **FastAPI**, **LangChain**, and **Groq LLMs**.

## Features

### Career Coach Agent

Your AI career advisor with deep sub-agents:

- **TrainingAdvisor**: Recommends courses, certifications, and learning paths
- **CareerPlanner**: Creates personalized career progression plans
- **SkillAnalyzer**: Analyzes skill gaps and market demands

### Job Scout Agent

AI-powered job search aggregating multiple sources:

- **QueryRefiner**: Corrects typos, expands queries, adds synonyms
- **JobRanker**: AI-powered relevance scoring for job listings
- **MarketAnalyzer**: Provides salary insights and market trends

### CV Analyzer Agent

Comprehensive CV analysis with:

- **ATSScorer**: ATS compatibility scoring with section-by-section analysis
- **SkillExtractor**: Extracts and categorizes technical/soft skills
- **JobMatcher**: Matches CV against specific job descriptions
- **ImprovementAdvisor**: Provides actionable improvement suggestions

## Architecture

```
src/
├── config/          # Pydantic Settings configuration
├── models/          # Pydantic schemas for requests/responses
├── agents/          # LangChain agents with sub-agent architecture
│   ├── base.py      # BaseAgent, SubAgent, BaseTool classes
│   ├── coach/       # Career Coach main agent + sub-agents
│   ├── job_scout/   # Job Scout main agent + sub-agents
│   └── cv_analyzer/ # CV Analyzer main agent + sub-agents
├── services/        # External services and providers
│   └── job_providers/
│       ├── adzuna.py      # Adzuna API (17 countries)
│       ├── serpapi.py     # Google Jobs via SerpAPI
│       ├── remoteok.py    # Free RemoteOK API
│       └── aggregator.py  # Multi-source aggregation
├── api/             # FastAPI routes and middleware
│   ├── deps.py      # Dependency injection
│   ├── middleware.py
│   └── routes/      # API endpoints
└── main.py          # FastAPI application entry
```

## Getting Started

### Prerequisites

- Python 3.11+
- UV (recommended) or pip

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/huntzen_jobsearch.git
cd huntzen_jobsearch

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -e .
# Or with UV:
uv pip install -e .
```

### Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Required API keys:

- `GROQ_API_KEY`: Required for AI agents (free at console.groq.com)
- `ADZUNA_APP_ID` + `ADZUNA_API_KEY`: For job search
- `SERPAPI_KEY`: For Google Jobs search

### Running

```bash
# Development
python -m src.main

# Or with uvicorn directly
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Access the application:

- Dashboard: http://localhost:8000
- API Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Career Coach

- `POST /api/coach/chat` - Chat with career coach
- `POST /api/coach/training` - Get training recommendations
- `POST /api/coach/career-plan` - Generate career plan

### Job Search

- `POST /api/jobs/search` - Search jobs across all sources
- `POST /api/jobs/refine-query` - Refine search query with AI

### CV Analysis

- `POST /api/cv/analyze` - Full CV analysis (upload PDF)
- `POST /api/cv/score-ats` - ATS compatibility score
- `POST /api/cv/extract-skills` - Extract skills from CV
- `POST /api/cv/match-job` - Match CV against job description

## Tech Stack

- **Backend**: FastAPI 0.109+
- **AI Framework**: LangChain (NO LangGraph)
- **LLMs**: Groq Llama 3.3 70B & Llama 3.1 8B
- **PDF Processing**: IBM Docling
- **Frontend**: Jinja2 Templates
- **Validation**: Pydantic v2
- **HTTP Client**: httpx (async)

## Project Structure

```
huntzen_jobsearch/
├── pyproject.toml       # Modern Python project config
├── .env                 # Environment variables (not in git)
├── .env.example         # Example environment template
├── src/                 # Main source code
├── templates/           # Jinja2 HTML templates
├── prompts/             # Agent system prompts
└── README.md
```

## Development

```bash
# Run tests
pytest

# Format code
ruff format .

# Lint
ruff check .

# Type check
mypy src
```

## Security

- All API keys stored as `SecretStr` in Pydantic Settings
- Input validation on all endpoints
- Rate limiting middleware ready
- Security protocol in prompts prevents prompt injection

## License

MIT License - see [LICENSE](LICENSE) file.

---

Built by a Machine Learning Engineer & Python Expert
