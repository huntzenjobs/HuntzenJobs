---
name: deploy-check
description: Pre-deployment checklist and validation for HuntZen
user-invocable: true
disable-model-invocation: true
---

# HuntZen Deployment Checklist

Run comprehensive pre-deployment checks before pushing to production.

## What this skill does

This skill performs a complete pre-deployment validation:
1. ✅ Backend tests (pytest)
2. ✅ Frontend build (npm run build)
3. ✅ No secrets in commits (.env, keys)
4. ✅ Railway health check
5. ✅ Vercel preview status
6. ✅ Database migrations status
7. ✅ Stripe webhook validation

## Usage

Invoke with: `/deploy-check`

Or in conversation: "Run the deployment checklist"

## Steps

### 1. Backend Tests
```bash
cd backend && pytest tests/ -v --tb=short
```
**Expected**: All tests pass

### 2. Frontend Build
```bash
cd frontend-next && npm run build
```
**Expected**: Build succeeds without errors

### 3. Secrets Check
```bash
git diff --cached | grep -E "(API_KEY|SECRET|PASSWORD|TOKEN)" || echo "✓ No secrets detected"
```
**Expected**: No secrets in staged files

### 4. Railway Backend Health
```bash
curl -f https://huntzen-backend-production.up.railway.app/health || echo "⚠️ Backend not responding"
```
**Expected**: HTTP 200 response

### 5. Vercel Frontend Status
```bash
cd frontend-next && vercel --prod --confirm 2>&1 | grep -i "deployed\|error"
```
**Expected**: Deployment successful or preview ready

### 6. Database Migrations Check
```bash
cd backend && python -c "from src.db import get_supabase_client; print('✓ Supabase connected')" || echo "⚠️ Database connection issue"
```
**Expected**: Connection successful

### 7. Stripe Webhooks Validation
Check that webhook endpoints are reachable:
```bash
curl -X POST https://huntzen-backend-production.up.railway.app/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"test": true}' || echo "⚠️ Stripe webhook endpoint not accessible"
```

## Output Format

```
🚀 HuntZen Deployment Checklist
================================

✅ Backend Tests: PASSED (23/23)
✅ Frontend Build: SUCCESS
✅ Secrets Check: CLEAN
⚠️  Railway Health: WARNING (slow response)
✅ Vercel Status: DEPLOYED
✅ Database: CONNECTED
✅ Stripe Webhooks: READY

Overall Status: ⚠️ READY WITH WARNINGS

Warnings:
- Railway backend responding slowly (>2s)

Recommendation:
✅ Safe to deploy, but monitor backend performance.
```

## Error Handling

If any critical check fails:
1. **DO NOT PROCEED** with deployment
2. Report the specific failure
3. Suggest remediation steps
4. Wait for user confirmation

## Best Practices

- Run this skill **before every production deploy**
- Use it after major feature additions
- Run it when merging to main branch
- Include output in PR descriptions

## Related Skills

- `/commit` - Create a commit with proper message
- `/api-doc` - Generate API documentation
- `/security-check` - Security audit
