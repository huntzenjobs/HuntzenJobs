-- Contact Finder Cache
-- Stores contact search results for 30 days to save API quotas
-- (Apollo 50/month, Hunter 25/month, SerpAPI 100/month on free plans)

CREATE TABLE IF NOT EXISTS contact_finder_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_normalized TEXT NOT NULL,
    city_normalized TEXT NOT NULL DEFAULT '',
    response_data JSONB NOT NULL,
    sources_used TEXT[] NOT NULL DEFAULT '{}',
    total_found INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',

    UNIQUE(company_normalized, city_normalized)
);

CREATE INDEX IF NOT EXISTS idx_contact_finder_cache_lookup
    ON contact_finder_cache(company_normalized, city_normalized)
    WHERE expires_at > NOW();

ALTER TABLE contact_finder_cache ENABLE ROW LEVEL SECURITY;

-- No RLS policy: access via service_role only (backend)
