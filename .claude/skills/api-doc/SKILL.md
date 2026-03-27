---
name: api-doc
description: Generate comprehensive API documentation from FastAPI routes
user-invocable: true
---

# HuntZen API Documentation Generator

Automatically generate comprehensive API documentation from your FastAPI routes.

## What this skill does

Analyzes FastAPI route files and generates:
1. 📋 OpenAPI 3.0 specification (JSON)
2. 📝 Human-readable Markdown docs
3. 🔍 Request/Response examples
4. 🏷️ Schema definitions
5. 🔐 Authentication requirements
6. ⚡ Rate limiting info

## Usage

Invoke with: `/api-doc`

Or specify a specific route file:
`/api-doc backend/src/api/routes/jobs.py`

Or generate docs for all routes:
`/api-doc all`

## Steps

### 1. Discover API Routes

Scan `backend/src/api/routes/` for all Python route files:
- jobs.py
- coach.py
- cv.py
- interview.py
- auth.py
- webhooks.py
- etc.

### 2. Extract Endpoint Information

For each route, extract:
- HTTP method (GET, POST, PUT, DELETE)
- Path (/api/jobs/search)
- Request schema (Pydantic models)
- Response schema
- Docstring description
- Query parameters
- Path parameters
- Headers required
- Rate limiting decorators

### 3. Generate OpenAPI Spec

Create valid OpenAPI 3.0 JSON with:
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "HuntZen API",
    "version": "3.0.0",
    "description": "AI-powered job search platform"
  },
  "servers": [
    {
      "url": "https://huntzen-backend-production.up.railway.app",
      "description": "Production"
    },
    {
      "url": "http://localhost:8000",
      "description": "Development"
    }
  ],
  "paths": {
    "/api/jobs/search": {
      "post": {
        "summary": "Search for jobs",
        "description": "AI-powered job search with deduplication",
        "requestBody": { ... },
        "responses": { ... }
      }
    }
  }
}
```

### 4. Generate Markdown Documentation

Create readable docs with:

#### Example structure:
```markdown
# HuntZen API Documentation

## Authentication
- All endpoints require valid Supabase JWT token
- Header: `Authorization: Bearer <token>`

## Rate Limiting
- 50 requests per minute per IP
- 1000 requests per day per user

## Endpoints

### POST /api/jobs/search
Search for jobs using AI-powered aggregation.

**Request:**
\`\`\`json
{
  "job_title": "Python Developer",
  "country_code": "fr",
  "city": "Paris",
  "max_results": 50
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "jobs": [...],
  "metadata": {...}
}
\`\`\`

**Rate Limit:** 50/minute
**Authentication:** Required
```

### 5. Save Documentation

Save generated docs to:
- `backend/docs/openapi.json` - OpenAPI spec
- `backend/docs/API.md` - Human-readable markdown
- `backend/docs/CHANGELOG.md` - API changes log (append)

### 6. Validate OpenAPI Spec

Run validation:
```bash
cd backend
python -c "import json; json.load(open('docs/openapi.json'))" && echo "✓ Valid JSON"
```

## Output Format

```
📚 API Documentation Generated
==============================

✅ Analyzed 8 route files
✅ Documented 23 endpoints
✅ Generated OpenAPI 3.0 spec
✅ Created Markdown docs

Files created:
- backend/docs/openapi.json (12.4 KB)
- backend/docs/API.md (45.2 KB)

Preview:
https://editor.swagger.io/?url=/path/to/openapi.json

Next steps:
1. Review generated docs
2. Add examples if needed
3. Commit to repository
4. Deploy to docs site
```

## Special Handling

### For HuntZen Routes:

**Jobs API** (`backend/src/api/routes/jobs.py`):
- Document the AI search flow
- Include provider information (Adzuna, JSearch, RemoteOK)
- Show deduplication logic
- Rate limiting details

**Coach API** (`backend/src/api/routes/coach.py`):
- Document LangGraph conversation flow
- Session management
- Streaming responses
- Context retention

**CV APIs** (`backend/src/api/routes/cv.py`):
- Document PDF parsing
- ATS scoring
- Tailor CV flow
- File upload specs

**Webhook API** (`backend/src/api/routes/webhooks.py`):
- Document Stripe webhook signature validation
- Event types handled
- Idempotency keys
- Error handling

## Best Practices

1. **Run after route changes**: Keep docs in sync
2. **Include in CI/CD**: Auto-generate on deploy
3. **Version docs**: Track API changes over time
4. **Add examples**: Real-world request/response pairs
5. **Document errors**: Common error responses

## Integration with Swagger UI

The generated OpenAPI spec can be used with Swagger UI:

```python
# In backend/src/main.py
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    with open("docs/openapi.json") as f:
        return json.load(f)

app.openapi = custom_openapi
```

## Related Skills

- `/deploy-check` - Pre-deployment validation
- `/commit` - Commit with proper message
- `/security-check` - API security audit
