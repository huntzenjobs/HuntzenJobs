BEGIN;

-- Ces policies historiques ciblaient implicitement PUBLIC. Leur expression
-- auth.uid() refusait aujourd'hui anon, mais un grant aussi large est inutile
-- et fragile. Les policies équivalentes TO authenticated restent en place.
DROP POLICY IF EXISTS "Users can upload their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own CVs" ON storage.objects;

COMMIT;
