# Contributing to HuntZen

Thank you for your interest in contributing to HuntZen! This document provides guidelines and instructions for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We expect all contributors to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

---

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/HuntzenJobs.git
cd huntzen_jobsearch

# Add upstream remote
git remote add upstream https://github.com/huntzenjobs/HuntzenJobs.git
```

### 2. Set Up Development Environment

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies with dev tools
pip install -e ".[dev]"
# Or with UV:
uv pip install -e ".[dev]"

# Install pre-commit hooks
pre-commit install
```

#### Frontend Setup

```bash
cd frontend-next

# Install dependencies
npm install

# Copy environment template
cp ../.env.example ../.env
# Edit .env and add test API keys
```

### 3. Create Feature Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# Or for bug fixes:
git checkout -b fix/bug-description
```

---

## Development Workflow

### 1. Make Changes

- Write clean, readable code following our [coding standards](#coding-standards)
- Add tests for new functionality
- Update documentation if needed

### 2. Test Locally

#### Backend Tests

```bash
cd backend

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_agents.py -v

# Run with coverage
pytest --cov=src --cov-report=html
```

#### Frontend Tests

```bash
cd frontend-next

# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build
```

### 3. Commit Changes

Follow our [commit guidelines](#commit-guidelines):

```bash
git add .
git commit -m "feat: add amazing new feature"
```

### 4. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

---

## Project Structure

### Backend Architecture

```
backend/src/
├── agents/              # LangChain AI Agents
│   ├── base.py          # Base classes (BaseAgent, SubAgent, BaseTool)
│   ├── coach/           # Career Coach agent + sub-agents
│   ├── job_scout/       # Job Scout agent + sub-agents
│   └── cv_analyzer/     # CV Analyzer agent + sub-agents
│
├── api/                 # FastAPI Routes
│   ├── routes/          # API endpoints
│   │   ├── coach.py
│   │   ├── jobs.py
│   │   └── cv.py
│   ├── middleware.py    # Rate limiting, CORS, security
│   └── deps.py          # Dependency injection
│
├── services/            # External Services
│   ├── job_providers/   # Job search APIs
│   │   ├── adzuna.py
│   │   ├── serpapi.py
│   │   └── aggregator.py
│   ├── pdf/             # CV parsing (IBM Docling)
│   └── events/          # Tech events scraper
│
├── models/              # Pydantic Schemas
│   └── schemas.py       # Request/Response models
│
├── config/              # Configuration
│   └── settings.py      # Pydantic Settings
│
├── utils/               # Utilities
│   └── helpers.py       # Helper functions
│
└── main.py              # FastAPI app entry point
```

### Frontend Architecture

```
frontend-next/src/
├── app/                 # Next.js 15 App Router
│   ├── (auth)/          # Auth pages (login, signup)
│   ├── (dashboard)/     # Protected pages
│   │   ├── jobs/
│   │   ├── cv/
│   │   └── coach/
│   └── api/             # API routes, webhooks
│
├── components/          # React Components
│   ├── ui/              # shadcn/ui base components
│   ├── cv/              # CV analyzer wizard
│   ├── jobs/            # Job search & listings
│   └── coach/           # Career coach chat
│
├── lib/                 # Libraries & Utils
│   ├── security/        # Rate limiting, anomaly detection
│   ├── hooks/           # Custom React hooks
│   └── utils/           # Helper functions
│
└── types/               # TypeScript definitions
```

---

## Coding Standards

### Python (Backend)

#### Style Guide

- **Formatter**: Ruff (configured in `pyproject.toml`)
- **Line length**: 100 characters
- **Imports**: Sorted with isort (via Ruff)
- **Type hints**: Required for all functions

#### Example:

```python
from typing import Optional

from pydantic import BaseModel

from src.config.settings import settings


class JobSearchRequest(BaseModel):
    """Job search request model."""

    query: str
    location: Optional[str] = None
    max_results: int = 25


async def search_jobs(request: JobSearchRequest) -> list[dict]:
    """
    Search for jobs across multiple providers.

    Args:
        request: Job search parameters

    Returns:
        List of job listings

    Raises:
        ValueError: If query is empty
    """
    if not request.query.strip():
        raise ValueError("Query cannot be empty")

    # Implementation...
    return []
```

#### Docstrings

Use Google-style docstrings:

```python
def function_name(param1: str, param2: int) -> bool:
    """
    Short description (one line).

    Longer description if needed (multiple lines).

    Args:
        param1: Description of param1
        param2: Description of param2

    Returns:
        Description of return value

    Raises:
        ValueError: When param1 is invalid
    """
```

#### Async/Await

- Use `async`/`await` for I/O operations
- Prefer `httpx.AsyncClient` over `requests`
- Use `asyncio.gather()` for parallel operations

```python
async def fetch_jobs():
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()
```

### TypeScript (Frontend)

#### Style Guide

- **Formatter**: Prettier (configured in `.prettierrc`)
- **Line length**: 100 characters
- **Quotes**: Single quotes
- **Semicolons**: Required

#### Example:

```typescript
interface JobSearchParams {
  query: string;
  location?: string;
  maxResults?: number;
}

export async function searchJobs(params: JobSearchParams): Promise<Job[]> {
  const response = await fetch('/api/jobs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error('Failed to search jobs');
  }

  return response.json();
}
```

#### React Components

Use functional components with TypeScript:

```typescript
interface JobCardProps {
  job: Job;
  onSave?: (jobId: string) => void;
}

export function JobCard({ job, onSave }: JobCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{job.title}</h3>
      <p className="text-sm text-muted-foreground">{job.company}</p>
      {onSave && (
        <button onClick={() => onSave(job.id)}>Save</button>
      )}
    </div>
  );
}
```

---

## Testing Requirements

### Backend Testing

#### Unit Tests

All new features must include unit tests:

```python
# tests/test_job_search.py
import pytest

from src.services.job_providers.aggregator import JobAggregator


@pytest.mark.asyncio
async def test_search_jobs_success():
    """Test successful job search."""
    aggregator = JobAggregator()
    results = await aggregator.search(query="Python developer")

    assert len(results) > 0
    assert results[0]["title"] is not None


@pytest.mark.asyncio
async def test_search_jobs_empty_query():
    """Test job search with empty query."""
    aggregator = JobAggregator()

    with pytest.raises(ValueError, match="Query cannot be empty"):
        await aggregator.search(query="")
```

#### Test Coverage

- Maintain **minimum 80% coverage**
- Run: `pytest --cov=src --cov-report=html`
- View report: `open htmlcov/index.html`

### Frontend Testing

#### Component Tests

Use Testing Library:

```typescript
// __tests__/components/JobCard.test.tsx
import { render, screen } from '@testing-library/react';
import { JobCard } from '@/components/jobs/JobCard';

describe('JobCard', () => {
  it('renders job title and company', () => {
    const job = {
      id: '1',
      title: 'Software Engineer',
      company: 'Tech Corp',
    };

    render(<JobCard job={job} />);

    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Tech Corp')).toBeInTheDocument();
  });
});
```

#### E2E Tests

Use Playwright for critical flows:

```typescript
// e2e/job-search.spec.ts
import { test, expect } from '@playwright/test';

test('user can search for jobs', async ({ page }) => {
  await page.goto('/jobs');

  await page.fill('[name="query"]', 'Python developer');
  await page.click('button[type="submit"]');

  await expect(page.locator('.job-card')).toHaveCount.greaterThan(0);
});
```

---

## Commit Guidelines

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no code change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

#### Examples

```bash
# Feature
git commit -m "feat(jobs): add salary range filter"

# Bug fix
git commit -m "fix(cv): resolve PDF parsing error for large files"

# Documentation
git commit -m "docs: update API documentation for coach endpoints"

# Refactor
git commit -m "refactor(agents): simplify BaseAgent initialization"
```

#### Multi-line commits

```bash
git commit -m "feat(coach): add interview simulator

Integrate ElevenLabs AI for voice-based interview practice.
Supports multiple interview types and languages.

Closes #42"
```

---

## Pull Request Process

### 1. Pre-PR Checklist

Before creating a PR, ensure:

- [ ] Code follows style guidelines
- [ ] All tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated if needed
- [ ] Commit messages follow convention
- [ ] Branch is up-to-date with `main`

### 2. Create Pull Request

Use this PR template:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where needed
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally

## Screenshots (if applicable)
Add screenshots for UI changes

## Related Issues
Closes #(issue number)
```

### 3. Review Process

1. **Automated Checks**: CI/CD pipeline runs tests
2. **Code Review**: Maintainers review your code
3. **Feedback**: Address review comments
4. **Approval**: At least 1 approval required
5. **Merge**: Squash and merge to `main`

### 4. After Merge

- Delete your feature branch
- Update your local repository:
  ```bash
  git checkout main
  git pull upstream main
  ```

---

## Issue Reporting

### Bug Reports

Use the bug report template:

```markdown
**Describe the bug**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen

**Screenshots**
If applicable

**Environment**
- OS: [e.g., macOS, Windows, Linux]
- Browser: [e.g., Chrome, Safari]
- Version: [e.g., 1.0.0]

**Additional context**
Any other information
```

### Feature Requests

Use the feature request template:

```markdown
**Is your feature request related to a problem?**
Description of the problem

**Describe the solution you'd like**
Clear description of what you want

**Describe alternatives you've considered**
Alternative solutions

**Additional context**
Any other information
```

---

## Areas to Contribute

### High Priority

- **Bug Fixes**: Check [bug reports](https://github.com/huntzenjobs/HuntzenJobs/labels/bug)
- **Documentation**: Improve guides and API docs
- **Tests**: Increase test coverage
- **Accessibility**: Improve WCAG compliance

### Feature Ideas

- **Internationalization**: Add new language support
- **Integrations**: Add new job provider APIs
- **UI/UX**: Enhance user interface
- **AI Prompts**: Improve agent prompts

---

## Questions?

- **GitHub Discussions**: [Ask questions](https://github.com/huntzenjobs/HuntzenJobs/discussions)
- **Discord** (coming soon)
- **Email**: dev@huntzen.ai

---

## Recognition

Contributors will be:
- Listed in our [Contributors](https://github.com/huntzenjobs/HuntzenJobs/graphs/contributors) page
- Mentioned in release notes for significant contributions
- Invited to join our contributor community

Thank you for making HuntZen better.
