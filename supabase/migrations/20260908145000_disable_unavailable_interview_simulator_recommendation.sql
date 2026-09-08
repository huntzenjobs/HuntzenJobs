-- Le simulateur d'entretien n'est pas encore accessible dans l'interface.
-- Le coach doit accompagner l'utilisateur directement sans créer d'impasse UX.
UPDATE public.ai_prompts
SET content = replace(
  content,
  '- If the user asks for interview prep -> Recommend the HuntZen Interview Simulator.',
  '- If the user asks for interview prep -> Help directly in the conversation with questions, rehearsal and feedback. Do not claim that the Interview Simulator is available; it is not currently accessible to users.'
)
WHERE name = 'coach_main'
  AND content LIKE '%Recommend the HuntZen Interview Simulator%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ai_prompts
    WHERE name = 'coach_main'
      AND content LIKE '%Recommend the HuntZen Interview Simulator%'
  ) THEN
    RAISE EXCEPTION 'coach_main still recommends the unavailable Interview Simulator';
  END IF;
END
$$;
