-- Les quotas runtime lisent les clés *_per_day. Les anciennes générations de
-- l'admin ont conservé plusieurs alias contradictoires dans le même JSONB.
-- La valeur canonique existante reste toujours prioritaire.
UPDATE public.subscription_plans
SET
  limits = (
    limits - ARRAY[
      'ats_scores',
      'cv_analyses_per_day',
      'cv_analyses',
      'assistant_messages',
      'job_searches',
      'cv_adapts',
      'cv_adapt',
      'cover_letters',
      'cover_letter',
      'max_saved_jobs',
      'saved_jobs',
      'recruiter_searches',
      'matching_scores',
      'custom_cvs'
    ]::TEXT[]
  ) || jsonb_strip_nulls(jsonb_build_object(
    'ats_scores_per_day', COALESCE(
      limits -> 'ats_scores_per_day',
      limits -> 'ats_scores',
      limits -> 'cv_analyses_per_day',
      limits -> 'cv_analyses'
    ),
    'assistant_messages_per_day', COALESCE(
      limits -> 'assistant_messages_per_day',
      limits -> 'assistant_messages'
    ),
    'job_searches_per_day', COALESCE(
      limits -> 'job_searches_per_day',
      limits -> 'job_searches'
    ),
    'cv_adapt_per_day', COALESCE(
      limits -> 'cv_adapt_per_day',
      limits -> 'cv_adapts',
      limits -> 'cv_adapt'
    ),
    'cover_letter_per_day', COALESCE(
      limits -> 'cover_letter_per_day',
      limits -> 'cover_letters',
      limits -> 'cover_letter'
    ),
    'saved_jobs_per_day', COALESCE(
      limits -> 'saved_jobs_per_day',
      limits -> 'saved_jobs',
      limits -> 'max_saved_jobs'
    ),
    'recruiter_searches_per_day', COALESCE(
      limits -> 'recruiter_searches_per_day',
      limits -> 'recruiter_searches'
    ),
    'matching_scores_per_day', COALESCE(
      limits -> 'matching_scores_per_day',
      limits -> 'matching_scores'
    ),
    'custom_cvs_per_day', COALESCE(
      limits -> 'custom_cvs_per_day',
      limits -> 'custom_cvs'
    )
  )),
  updated_at = NOW()
WHERE limits IS NOT NULL;

-- Les limites personnalisées utilisaient aussi le suffixe *_daily, jamais lu
-- par get_quota_status(). On normalise sans créer de limite absente.
UPDATE public.user_subscriptions
SET custom_limits = (
  custom_limits - ARRAY[
    'cv_analyses_daily',
    'cv_analyses',
    'assistant_messages_daily',
    'assistant_messages',
    'job_searches_daily',
    'job_searches'
  ]::TEXT[]
) || jsonb_strip_nulls(jsonb_build_object(
  'ats_scores_per_day', COALESCE(
    custom_limits -> 'ats_scores_per_day',
    custom_limits -> 'cv_analyses_daily',
    custom_limits -> 'cv_analyses'
  ),
  'assistant_messages_per_day', COALESCE(
    custom_limits -> 'assistant_messages_per_day',
    custom_limits -> 'assistant_messages_daily',
    custom_limits -> 'assistant_messages'
  ),
  'job_searches_per_day', COALESCE(
    custom_limits -> 'job_searches_per_day',
    custom_limits -> 'job_searches_daily',
    custom_limits -> 'job_searches'
  )
))
WHERE custom_limits IS NOT NULL
  AND custom_limits <> '{}'::JSONB;
