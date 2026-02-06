-- ============================================================================
-- SPRINT 5: Test Queries
-- Verify that the coach_conversations table works correctly
-- ============================================================================

-- 1. Check table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coach_conversations'
ORDER BY ordinal_position;

-- 2. Check indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'coach_conversations'
ORDER BY indexname;

-- 3. Check RLS policies
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'coach_conversations'
ORDER BY policyname;

-- 4. Check triggers
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'coach_conversations';

-- 5. Test INSERT with trigger (replace user_id with your actual user UUID)
-- Note: This will fail if not run as authenticated user due to RLS
-- For testing, temporarily disable RLS: ALTER TABLE coach_conversations DISABLE ROW LEVEL SECURITY;

/*
INSERT INTO public.coach_conversations (
  user_id,
  session_id,
  messages,
  context,
  title,
  is_favorite
) VALUES (
  '00000000-0000-0000-0000-000000000000', -- Replace with real user_id
  'test_session_123',
  '[
    {"id": "msg_1", "role": "user", "content": "Bonjour, je cherche un poste de développeur", "timestamp": "2026-01-27T12:00:00Z"},
    {"id": "msg_2", "role": "assistant", "content": "Bonjour ! Je serais ravi de vous aider dans votre recherche.", "timestamp": "2026-01-27T12:00:05Z"}
  ]'::jsonb,
  '{"jobTitle": "Développeur Full Stack", "topics": ["job_search"]}'::jsonb,
  'Recherche développeur Full Stack',
  false
)
RETURNING *;
*/

-- 6. Verify computed columns work
/*
SELECT
  id,
  title,
  is_favorite,
  message_count, -- Should be 2
  last_message_at, -- Should be 2026-01-27T12:00:05Z
  created_at,
  updated_at
FROM public.coach_conversations
WHERE session_id = 'test_session_123';
*/

-- 7. Test UPDATE trigger
/*
UPDATE public.coach_conversations
SET messages = messages || '{"id": "msg_3", "role": "user", "content": "Merci !", "timestamp": "2026-01-27T12:01:00Z"}'::jsonb
WHERE session_id = 'test_session_123'
RETURNING
  message_count, -- Should be 3
  last_message_at, -- Should be 2026-01-27T12:01:00Z
  updated_at; -- Should be now()
*/

-- 8. Test favorite toggle
/*
UPDATE public.coach_conversations
SET is_favorite = NOT is_favorite
WHERE session_id = 'test_session_123'
RETURNING is_favorite;
*/

-- 9. Test full-text search on titles
/*
SELECT
  id,
  title,
  message_count,
  to_tsvector('french', COALESCE(title, '')) AS title_vector
FROM public.coach_conversations
WHERE to_tsvector('french', COALESCE(title, '')) @@ to_tsquery('french', 'développeur')
ORDER BY last_message_at DESC;
*/

-- 10. Cleanup test data
/*
DELETE FROM public.coach_conversations
WHERE session_id = 'test_session_123';
*/

-- ============================================================================
-- Expected Results:
-- 1. Table has 11 columns: id, user_id, session_id, messages, context, title, is_favorite, message_count, last_message_at, created_at, updated_at
-- 2. 5 indexes: PK, user_id, session_id, title (GIN), is_favorite, last_message_at
-- 3. 4 RLS policies: SELECT, INSERT, UPDATE, DELETE
-- 4. 1 trigger: update_coach_conversations_metadata
-- 5-8. All CRUD operations work correctly with auto-computed values
-- 9. Full-text search works with French stemming
-- ============================================================================
