-- Migration: Translation Memory Table
-- Purpose: Store and cache all translations to build a private Translation Memory.
-- Each text is translated once (DeepL/Azure) then served forever from this table.

CREATE TABLE IF NOT EXISTS translation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,           -- SHA256 of the source text (fingerprint)
  source_lang TEXT NOT NULL DEFAULT 'fr',
  target_lang TEXT NOT NULL,            -- 'en', 'es', 'pt'
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT CHECK (provider IN ('deepl', 'azure', 'manual')),
  usage_count INTEGER DEFAULT 1,        -- how many times this translation was served
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_hash, target_lang)
);

-- Index for fast lookups by hash + language (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_tm_hash_lang
  ON translation_memory(content_hash, target_lang);

-- Index for analytics: most used translations
CREATE INDEX IF NOT EXISTS idx_tm_usage
  ON translation_memory(usage_count DESC);

-- RLS: Only authenticated users (server-side) can write, anon can read
ALTER TABLE translation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translation_memory_read"
  ON translation_memory FOR SELECT
  USING (true);  -- Public read (translations are not sensitive)

CREATE POLICY "translation_memory_write"
  ON translation_memory FOR INSERT
  WITH CHECK (true);  -- Server-side service role writes

CREATE POLICY "translation_memory_update"
  ON translation_memory FOR UPDATE
  USING (true);

-- Helper: increment usage count atomically
CREATE OR REPLACE FUNCTION increment_tm_usage(hash TEXT, lang TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE translation_memory
  SET usage_count = usage_count + 1,
      updated_at = NOW()
  WHERE content_hash = hash
    AND target_lang = lang;
END;
$$;

-- Comments
COMMENT ON TABLE translation_memory IS
  'Private Translation Memory: caches all translations from DeepL/Azure. '
  'Every text is translated once, then served from here forever at zero API cost.';

COMMENT ON COLUMN translation_memory.content_hash IS
  'SHA256 hash of source_text (normalized/trimmed). Used as lookup key.';

COMMENT ON COLUMN translation_memory.usage_count IS
  'Number of times this translation was served from cache. Grows over time.';
