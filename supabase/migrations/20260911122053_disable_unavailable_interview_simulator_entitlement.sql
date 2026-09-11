-- Le simulateur d'entretien est indisponible. Aucun plan payant ne doit donc
-- l'accorder ni le présenter comme une fonctionnalité incluse ou exclue.
WITH translated_plans AS (
  SELECT
    plan.id,
    COALESCE(
      jsonb_object_agg(
        locale,
        jsonb_set(
          jsonb_set(
            translation,
            '{features}',
            COALESCE(
              (
                SELECT jsonb_agg(feature)
                FROM jsonb_array_elements(COALESCE(translation->'features', '[]'::jsonb)) AS feature
                WHERE feature #>> '{}' !~* '(interview|entretien|entrevista)'
              ),
              '[]'::jsonb
            ),
            true
          ),
          '{features_excluded}',
          COALESCE(
            (
              SELECT jsonb_agg(feature)
              FROM jsonb_array_elements(COALESCE(translation->'features_excluded', '[]'::jsonb)) AS feature
              WHERE feature #>> '{}' !~* '(interview|entretien|entrevista)'
            ),
            '[]'::jsonb
          ),
          true
        )
      ) FILTER (WHERE locale IS NOT NULL),
      plan.translations,
      '{}'::jsonb
    ) AS translations
  FROM public.subscription_plans AS plan
  LEFT JOIN LATERAL jsonb_each(COALESCE(plan.translations, '{}'::jsonb)) AS locale_data(locale, translation)
    ON true
  WHERE plan.name IN ('pro', 'premium')
  GROUP BY plan.id, plan.translations
)
UPDATE public.subscription_plans AS plan
SET
  feature_flags = jsonb_set(
    COALESCE(plan.feature_flags, '{}'::jsonb),
    '{has_interview_sim}',
    'false'::jsonb,
    true
  ),
  features = COALESCE(
    (
      SELECT jsonb_agg(feature)
      FROM jsonb_array_elements(COALESCE(plan.features, '[]'::jsonb)) AS feature
      WHERE feature #>> '{}' !~* '(interview|entretien|entrevista)'
    ),
    '[]'::jsonb
  ),
  features_excluded = COALESCE(
    (
      SELECT jsonb_agg(feature)
      FROM jsonb_array_elements(COALESCE(plan.features_excluded, '[]'::jsonb)) AS feature
      WHERE feature #>> '{}' !~* '(interview|entretien|entrevista)'
    ),
    '[]'::jsonb
  ),
  translations = COALESCE(translated_plans.translations, plan.translations),
  updated_at = NOW()
FROM translated_plans
WHERE plan.id = translated_plans.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.subscription_plans
    WHERE name IN ('pro', 'premium')
      AND COALESCE(feature_flags->>'has_interview_sim', 'false') <> 'false'
  ) THEN
    RAISE EXCEPTION 'paid plans still grant the unavailable interview simulator';
  END IF;
END
$$;
