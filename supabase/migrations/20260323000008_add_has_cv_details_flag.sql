-- Add has_cv_details feature flag to subscription_plans
-- Free plan: false (blurred results → conversion teaser)
-- Paid plans: true (full access to CV analysis details)

-- Free plan → false
UPDATE subscription_plans
SET feature_flags = feature_flags || '{"has_cv_details": false}'::jsonb
WHERE name = 'free';

-- Starter → true
UPDATE subscription_plans
SET feature_flags = feature_flags || '{"has_cv_details": true}'::jsonb
WHERE name = 'starter';

-- Pro → true
UPDATE subscription_plans
SET feature_flags = feature_flags || '{"has_cv_details": true}'::jsonb
WHERE name = 'pro';

-- Premium → true
UPDATE subscription_plans
SET feature_flags = feature_flags || '{"has_cv_details": true}'::jsonb
WHERE name = 'premium';
