"""
Tests for JobScoutAgent
========================
Validates query refinement and job ranking logic.
"""

import pytest


@pytest.mark.asyncio
async def test_scout_query_refinement_fr(job_scout):
    """Test if the scout correctly refines a French query with typos."""
    raw_query = "ingenieur de donnée lyon"
    result = await job_scout.refine_query(raw_query)

    assert "corrected_query" in result
    # Should correct "ingenieur de donnée" to "Ingénieur de données" or "Data Engineer"
    assert "Data" in result["corrected_query"] or "données" in result["corrected_query"].lower()
    assert "Lyon" in result["detected_location"]

@pytest.mark.asyncio
async def test_scout_market_analysis(job_scout):
    """Test market analysis for a specific role and country."""
    result = await job_scout.analyze_market(role="Software Engineer", location="Berlin", country_code="de")

    assert "market_summary" in result
    assert "avg_salary_range" in result
    assert result["demand_level"] in ["high", "medium", "low"]
