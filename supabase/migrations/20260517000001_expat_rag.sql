-- ============================================================
-- Migration : RAG Expadation — pgvector document store
-- Date      : 2026-05-17
-- Sprint    : 2 — Data Layer Agent Expadation
-- ============================================================

-- Extension pgvector (requise pour les embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- Table : expat_documents
-- Source canonique de chaque URL scrapée (1 ligne = 1 URL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expat_documents (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url     text        UNIQUE NOT NULL,
    country        text        NOT NULL,           -- FR | CA | DE
    visa_type      text        NOT NULL DEFAULT '',
    language       text        NOT NULL DEFAULT 'fr',
    title          text        NOT NULL DEFAULT '',
    raw_markdown   text        NOT NULL DEFAULT '',
    content_hash   text        NOT NULL,           -- sha256 du markdown
    scraped_at     timestamptz NOT NULL DEFAULT now(),
    is_stale       boolean     NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Index pour filtres par pays
CREATE INDEX IF NOT EXISTS expat_documents_country_idx ON expat_documents (country);

-- ------------------------------------------------------------
-- Table : expat_chunks
-- Morceaux du document avec embedding pgvector
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expat_chunks (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   uuid        NOT NULL REFERENCES expat_documents (id) ON DELETE CASCADE,
    chunk_index   int         NOT NULL,
    content       text        NOT NULL,
    embedding     vector(1024),
    -- Métadonnées dénormalisées (évite les jointures au moment de la recherche)
    source_url    text,
    country       text,
    visa_type     text,
    language      text,
    scraped_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index ivfflat pour la recherche ANN par cosinus
CREATE INDEX IF NOT EXISTS expat_chunks_embedding_idx
    ON expat_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Index composite pour filtres pays/visa_type
CREATE INDEX IF NOT EXISTS expat_chunks_country_visa_idx
    ON expat_chunks (country, visa_type);

-- ------------------------------------------------------------
-- RLS — Lecture bloquée pour anon / authenticated
-- Seul le service_role (backend) accède à ces tables
-- ------------------------------------------------------------
ALTER TABLE expat_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE expat_chunks    ENABLE ROW LEVEL SECURITY;

-- Aucune politique permissive → anon et authenticated ne voient rien
-- Le service_role contourne toujours le RLS (comportement Supabase natif)

-- ------------------------------------------------------------
-- Fonction RPC : match_expat_chunks
-- Recherche sémantique par cosinus, filtrée par pays/visa_type
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_expat_chunks(
    query_embedding vector(1024),
    p_country       text    DEFAULT '',
    p_visa_type     text    DEFAULT '',
    match_count     int     DEFAULT 5
)
RETURNS TABLE (
    id          uuid,
    document_id uuid,
    content     text,
    source_url  text,
    country     text,
    visa_type   text,
    scraped_at  timestamptz,
    similarity  float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id,
        c.document_id,
        c.content,
        c.source_url,
        c.country,
        c.visa_type,
        c.scraped_at,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM expat_chunks c
    WHERE
        (p_country  = '' OR c.country    = p_country)
        AND (p_visa_type = '' OR c.visa_type = p_visa_type)
        AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
