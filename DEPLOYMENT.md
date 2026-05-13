# HuntZen Deployment Guide

Complete production deployment guide for HuntZen AI Career Platform.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup (Supabase)](#database-setup-supabase)
- [Backend Deployment (Modal)](#backend-deployment-modal)
- [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
- [Monitoring & Security](#monitoring--security)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────┐
│   Vercel CDN    │  ← Next.js 14 Frontend (Static + SSR)
└────────┬────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
┌────────▼────────┐              ┌────────▼────────┐
│  Supabase Auth  │              │  FastAPI (8000) │
│   + Database    │◄─────────────┤   Modal Labs    │
└─────────────────┘              └────────┬────────┘
         │                                │
         │                       ┌────────▼────────┐
         │                       │  Groq LLMs      │
         │                       │  (AI Inference) │
         │                       └─────────────────┘
         │
┌────────▼────────┐
│ Upstash Redis   │  ← Caching & Rate Limiting
└─────────────────┘

┌─────────────────┐
│  Sentry.io      │  ← Error Tracking & Monitoring
└─────────────────┘
```

**Components:**
- **Frontend**: Vercel (Next.js 14 with SSR + Static)
- **Backend**: Modal Labs (Serverless FastAPI)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **LLM**: Groq (Llama 3.3 70B + Llama 3.1 8B)
- **Caching**: Upstash Redis
- **Monitoring**: Sentry
- **CDN**: Vercel Edge Network

---

## Prerequisites

### Accounts Required

1. **Supabase**: [https://supabase.com](https://supabase.com) (Database + Auth)
2. **Vercel**: [https://vercel.com](https://vercel.com) (Frontend hosting)
3. **Modal Labs**: [https://modal.com](https://modal.com) (Backend serverless)
4. **Groq**: [https://console.groq.com](https://console.groq.com) (LLM provider)
5. **Upstash**: [https://upstash.com](https://upstash.com) (Redis cache)
6. **Sentry** (optional): [https://sentry.io](https://sentry.io) (Error tracking)

### Tools Required

```bash
# Install CLI tools
npm install -g vercel          # Vercel CLI
pip install modal              # Modal CLI
pip install supabase           # Supabase CLI (optional)
```

---

## Environment Configuration

### 1. Production Environment Variables

Create `.env.production` file:

```env
# ============================================
# SUPABASE (Database + Auth)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_JWT_SECRET=your-jwt-secret
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres

# ============================================
# GROQ (LLM Provider)
# ============================================
GROQ_API_KEY=gsk_production_key_here
PRIMARY_MODEL=llama-3.3-70b-versatile
FAST_MODEL=llama-3.1-8b-instant

# ============================================
# JOB SEARCH APIs
# ============================================
ADZUNA_APP_ID=production_app_id
ADZUNA_API_KEY=production_api_key
SERPAPI_KEY=production_serpapi_key
RAPIDAPI_KEY=production_rapidapi_key

# ============================================
# MODAL (Serverless Backend)
# ============================================
FASTAPI_CALLBACK_URL=https://your-production-domain.com
MODAL_CALLBACK_SECRET=generate-with-openssl-rand-hex-32

# ============================================
# SECURITY & MONITORING
# ============================================
JWT_SECRET=generate-with-openssl-rand-hex-32
JWT_ALGORITHM=HS256
JWT_EXPIRATION_DAYS=7

SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

UPSTASH_REDIS_URL=redis://default:password@redis.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# ============================================
# APPLICATION CONFIG (Production)
# ============================================
DEBUG=false
LOG_LEVEL=WARNING
ENVIRONMENT=production
RATE_LIMIT=60
CACHE_TTL_HOURS=2

# Frontend/Backend URLs
FASTAPI_URL=https://your-modal-backend.modal.run
FRONTEND_URL=https://your-app.vercel.app

# Feature flags
ENABLE_ADZUNA=true
ENABLE_SERPAPI=true
ENABLE_REMOTEOK=true
ENABLE_INTERVIEW_SIMULATOR=false  # Beta feature
```

### 2. Generate Secrets

```bash
# JWT Secret
openssl rand -hex 32

# Modal Callback Secret
openssl rand -hex 32
```

---

## Database Setup (Supabase)

### Step 1: Create Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Choose organization and region (closest to users)
4. Set database password (save it!)
5. Wait for project provisioning (~2 minutes)

### Step 2: Get API Credentials

Navigate to: **Settings → API**

Copy these values:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep secret!)

Navigate to: **Settings → API → JWT Secret**

Copy JWT Secret → `SUPABASE_JWT_SECRET`

### Step 3: Get Database Connection String

Navigate to: **Settings → Database → Connection string → URI**

Copy and set password:
```
postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Step 4: Run Database Migrations

```bash
# Set environment variables
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."

# Run migration script
python scripts/migrations/apply_migration.py
```

This creates:
- `profiles` table (user profiles)
- `cv_analyses` table (CV analysis results)
- `job_searches` table (search history)
- `coach_conversations` table (chat history)
- Row Level Security (RLS) policies

### Step 5: Configure Authentication

Navigate to: **Authentication → Providers**

Enable:
- ✅ Email/Password
- ✅ Google OAuth (optional)
- ✅ GitHub OAuth (optional)

Navigate to: **Authentication → URL Configuration**

Set:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

---

## Backend Deployment (Modal)

### Step 1: Install Modal CLI

```bash
pip install modal
modal setup  # Authenticates your account
```

### Step 2: Configure Modal Secrets

Add secrets to Modal dashboard: [https://modal.com/secrets](https://modal.com/secrets)

Create secret named `huntzen-secrets` with:
```
GROQ_API_KEY=gsk_...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADZUNA_APP_ID=...
ADZUNA_API_KEY=...
SERPAPI_KEY=...
RAPIDAPI_KEY=...
```

### Step 3: Deploy Backend

```bash
cd backend

# Deploy to Modal
modal deploy modal_app.py
```

This will output:
```
✓ Created function huntzen-cv-processor
✓ Created web endpoint: https://huntzen--cv-processor.modal.run
```

**Copy the URL** → Update `FASTAPI_URL` in frontend `.env`

### Step 4: Configure Callback URL

Update `.env`:
```env
FASTAPI_CALLBACK_URL=https://your-app.vercel.app
MODAL_CALLBACK_SECRET=your-secret-from-step-2
```

Redeploy:
```bash
modal deploy modal_app.py
```

---

## Frontend Deployment (Vercel)

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
vercel login  # Authenticate
```

### Step 2: Configure Project

```bash
cd frontend-next

# Link to Vercel project (creates new or links existing)
vercel link
```

Follow prompts:
- Set up and deploy? → Yes
- Which scope? → Your account/team
- Link to existing project? → No (first time) / Yes (if exists)
- Project name? → huntzen-jobsearch

### Step 3: Add Environment Variables

**Option A: Via CLI**

```bash
# Add each variable
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add GROQ_API_KEY production
# ... repeat for all variables
```

**Option B: Via Dashboard**

1. Go to [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Select project → Settings → Environment Variables
3. Add all variables from `.env.production`
4. Set environment: **Production**

### Step 4: Deploy to Production

```bash
# Deploy to production
vercel --prod
```

Output:
```
✓ Production: https://huntzen-jobsearch.vercel.app [2m]
```

### Step 5: Custom Domain (Optional)

```bash
# Add custom domain
vercel domains add yourdomain.com
```

Follow DNS configuration instructions.

---

## Monitoring & Security

### Sentry Configuration

#### 1. Create Sentry Project

1. Go to [https://sentry.io](https://sentry.io)
2. Create new project → Select **Next.js**
3. Copy DSN

#### 2. Configure Frontend

Already configured in `frontend-next/sentry.client.config.ts` and `sentry.server.config.ts`

Add to Vercel environment:
```env
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

#### 3. Configure Backend

Update Modal secrets with:
```env
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Upstash Redis Configuration

#### 1. Create Redis Database

1. Go to [https://console.upstash.com](https://console.upstash.com)
2. Create database → Choose region
3. Copy credentials

#### 2. Add to Environment

```env
# Backend (standard Redis)
UPSTASH_REDIS_URL=redis://default:password@redis.upstash.io:6379

# Frontend (REST API for rate limiting)
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AxxxYourTokenHere
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd backend
          pip install -e .
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend-next
          npm ci
      - name: Type check
        run: |
          cd frontend-next
          npm run type-check
      - name: Build
        run: |
          cd frontend-next
          npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

  deploy-backend:
    needs: [test-backend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install Modal
        run: pip install modal
      - name: Deploy to Modal
        run: |
          cd backend
          modal deploy modal_app.py
        env:
          MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
          MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}

  deploy-frontend:
    needs: [test-frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: frontend-next
```

### Required GitHub Secrets

Add to: **Repository Settings → Secrets → Actions**

- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Troubleshooting

### Backend Issues

#### Modal deployment fails

```bash
# Check Modal status
modal status

# View logs
modal logs huntzen-cv-processor

# Test locally first
modal run modal_app.py
```

#### LLM quota exceeded

Groq has rate limits on free tier. Solution:
1. Upgrade Groq plan
2. Or implement request queuing
3. Or use fallback model: `llama-3.1-8b-instant`

### Frontend Issues

#### Build fails on Vercel

1. Check build logs in Vercel dashboard
2. Verify all environment variables are set
3. Test build locally:
   ```bash
   npm run build
   ```

#### Authentication not working

1. Verify Supabase redirect URLs match your domain
2. Check JWT secret matches between Supabase and `.env`
3. Clear browser cookies/cache

### Database Issues

#### Connection timeout

1. Check DATABASE_URL format
2. Verify Supabase project is active
3. Enable connection pooling (Supabase dashboard)

#### RLS policies blocking access

```sql
-- Temporarily disable RLS to test (DEV ONLY)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Re-enable after fixing policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### Performance Issues

#### Slow API responses

1. Enable Redis caching (Upstash)
2. Use fast LLM model for simple tasks
3. Implement request caching in frontend

#### High memory usage

1. Modal: Increase container size in `modal_app.py`
2. Optimize LangChain agent prompts
3. Reduce batch sizes for CV processing

---

## Support

For deployment issues:
- **GitHub Issues**: [https://github.com/huntzenjobs/HuntzenJobs/issues](https://github.com/huntzenjobs/HuntzenJobs/issues)
- **Email**: contact@huntzen.ai

---

**Deployment Checklist:**

- [ ] Supabase project created and configured
- [ ] Database migrations applied
- [ ] Modal backend deployed
- [ ] Vercel frontend deployed
- [ ] All environment variables set
- [ ] Custom domain configured (optional)
- [ ] Sentry monitoring enabled
- [ ] Redis caching enabled
- [ ] SSL certificate active (automatic with Vercel)
- [ ] CI/CD pipeline configured
- [ ] Test authentication flow
- [ ] Test CV upload and analysis
- [ ] Test job search functionality
- [ ] Monitor error rates in Sentry

Your production HuntZen deployment is ready.
