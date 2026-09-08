-- Conserve une limite stricte même si un appel interne transmet NULL.

CREATE OR REPLACE FUNCTION public.search_expat_chunks_lexical(
    p_query text,
    p_country text DEFAULT '',
    p_visa_type text DEFAULT '',
    p_match_count integer DEFAULT 6
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    content text,
    source_url text,
    country text,
    visa_type text,
    scraped_at timestamptz,
    similarity double precision
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH search AS (
        SELECT websearch_to_tsquery('simple', nullif(trim(p_query), '')) AS query
    )
    SELECT
        chunk.id,
        chunk.document_id,
        chunk.content,
        chunk.source_url,
        chunk.country,
        chunk.visa_type,
        chunk.scraped_at,
        ts_rank_cd(
            to_tsvector('simple', chunk.content),
            search.query
        )::double precision AS similarity
    FROM public.expat_chunks AS chunk
    CROSS JOIN search
    WHERE search.query IS NOT NULL
      AND (p_country = '' OR chunk.country = p_country)
      AND (p_visa_type = '' OR chunk.visa_type = p_visa_type)
      AND to_tsvector('simple', chunk.content) @@ search.query
    ORDER BY
        ts_rank_cd(to_tsvector('simple', chunk.content), search.query) DESC,
        chunk.scraped_at DESC NULLS LAST,
        chunk.id
    LIMIT least(greatest(coalesce(p_match_count, 6), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_expat_chunks_lexical(text, text, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_expat_chunks_lexical(text, text, text, integer)
    TO service_role;
