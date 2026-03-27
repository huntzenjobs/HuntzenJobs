-- ========================================================================
-- USEFUL SQL QUERIES - Supabase Database Investigation
-- ========================================================================
-- Date: 2026-02-11
-- User: wissemkarboub@gmail.com (3abda780-30fb-46c8-a5c3-5bfa7938d688)
-- ========================================================================

-- ========================================================================
-- 1. USER SUBSCRIPTIONS
-- ========================================================================

-- Get active subscription for a user
SELECT
    us.id,
    us.status,
    us.current_period_start,
    us.current_period_end,
    us.stripe_subscription_id,
    sp.name AS plan_name,
    sp.display_name,
    sp.limits
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
  AND us.status = 'active'
ORDER BY us.created_at DESC
LIMIT 1;

-- Count subscriptions by status
SELECT
    status,
    COUNT(*) AS count
FROM user_subscriptions
GROUP BY status
ORDER BY count DESC;

-- Find canceled subscriptions older than 90 days (cleanup candidates)
SELECT
    us.id,
    us.user_id,
    us.status,
    us.canceled_at,
    sp.name AS plan_name,
    EXTRACT(DAY FROM NOW() - us.canceled_at) AS days_since_canceled
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'canceled'
  AND us.canceled_at < NOW() - INTERVAL '90 days'
ORDER BY us.canceled_at;

-- Find subscriptions with missing stripe_price_id (paid plans)
SELECT
    us.id,
    us.user_id,
    sp.name AS plan_name,
    us.stripe_subscription_id,
    us.stripe_price_id
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE sp.name != 'free'
  AND (us.stripe_price_id IS NULL OR us.stripe_price_id = '');

-- ========================================================================
-- 2. SUBSCRIPTION PLANS
-- ========================================================================

-- List all plans with limits
SELECT
    name,
    display_name,
    price_monthly,
    price_yearly,
    limits,
    is_active,
    sort_order
FROM subscription_plans
ORDER BY sort_order;

-- Get plan limits in readable format
SELECT
    name,
    display_name,
    limits->>'cv_analyses' AS cv_analyses_limit,
    limits->>'job_searches' AS job_searches_limit,
    limits->>'coach_seconds' AS coach_seconds_limit,
    limits->>'job_views' AS job_views_limit
FROM subscription_plans
ORDER BY sort_order;

-- Count active subscriptions per plan
SELECT
    sp.name AS plan_name,
    sp.display_name,
    COUNT(us.id) AS active_subscriptions
FROM subscription_plans sp
LEFT JOIN user_subscriptions us ON sp.id = us.plan_id AND us.status = 'active'
GROUP BY sp.id, sp.name, sp.display_name
ORDER BY active_subscriptions DESC;

-- ========================================================================
-- 3. USAGE QUOTAS
-- ========================================================================

-- Get current quotas for a user
SELECT
    user_id,
    quota_date,
    cv_analyses_used,
    job_searches_used,
    coach_seconds_used,
    job_views_used,
    last_reset_at,
    updated_at
FROM usage_quotas
WHERE user_id = '3abda780-30fb-46c8-a5c3-5bfa7938d688'
ORDER BY quota_date DESC
LIMIT 5;

-- Find users with quotas not reset in last 48h
SELECT
    uq.user_id,
    p.email,
    uq.quota_date,
    uq.last_reset_at,
    EXTRACT(HOUR FROM NOW() - uq.last_reset_at) AS hours_since_reset
FROM usage_quotas uq
JOIN profiles p ON uq.user_id = p.id
WHERE uq.last_reset_at < NOW() - INTERVAL '48 hours'
ORDER BY uq.last_reset_at;

-- Get usage summary for all users
SELECT
    COUNT(DISTINCT user_id) AS total_users,
    SUM(cv_analyses_used) AS total_cv_analyses,
    SUM(job_searches_used) AS total_job_searches,
    SUM(coach_seconds_used) AS total_coach_seconds
FROM usage_quotas
WHERE quota_date >= CURRENT_DATE - INTERVAL '30 days';

-- ========================================================================
-- 4. PROFILES
-- ========================================================================

-- Get user profile with subscription info
SELECT
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    us.status AS subscription_status,
    sp.name AS plan_name,
    us.current_period_end AS subscription_ends_at
FROM profiles p
LEFT JOIN user_subscriptions us ON p.id = us.user_id AND us.status = 'active'
LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE p.id = '3abda780-30fb-46c8-a5c3-5bfa7938d688';

-- Find profiles with deprecated subscription fields still set
SELECT
    id,
    email,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_tier
FROM profiles
WHERE
    stripe_customer_id IS NOT NULL
    OR stripe_subscription_id IS NOT NULL
    OR subscription_tier IS NOT NULL
LIMIT 50;

-- ========================================================================
-- 5. STRIPE WEBHOOK EVENTS
-- ========================================================================

-- Recent webhook events
SELECT
    id,
    stripe_event_id,
    event_type,
    processed_at,
    created_at,
    EXTRACT(SECOND FROM (processed_at - created_at)) AS processing_time_seconds
FROM stripe_webhook_events
ORDER BY created_at DESC
LIMIT 20;

-- Count events by type
SELECT
    event_type,
    COUNT(*) AS count,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS processed,
    COUNT(*) FILTER (WHERE processed_at IS NULL) AS unprocessed
FROM stripe_webhook_events
GROUP BY event_type
ORDER BY count DESC;

-- Find unprocessed webhook events (stuck)
SELECT
    id,
    stripe_event_id,
    event_type,
    created_at,
    EXTRACT(HOUR FROM NOW() - created_at) AS hours_since_received
FROM stripe_webhook_events
WHERE processed_at IS NULL
ORDER BY created_at;

-- Get webhook payload for a specific event
SELECT
    stripe_event_id,
    event_type,
    payload,
    processed_at
FROM stripe_webhook_events
WHERE stripe_event_id = 'evt_1SzRupF7q8KRoF9aTo5RImDA';

-- ========================================================================
-- 6. WEBHOOK FAILURES
-- ========================================================================

-- Recent webhook failures
SELECT
    id,
    stripe_event_id,
    event_type,
    error_message,
    retry_count,
    first_attempt_at,
    last_attempt_at,
    resolved,
    created_at
FROM webhook_failures
ORDER BY created_at DESC
LIMIT 10;

-- Count failures by error type
SELECT
    SUBSTRING(error_message, 1, 100) AS error_type,
    COUNT(*) AS count,
    MAX(created_at) AS last_occurrence
FROM webhook_failures
GROUP BY SUBSTRING(error_message, 1, 100)
ORDER BY count DESC;

-- Find unresolved failures (needs retry)
SELECT
    wf.id,
    wf.stripe_event_id,
    wf.event_type,
    wf.error_message,
    wf.retry_count,
    wf.last_attempt_at,
    EXTRACT(HOUR FROM NOW() - wf.last_attempt_at) AS hours_since_last_attempt
FROM webhook_failures wf
WHERE wf.resolved = false
ORDER BY wf.retry_count DESC, wf.first_attempt_at;

-- Get full details of a specific failure
SELECT
    id,
    stripe_event_id,
    event_type,
    error_message,
    error_traceback,
    retry_count,
    first_attempt_at,
    last_attempt_at,
    resolved,
    resolved_at
FROM webhook_failures
WHERE id = '8c527521-3486-44a9-b5c3-77499c93d4d5';

-- ========================================================================
-- 7. CROSS-TABLE ANALYTICS
-- ========================================================================

-- User subscription health check
SELECT
    p.id AS user_id,
    p.email,
    p.created_at AS user_since,
    us.status AS subscription_status,
    sp.name AS plan_name,
    us.current_period_end AS expires_at,
    uq.quota_date AS last_quota_date,
    uq.cv_analyses_used,
    sp.limits->>'cv_analyses' AS cv_analyses_limit
FROM profiles p
LEFT JOIN user_subscriptions us ON p.id = us.user_id AND us.status = 'active'
LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
LEFT JOIN LATERAL (
    SELECT * FROM usage_quotas
    WHERE user_id = p.id
    ORDER BY quota_date DESC
    LIMIT 1
) uq ON true
WHERE p.id = '3abda780-30fb-46c8-a5c3-5bfa7938d688';

-- Revenue calculation (all active subscriptions)
SELECT
    sp.name AS plan_name,
    COUNT(us.id) AS active_subs,
    sp.price_monthly AS monthly_price,
    COUNT(us.id) * sp.price_monthly AS monthly_revenue
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
GROUP BY sp.name, sp.price_monthly
ORDER BY monthly_revenue DESC;

-- Churn analysis (canceled vs active)
SELECT
    sp.name AS plan_name,
    COUNT(*) FILTER (WHERE us.status = 'active') AS active,
    COUNT(*) FILTER (WHERE us.status = 'canceled') AS canceled,
    ROUND(
        COUNT(*) FILTER (WHERE us.status = 'canceled')::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        2
    ) AS churn_rate_percent
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
GROUP BY sp.name
ORDER BY churn_rate_percent DESC;

-- ========================================================================
-- 8. MAINTENANCE QUERIES
-- ========================================================================

-- Archive old canceled subscriptions (DRY RUN)
-- REMOVE LIMIT to execute for all
SELECT
    id,
    user_id,
    status,
    canceled_at,
    EXTRACT(DAY FROM NOW() - canceled_at) AS days_canceled
FROM user_subscriptions
WHERE status = 'canceled'
  AND canceled_at < NOW() - INTERVAL '90 days'
LIMIT 10;

-- ACTUAL ARCHIVE (after reviewing DRY RUN):
-- UPDATE user_subscriptions
-- SET archived_at = NOW()
-- WHERE status = 'canceled'
--   AND canceled_at < NOW() - INTERVAL '90 days'
--   AND archived_at IS NULL;

-- Cleanup old webhook events (older than 90 days)
-- DRY RUN:
SELECT COUNT(*)
FROM stripe_webhook_events
WHERE created_at < NOW() - INTERVAL '90 days'
  AND processed_at IS NOT NULL;

-- ACTUAL DELETE (after reviewing count):
-- DELETE FROM stripe_webhook_events
-- WHERE created_at < NOW() - INTERVAL '90 days'
--   AND processed_at IS NOT NULL;

-- ========================================================================
-- 9. DEBUGGING QUERIES
-- ========================================================================

-- Find orphaned quotas (user deleted but quota remains)
SELECT uq.*
FROM usage_quotas uq
LEFT JOIN profiles p ON uq.user_id = p.id
WHERE p.id IS NULL;

-- Find subscriptions with invalid plan_id
SELECT us.*
FROM user_subscriptions us
LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE sp.id IS NULL;

-- Check for duplicate active subscriptions (should be none)
SELECT
    user_id,
    COUNT(*) AS active_count
FROM user_subscriptions
WHERE status = 'active'
GROUP BY user_id
HAVING COUNT(*) > 1;

-- ========================================================================
-- 10. MONITORING QUERIES (for alerts)
-- ========================================================================

-- Webhook failures in last 24h
SELECT COUNT(*)
FROM webhook_failures
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND resolved = false;

-- Quotas not reset in last 48h
SELECT COUNT(DISTINCT user_id)
FROM usage_quotas
WHERE last_reset_at < NOW() - INTERVAL '48 hours';

-- Subscriptions expiring in next 7 days
SELECT
    p.email,
    sp.name AS plan_name,
    us.current_period_end AS expires_at,
    EXTRACT(DAY FROM us.current_period_end - NOW()) AS days_until_expiry
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status = 'active'
  AND us.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY us.current_period_end;

-- ========================================================================
-- END OF QUERIES
-- ========================================================================
