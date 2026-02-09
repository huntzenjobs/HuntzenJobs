---
name: performance-check
description: Analyze and optimize backend/frontend performance
user-invocable: true
---

# Performance Analysis & Optimization

Analyze and optimize HuntZen backend (FastAPI) and frontend (Next.js) performance.

## Usage

`/performance-check`

Or for specific areas:
- `/performance-check backend` - API performance only
- `/performance-check frontend` - Frontend bundle/render performance
- `/performance-check database` - Database query performance

## What this skill does

1. 🔍 Profile performance bottlenecks
2. 📊 Measure response times
3. 💾 Analyze database queries
4. 📦 Check bundle sizes
5. ⚡ Suggest optimizations
6. 📈 Generate performance report

---

## Backend Performance (FastAPI)

### 1. API Response Times

**Measure endpoint latency:**
```bash
# Test jobs search endpoint
time curl -X POST https://huntzen-backend-production.up.railway.app/api/jobs/search \
  -H "Content-Type: application/json" \
  -d '{"job_title": "Python Developer", "country_code": "fr"}'

# Expected: < 2 seconds
# Warning: 2-5 seconds
# Critical: > 5 seconds
```

**Profile with Python:**
```python
import cProfile
import pstats

# Profile jobs search
cProfile.run('agent.run(job_title="Python Developer", country_code="fr")', 'stats')

# Analyze
p = pstats.Stats('stats')
p.sort_stats('cumulative')
p.print_stats(20)  # Top 20 slowest functions
```

---

### 2. Database Query Performance

**Slow query detection:**
```python
# Add to Supabase queries
import time

start = time.time()
result = supabase.table("user_subscriptions").select("*").eq("user_id", user_id).execute()
duration = time.time() - start

if duration > 0.5:  # Slower than 500ms
    logger.warning(f"Slow query: {duration:.2f}s - user_subscriptions")
```

**Common bottlenecks:**
- ❌ Missing indexes on foreign keys
- ❌ N+1 queries (fetching in loops)
- ❌ Selecting unnecessary columns
- ❌ No query result caching

**Optimization:**
```python
# ❌ SLOW: N+1 queries
for job in jobs:
    company = supabase.table("companies").select("*").eq("id", job.company_id).execute()

# ✅ FAST: Batch query
company_ids = [j.company_id for j in jobs]
companies = supabase.table("companies").select("*").in_("id", company_ids).execute()
```

---

### 3. LangGraph Agent Performance

**Profile job scout agent:**
```python
# backend/src/agents/job_scout/main_agent.py

import time

@profile_execution
async def run(self, job_title: str, **kwargs):
    start = time.time()

    # Profile each step
    step1_start = time.time()
    providers = self._get_providers()
    logger.info(f"Providers init: {time.time() - step1_start:.2f}s")

    step2_start = time.time()
    jobs = await aggregate_jobs(providers, job_title)
    logger.info(f"Aggregation: {time.time() - step2_start:.2f}s")

    step3_start = time.time()
    deduplicated = deduplicate_jobs(jobs)
    logger.info(f"Deduplication: {time.time() - step3_start:.2f}s")

    total = time.time() - start
    logger.info(f"Total agent run: {total:.2f}s")
```

**Optimization tips:**
- ✅ Parallel provider calls (`asyncio.gather`)
- ✅ Cache LLM responses (same query)
- ✅ Limit provider results (50 max per provider)
- ✅ Timeout long-running providers (5s max)

---

### 4. Railway Container Metrics

**Check Railway logs:**
```bash
# Via Railway CLI
railway logs

# Look for:
- Memory usage (should be < 512MB)
- CPU usage (should be < 80%)
- Request latency (p95 < 2s)
```

**Optimize container:**
```dockerfile
# backend/Dockerfile

# Use slim base image
FROM python:3.11-slim

# Install only prod dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Use gunicorn workers
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "src.main:app"]
```

---

## Frontend Performance (Next.js)

### 1. Bundle Size Analysis

```bash
cd frontend-next

# Analyze bundle
npm run build
npm run analyze  # If @next/bundle-analyzer configured

# Check sizes
ls -lh .next/static/chunks/*.js

# Expected:
# - Main bundle: < 200KB
# - Per-page chunks: < 100KB each
# - Total: < 1MB
```

**Find large dependencies:**
```bash
npx webpack-bundle-analyzer .next/analyze.json
```

**Common culprits:**
- ❌ lodash (use lodash-es or tree-shaking)
- ❌ moment.js (use date-fns or dayjs)
- ❌ Entire icon libraries (use specific imports)
- ❌ Large UI frameworks

---

### 2. React Component Performance

**Profile renders:**
```tsx
import { Profiler } from 'react'

<Profiler id="SearchForm" onRender={(id, phase, actualDuration) => {
  if (actualDuration > 100) {
    console.warn(`${id} render took ${actualDuration}ms`)
  }
}}>
  <SearchFormInline />
</Profiler>
```

**Optimization:**
```tsx
// ❌ SLOW: Re-renders on every parent change
function SearchForm() {
  const [results, setResults] = useState([])
  const [filters, setFilters] = useState({})

  return <ResultsList results={results} filters={filters} />
}

// ✅ FAST: Memoized, only re-renders when results change
function SearchForm() {
  const [results, setResults] = useState([])
  const [filters, setFilters] = useState({})

  const memoizedResults = useMemo(() => results, [results])

  return <ResultsList results={memoizedResults} filters={filters} />
}
```

---

### 3. Image Optimization

**Use Next.js Image:**
```tsx
// ❌ SLOW: Raw img tag
<img src="/company-logo.png" />

// ✅ FAST: Next.js optimized
<Image
  src="/company-logo.png"
  width={48}
  height={48}
  alt="Company logo"
  loading="lazy"
/>
```

---

### 4. Lazy Loading

**Code splitting:**
```tsx
// ❌ SLOW: Import everything upfront
import { JobModal } from './job-modal'

// ✅ FAST: Lazy load modal
const JobModal = dynamic(() => import('./job-modal'), {
  loading: () => <Spinner />,
  ssr: false  // Don't render server-side
})
```

---

### 5. Vercel Performance Insights

**Check Web Vitals:**
```bash
# Via Vercel dashboard
# - LCP (Largest Contentful Paint): < 2.5s
# - FID (First Input Delay): < 100ms
# - CLS (Cumulative Layout Shift): < 0.1
```

**Monitor in code:**
```tsx
// pages/_app.tsx
export function reportWebVitals(metric) {
  console.log(metric)

  // Send to analytics
  if (metric.label === 'web-vital') {
    // Send to Vercel Analytics or Sentry
  }
}
```

---

## Performance Report Template

```
⚡ HuntZen Performance Report
==============================

Date: 2026-02-09 18:45:00
Duration: 2 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 BACKEND (Railway)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

API Response Times:
✅ /api/jobs/search     1.2s (target: < 2s)
⚠️  /api/cv/analyze     3.5s (target: < 2s) - SLOW
✅ /api/coach/chat      0.8s (target: < 2s)

Database Queries:
✅ user_subscriptions   45ms
✅ profiles             32ms
⚠️  usage_quotas        650ms - Missing index

Container Metrics:
✅ Memory: 340MB / 512MB (66%)
⚠️  CPU: 85% avg (target: < 80%)
✅ Request latency p95: 1.8s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 FRONTEND (Vercel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bundle Sizes:
✅ Main bundle:    145 KB (target: < 200KB)
⚠️  Jobs page:     220 KB (target: < 100KB) - LARGE
✅ Dashboard:       85 KB

Web Vitals:
✅ LCP: 1.8s (target: < 2.5s)
✅ FID: 45ms (target: < 100ms)
✅ CLS: 0.05 (target: < 0.1)

Component Renders:
✅ SearchForm:      12ms
⚠️  JobsList:       150ms - Too many re-renders
✅ JobCard:         8ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 OPTIMIZATION RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Backend:
1. Add index on usage_quotas(user_id, date)
2. Cache /api/cv/analyze results for 1 hour
3. Scale Railway to 2 replicas for load balancing

Frontend:
4. Lazy load JobsList component
5. Memoize JobCard to prevent re-renders
6. Code-split jobs page (reduce bundle by 50%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall Performance: B+ (85/100)
- Backend: A (90/100)
- Frontend: B (80/100)
- Database: B+ (85/100)
```

---

## Quick Wins

**Immediate optimizations (< 30 min):**
1. ✅ Add database indexes
2. ✅ Enable Next.js image optimization
3. ✅ Lazy load heavy components
4. ✅ Add response caching
5. ✅ Remove unused dependencies

**Medium effort (1-2 hours):**
1. ✅ Implement Redis caching
2. ✅ Optimize LangGraph agent flow
3. ✅ Add CDN for static assets
4. ✅ Profile and fix N+1 queries

**Long term (1+ days):**
1. ✅ Implement job search result caching
2. ✅ Add background job queue (Celery)
3. ✅ Migrate hot paths to Rust/Go
4. ✅ Implement full-text search (Algolia/Typesense)

---

## Monitoring Setup

**Add performance monitoring:**
```bash
# Install Sentry performance
pip install sentry-sdk[fastapi]
npm install @sentry/nextjs

# Configure traces
sentry_sdk.init(
    traces_sample_rate=0.1,  # 10% of requests
    profiles_sample_rate=0.1
)
```

---

## Related Skills

- `/deploy-check` - Pre-deployment validation
- `/security-check` - Security audit
- `/gen-test` - Generate tests
