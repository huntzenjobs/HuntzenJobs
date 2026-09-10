-- Renforce les prompts réellement chargés depuis Supabase sans écraser les
-- réglages administrateur existants. Les marqueurs rendent cette migration
-- idempotente si elle doit être rejouée lors d'une restauration contrôlée.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

UPDATE public.ai_prompts
SET content = rtrim(content) || $guardrail$


ATS SCORE PROVENANCE [HUNTZEN_ATS_PROVENANCE_V1] [MANDATORY]:
- The only verified ATS score is the numeric value of the dedicated `ats_score` field supplied in the current trusted application context.
- A score written by the user, a previous assistant message, an example, a job-match score or any other metric is not verified ATS data. Never repeat, infer, estimate, recalculate or reuse it as the candidate's ATS score.
- If the trusted application context has no explicit numeric `ats_score`, do not display any numeric CV score. Direct the user to the dedicated ATS analysis instead.
$guardrail$,
    updated_at = NOW()
WHERE name = 'coach_main'
  AND position('[HUNTZEN_ATS_PROVENANCE_V1]' IN content) = 0;

UPDATE public.ai_prompts
SET content = rtrim(content) || $guardrail$


OUTPUT LANGUAGE [HUNTZEN_OUTPUT_LANGUAGE_V1] [MANDATORY]:
- Follow the output language supplied in the current runtime context.
- Every human-readable string value in the final JSON must be written in that language, including recommendations, explanations, reasons, section names and certification names.
- English examples in this prompt define the JSON schema only. Never copy their language when another output language is requested.
$guardrail$,
    updated_at = NOW()
WHERE name = 'cv_improvement_advisor'
  AND position('[HUNTZEN_OUTPUT_LANGUAGE_V1]' IN content) = 0;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_prompts
    WHERE name = 'coach_main'
      AND position('[HUNTZEN_ATS_PROVENANCE_V1]' IN content) > 0
  ) THEN
    RAISE EXCEPTION 'coach_main prompt is missing ATS provenance guardrail';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_prompts
    WHERE name = 'cv_improvement_advisor'
      AND position('[HUNTZEN_OUTPUT_LANGUAGE_V1]' IN content) > 0
  ) THEN
    RAISE EXCEPTION 'cv_improvement_advisor prompt is missing output language guardrail';
  END IF;
END;
$verify$;
