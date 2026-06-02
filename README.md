# HuntZen - AI-Powered Career Platform

> Professional AI career platform combining **FastAPI**, **Next.js 14**, **LangChain**, and **Groq LLMs** for intelligent job search and career guidance.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-green.svg)](https://fastapi.tiangolo.com/)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Development](#development)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Career Coach Agent

Your AI career advisor powered by LangChain with specialized sub-agents:

- **TrainingAdvisor**: Personalized course and certification recommendations
- **CareerPlanner**: AI-generated career progression roadmaps
- **SkillAnalyzer**: Market demand analysis and skill gap identification
- **InterviewSimulator**: Voice-based interview practice with ElevenLabs AI (Beta)

### Job Scout Agent

Intelligent job search aggregating multiple sources with AI enhancement:

- **Multi-Provider Search**: Adzuna (17 countries), SerpAPI (Google Jobs), RemoteOK
- **QueryRefiner**: AI-powered query expansion and typo correction
- **JobRanker**: Relevance scoring based on your profile
- **MarketAnalyzer**: Real-time salary insights and market trends
- **Smart Filtering**: Location, salary, remote work, job type

### CV Analyzer Agent

Comprehensive CV analysis with ATS optimization:

- **ATSScorer**: Section-by-section ATS compatibility analysis
- **SkillExtractor**: Automatic technical and soft skills extraction
- **JobMatcher**: CV-to-job-description matching with scoring
- **ImprovementAdvisor**: Actionable recommendations for CV enhancement
- **PDF Processing**: IBM Docling for accurate document parsing

### Frontend

Next.js 14 application with enterprise features:

- **Authentication**: Supabase Auth with JWT
- **Responsive UI**: shadcn/ui + Tailwind CSS
- **Real-time Updates**: Server-Sent Events for async operations
- **Security**: Rate limiting, anomaly detection, Sentry monitoring
- **Pricing**: Integrated Stripe payment system

---

## Architecture

```
huntzen_jobsearch/
│
├── backend/                    # FastAPI Backend
│   ├── src/
│   │   ├── agents/            # LangChain AI Agents
│   │   │   ├── base.py        # BaseAgent, SubAgent, BaseTool
│   │   │   ├── coach/         # Career Coach + sub-agents
│   │   │   ├── job_scout/     # Job Scout + sub-agents
│   │   │   └── cv_analyzer/   # CV Analyzer + sub-agents
│   │   │
│   │   ├── api/               # FastAPI Routes
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── middleware.py  # Rate limiting, CORS, security
│   │   │   └── deps.py        # Dependency injection
│   │   │
│   │   ├── services/          # External Services
│   │   │   ├── job_providers/ # Adzuna, SerpAPI, RemoteOK
│   │   │   ├── events/        # Tech events scraper
│   │   │   └── pdf/           # CV parsing (IBM Docling)
│   │   │
│   │   ├── models/            # Pydantic Schemas
│   │   ├── config/            # Settings & Configuration
│   │   ├── utils/             # Helpers & Utilities
│   │   └── main.py            # FastAPI App Entry
│   │
│   ├── prompts/               # Agent System Prompts
│   ├── templates/             # Jinja2 Templates
│   ├── pyproject.toml         # Python Dependencies
│   └── pytest.ini             # Test Configuration
│
├── frontend-next/             # Next.js 14 Frontend
│   ├── src/
│   │   ├── app/              # App Router (Next.js 14)
│   │   │   ├── (auth)/       # Auth pages (login, signup)
│   │   │   ├── (dashboard)/  # Protected pages
│   │   │   └── api/          # API routes & webhooks
│   │   │
│   │   ├── components/       # React Components
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── cv/           # CV wizard & analyzer
│   │   │   ├── jobs/         # Job search & listings
│   │   │   └── coach/        # Career coach chat
│   │   │
│   │   ├── lib/              # Libraries & Utilities
│   │   │   ├── security/     # Rate limiting, monitoring
│   │   │   ├── hooks/        # React hooks
│   │   │   └── utils/        # Helper functions
│   │   │
│   │   └── types/            # TypeScript type definitions
│   │
│   ├── public/               # Static assets
│   └── package.json          # Node dependencies
│
├── scripts/                   # Utility Scripts
│   ├── migrations/           # Database migrations
│   ├── setup/                # Setup scripts
│   └── tests/                # Test utilities
│
├── e2e/                      # End-to-end tests (Playwright)
├── archive/                  # Archived documentation
├── .env.example              # Environment template
└── README.md                 # This file
```

---

## Tech Stack

### Backend
- **Framework**: FastAPI 0.109+ (async Python web framework)
- **AI/ML**: LangChain (no LangGraph), Groq LLMs
- **Models**: Llama 3.3 70B (powerful), Llama 3.1 8B (fast)
- **PDF Processing**: IBM Docling 2.0
- **Validation**: Pydantic v2 with strict typing
- **HTTP Client**: httpx (async requests)
- **Database**: Supabase (PostgreSQL + Auth)
- **Caching**: Upstash Redis

### Frontend
- **Framework**: Next.js 14 (App Router, Server Actions)
- **Language**: TypeScript 5+
- **UI Library**: React 19
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: React Query (TanStack Query)
- **Auth**: Supabase Auth + JWT
- **Payments**: Stripe
- **Monitoring**: Sentry

### Infrastructure
- **Backend API**: Railway (FastAPI, Docker, branche `Production`)
- **CV Processing**: Modal Labs (serverless — extraction PDF Docling + analyse LLM Groq, app `huntzen-cv-processor`)
- **Frontend Hosting**: Vercel (Next.js 14)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Caching / Queue**: Upstash Redis + ARQ workers
- **Monitoring**: Sentry

---

## Getting Started

### Prerequisites

- **Python**: 3.11 or higher
- **Node.js**: 18+ (for frontend)
- **Package Managers**: pip/uv (Python), npm/yarn/pnpm (Node.js)

### Quick Start (Development)

#### 1. Clone Repository

```bash
git clone https://github.com/huntzenjobs/HuntzenJobs.git
cd huntzen_jobsearch
```

#### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -e .
# Or with UV (recommended):
uv pip install -e .

# Copy environment template
cp ../.env.example ../.env
# Edit .env and add your API keys (see Configuration section)

# Run backend
python -m src.main
# Or with uvicorn:
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Backend now running at: http://localhost:8000

#### 3. Frontend Setup

```bash
# Open new terminal
cd frontend-next

# Install dependencies
npm install
# Or: yarn install / pnpm install

# Copy environment template (if not done)
cp ../.env.example ../.env

# Run frontend
npm run dev
```

Frontend now running at: http://localhost:3000

---

## Configuration

### Required API Keys

Create a `.env` file at the project root from `.env.example`:

#### Supabase (Required)

Get credentials from [Supabase Dashboard](https://supabase.com/dashboard):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Backend only
SUPABASE_JWT_SECRET=your-jwt-secret
DATABASE_URL=postgresql://postgres...
```

#### Groq (Required)

Get free API key from [Groq Console](https://console.groq.com/keys):

```env
GROQ_API_KEY=gsk_your_groq_api_key
PRIMARY_MODEL=llama-3.3-70b-versatile
FAST_MODEL=llama-3.1-8b-instant
```

#### Job Search APIs (Optional but recommended)

```env
# Adzuna - https://developer.adzuna.com/
ADZUNA_APP_ID=your_app_id
ADZUNA_API_KEY=your_api_key

# SerpAPI - https://serpapi.com/
SERPAPI_KEY=your_serpapi_key

# RapidAPI - https://rapidapi.com/ (for Indeed/LinkedIn scrapers)
RAPIDAPI_KEY=your_rapidapi_key
```

#### Interview Simulator (Optional - Beta)

```env
ENABLE_INTERVIEW_SIMULATOR=true  # Default: false
ELEVENLABS_API_KEY=sk_your_elevenlabs_key
ELEVENLABS_AGENT_ID=agent_your_agent_id
```

#### Monitoring & Security (Production)

```env
# Sentry - https://sentry.io/
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Upstash Redis - https://console.upstash.com/
UPSTASH_REDIS_URL=redis://default:password@redis.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

---

## Development

### Backend Development

```bash
cd backend

# Run tests
pytest tests/ -v

# Run tests with coverage
pytest --cov=src --cov-report=html

# Lint code
ruff check src/

# Format code
ruff format src/

# Type check
mypy src/
```

### Frontend Development

```bash
cd frontend-next

# Run linter
npm run lint

# Type check
npm run type-check

# Build production
npm run build

# Run E2E tests
npm run test:e2e
```

### Project Scripts

Utility scripts are organized in `scripts/`:

```bash
# Database migrations
python scripts/migrations/apply_migration.py

# Setup test user
python scripts/setup/create_test_user.py

# Debug tools
python scripts/debug/check_auth_structure.py
```

---

## API Documentation

### Interactive Documentation

Once backend is running, access:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Key Endpoints

#### Career Coach

```http
POST /api/coach/chat
POST /api/coach/training
POST /api/coach/career-plan
POST /api/coach/interview-simulator  # Beta
```

#### Job Search

```http
POST /api/jobs/search
POST /api/jobs/refine-query
GET  /api/jobs/{job_id}
POST /api/jobs/analyze-market
```

#### CV Analysis

```http
POST /api/cv/analyze          # Upload PDF for full analysis
POST /api/cv/score-ats        # ATS compatibility score
POST /api/cv/extract-skills   # Extract skills
POST /api/cv/match-job        # Match CV to job description
POST /api/cv/suggest-improvements
```

#### Events & Networking

```http
GET /api/events/search        # Tech events and conferences
```

---

## Deployment

For detailed production deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### Quick Deploy

#### Frontend (Vercel)

```bash
cd frontend-next
vercel --prod
```

#### Backend API (Railway)

Push to the `Production` branch triggers an automatic redeploy:

```bash
git push origin Production
```

Force a redeploy without changes:

```bash
git commit --allow-empty -m "chore: trigger redeploy" && git push origin Production
```

#### CV Processing service (Modal Labs)

Serverless function for async CV extraction + LLM analysis:

```bash
modal deploy scripts/deployment/modal_app.py
```

#### Database (Supabase)

1. Create project at [Supabase](https://supabase.com)
2. Run migrations: `python scripts/migrations/apply_migration.py`
3. Configure RLS policies in Supabase dashboard

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Code of Conduct
- Development workflow
- Coding standards
- Pull request process
- Testing requirements

### Quick Contribution Guide

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'feat: add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **LangChain**: For the agent framework
- **Groq**: For ultra-fast LLM inference
- **IBM Docling**: For reliable PDF parsing
- **Supabase**: For auth and database infrastructure
- **Vercel**: For seamless frontend hosting
- **Modal**: For serverless Python compute

---

## Contact & Support

- **Issues**: [GitHub Issues](https://github.com/huntzenjobs/HuntzenJobs/issues)
- **Discussions**: [GitHub Discussions](https://github.com/huntzenjobs/HuntzenJobs/discussions)
- **Email**: contact@huntzen.ai

---

**Built with ❤️ by the HuntZen Team**

*Empowering careers through AI*
