"""
URL Validator Utilities
========================
Detects job URLs that point to search result pages instead of specific job postings.
Also provides heuristics for detecting truncated job descriptions.
"""

import re

# Patterns that indicate a URL is a search results page, not a specific job post
_SEARCH_PAGE_PATTERNS = [
    # LinkedIn search pages (vs direct job: linkedin.com/jobs/view/123456)
    r"linkedin\.com/jobs/search",
    r"linkedin\.com/search/",
    r"linkedin\.com/jobs\?",
    # Indeed search pages (vs direct job: indeed.com/viewjob?jk=...)
    r"indeed\.com/jobs\?",
    r"indeed\.com/q-",
    r"indeed\.com/l-",
    r"indeed\.com/#",
    # Glassdoor search pages
    r"glassdoor\.com/Job/jobs\.htm",
    r"glassdoor\.com/job-listing/jobs\.htm",
    # Monster search pages
    r"monster\.com/jobs/search",
    r"monster\.com/jobs\?",
    # Google/Bing job search
    r"google\.com/search\?",
    r"google\.com/about/careers/applications/jobs/",
    r"bing\.com/jobs",
    # ZipRecruiter search pages
    r"ziprecruiter\.com/jobs/search",
    r"ziprecruiter\.com/candidate/search",
    # General patterns for search result pages
    r"\?keywords=",
    r"\?q=.*&location=",
    r"/jobs-search\?",
    r"/emploi/recherche\?",
]

# Minimum length thresholds below which a description is likely truncated, per source
_TRUNCATION_THRESHOLDS = {
    "adzuna": 400,      # Adzuna API free tier returns ~500 chars max
    "serpapi": 300,     # SerpAPI Google Jobs often truncates
    "google_jobs": 300,
    "jsearch": 200,     # JSearch passes up to 5000 but may return less for some
    "default": 150,
}


def is_direct_job_url(url: str | None) -> bool:
    """
    Returns True if the URL points to a specific job posting.
    Returns False if it looks like a search results page.

    Args:
        url: The job URL to check

    Returns:
        True = direct job post, False = search/aggregator page
    """
    if not url:
        return False

    url_lower = url.lower()

    for pattern in _SEARCH_PAGE_PATTERNS:
        if re.search(pattern, url_lower):
            return False

    return True


def is_description_truncated(description: str | None, source: str) -> bool:
    """
    Heuristic to detect if a job description is likely truncated.

    Uses source-specific length thresholds since each API has different limits.
    Also checks for common truncation indicators (trailing "...", mid-sentence cut).

    Args:
        description: The job description text
        source: The API source name (adzuna, jsearch, etc.)

    Returns:
        True if the description is likely incomplete
    """
    if not description:
        return True

    text = description.strip()
    threshold = _TRUNCATION_THRESHOLDS.get(source, _TRUNCATION_THRESHOLDS["default"])

    # Short description for this source
    if len(text) < threshold:
        return True

    # Common truncation indicators
    if text.endswith("...") or text.endswith("…"):
        return True

    # Mid-sentence cut (ends without punctuation, but not a normal sentence ending)
    last_char = text[-1] if text else ""
    if len(text) < 600 and last_char not in {".", "!", "?", ":", ";", "\n"}:
        return True

    return False
