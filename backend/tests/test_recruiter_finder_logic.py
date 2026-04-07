import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta, timezone

from src.services.recruiter_finder.serpapi import (
    generate_company_slug,
    _get_cached_recruiters,
    _save_to_cache
)
from src.services.recruiter_finder.fresh_linkedin import FreshLinkedInProfileValidator

# ============================================================================
# Logic Tests: Smart Match & Slugs
# ============================================================================

def test_generate_company_slug():
    """Verify that company names are normalized correctly into slugs."""
    assert generate_company_slug("McDonald's France") == "mcdonaldsfrance"
    assert generate_company_slug("GE Healthcare") == "gehealthcare"
    assert generate_company_slug("SNCF (Gares & Connexions)") == "sncfgaresconnexions"
    assert generate_company_slug("") == ""

def test_company_matches_smart_logic():
    """Verify that the smart match handles 'Group vs Sub-brand' correctly."""
    validator = FreshLinkedInProfileValidator()
    
    # Case: Pierre Streiff vs Groupe STREIFF (The one we fixed!)
    assert validator._company_matches("PIERRE STREIFF", "Groupe STREIFF") is True
    
    # Case: Direct containment
    assert validator._company_matches("Mcdonald's", "McDonald's France") is True
    
    # Case: Distinctive long token (> 6 chars)
    assert validator._company_matches("Dassault", "Dassault Aviation") is True
    
    # Case: Mismatch (Too different)
    assert validator._company_matches("Apple", "Microsoft") is False
    assert validator._company_matches("Jean Marc", "Jean Dupont") is False # Jean is too short (< 6)

# ============================================================================
# Cache Logic Tests (Mocked)
# ============================================================================

@pytest.mark.asyncio
async def test_get_cached_recruiters_hit():
    """Verify cache recruitment when not expired."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "company_slug": "mcdonalds",
            "recruiters": [{"name": "Admin Test"}],
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "strategy_summary": "Test strategy"
        }
    ]
    
    with patch("src.services.recruiter_finder.serpapi.get_supabase_client", return_value=mock_supabase):
        result = await _get_cached_recruiters("mcdonalds")
        assert result is not None
        assert result["recruiters"][0]["name"] == "Admin Test"
        assert result["source"] == "cache"

@pytest.mark.asyncio
async def test_get_cached_recruiters_expired():
    """Verify cache returns None if expired."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "company_slug": "mcdonalds",
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        }
    ]
    
    with patch("src.services.recruiter_finder.serpapi.get_supabase_client", return_value=mock_supabase):
        result = await _get_cached_recruiters("mcdonalds")
        assert result is None
