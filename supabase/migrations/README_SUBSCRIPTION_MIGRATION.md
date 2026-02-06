# Subscription Infrastructure Migration Guide

**Migration:** `20260128000000_subscription_infrastructure.sql`
**Sprint:** 6 - Ticket S6-2
**Date:** 2026-01-28
**Status:** ⚠️ READY FOR REVIEW - Not yet applied

---

## 📋 Overview

This migration creates the complete subscription management infrastructure for HuntZen JobSearch, enabling:
- ✅ 4-tier subscription system (Free, Starter, Pro, Premium)
- ✅ User subscription tracking with Stripe integration
- ✅ Daily usage quotas per feature
- ✅ Row-Level Security (RLS) for data protection
- ✅ Automatic migration of existing users to Free plan

---

## 🏗️ Database Schema

### Tables Created

#### 1. `subscription_plans`
Static table with 4 subscription tiers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Plan identifier (`free`, `starter`, `pro`, `premium`) |
| `display_name` | TEXT | Human-readable name |
| `price_monthly` | DECIMAL | Monthly price in USD |
| `price_yearly` | DECIMAL | Yearly price in USD (null if unavailable) |
| `limits` | JSONB | Feature limits (`{"cv_analyses": 1, ...}`) |
| `features` | JSONB | Marketing features list |
| `is_active` | BOOLEAN | Whether plan is available for signup |

**Seed Data:**
- **Free:** $0/mo - 1 CV/day, 5min coach, 3 searches
- **Starter:** $9.99/mo - 5 CV/day, 15min coach, 10 searches
- **Pro:** $19.99/mo - 20 CV/day, 60min coach, unlimited searches
- **Premium:** $49.99/mo - Unlimited everything

#### 2. `user_subscriptions`
Links users to their active subscription.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to `auth.users` |
| `plan_id` | UUID | Foreign key to `subscription_plans` |
| `status` | TEXT | `active`, `canceled`, `past_due`, etc. |
| `current_period_start` | TIMESTAMPTZ | Billing period start |
| `current_period_end` | TIMESTAMPTZ | Billing period end |
| `stripe_subscription_id` | TEXT | Stripe subscription ID (for paid plans) |
| `stripe_customer_id` | TEXT | Stripe customer ID |

**Constraints:**
- One active subscription per user
- Period end must be after period start
- Status must be valid enum value

#### 3. `usage_quotas`
Daily usage tracking per user per feature.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to `auth.users` |
| `quota_date` | DATE | Date of usage (defaults to today) |
| `cv_analyses_used` | INTEGER | Number of CV analyses used |
| `coach_seconds_used` | INTEGER | Seconds of coach usage |
| `job_searches_used` | INTEGER | Number of job searches |

**Constraints:**
- One quota record per user per day
- Usage counters must be >= 0

---

## 🔒 Security (RLS Policies)

### `subscription_plans`
- ✅ **Public read:** Anyone can view active plans (for pricing page)

### `user_subscriptions`
- ✅ **Own read:** Users can only see their own subscription
- ✅ **Own update:** Users can only update their own subscription

### `usage_quotas`
- ✅ **Own read:** Users can only see their own usage
- ✅ **Own insert:** Users can only create their own usage records
- ✅ **Own update:** Users can only update their own usage

---

## 🚀 Running the Migration

### Step 1: Create Backup

```bash
# Create backup before migration
./scripts/backup_before_migration.sh subscription_infrastructure

# Verify backup was created
ls -lh backups/backup_subscription_infrastructure_*.dump
```

### Step 2: Apply Migration (Local/Staging First)

**Using Supabase CLI:**
```bash
# Test on local Supabase first
supabase db reset  # Reset local DB
supabase db push   # Apply migrations

# Validate
supabase db query "SELECT COUNT(*) FROM subscription_plans;" # Should be 4
supabase db query "SELECT COUNT(*) FROM user_subscriptions;" # Should equal user count
```

**Using psql directly:**
```bash
# Apply migration
psql "$DATABASE_URL" -f supabase/migrations/20260128000000_subscription_infrastructure.sql

# Check for errors
echo $?  # Should be 0
```

### Step 3: Validate Migration

```sql
-- Check all 4 plans were created
SELECT name, price_monthly, limits->>'cv_analyses' as cv_limit
FROM subscription_plans
ORDER BY sort_order;

-- Check all users have subscriptions
SELECT
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active') as subscribed_users;

-- Should be equal!

-- Test RLS policies
SET ROLE authenticated;
SET request.jwt.claims.sub = '<test_user_id>';

-- Should only see own subscription
SELECT * FROM user_subscriptions;

-- Should see all active plans
SELECT * FROM subscription_plans WHERE is_active = true;
```

### Step 4: Verify No Errors

```bash
# Check PostgreSQL logs for errors
tail -f /var/log/postgresql/postgresql.log | grep ERROR

# Check Supabase dashboard for any issues
```

---

## ⏪ Rollback Procedure

If something goes wrong, rollback using:

```bash
# 1. Apply rollback migration
psql "$DATABASE_URL" -f supabase/rollback/20260128000000_subscription_infrastructure_rollback.sql

# 2. Restore from backup (if needed)
pg_restore --clean --if-exists --verbose \
  --dbname="$DATABASE_URL" \
  backups/backup_subscription_infrastructure_YYYYMMDD_HHMMSS.dump

# 3. Verify rollback
psql "$DATABASE_URL" -c "\dt subscription_*"  # Should show no tables
```

---

## 📊 Expected Results

After successful migration:

| Metric | Expected Value |
|--------|----------------|
| `subscription_plans` rows | 4 |
| `user_subscriptions` rows | = number of users |
| `usage_quotas` rows | 0 (empty initially) |
| RLS policies | 7 policies created |
| Indexes | 9 indexes created |
| Functions | 2 helper functions |

---

## 🧪 Testing Checklist

- [ ] Migration runs without errors on local Supabase
- [ ] All 4 subscription plans exist with correct limits
- [ ] All existing users have active Free plan subscription
- [ ] RLS policies work (users can't see others' data)
- [ ] Helper functions return correct values
- [ ] Rollback script successfully removes all tables
- [ ] Backup can be restored successfully

---

## ⚠️ Known Issues & Limitations

1. **Free plan never expires:** Current implementation sets expiry to 100 years in the future
2. **No automatic renewal:** Renewal logic will be added in S6-3 with Stripe webhooks
3. **Usage quotas don't reset automatically:** Daily reset will be handled by cron job (S6-4)
4. **No billing history:** Will be added in Sprint 7

---

## 🔗 Related Tickets

- **S6-1:** Connection Pooling (prerequisite - completed)
- **S6-3:** Quota Enforcement Functions (next step)
- **S6-4:** Migrate In-Memory Quotas to DB
- **Sprint 7:** Stripe Integration & Payment Processing

---

## 📞 Support

If you encounter issues during migration:

1. Check PostgreSQL logs for detailed error messages
2. Verify DATABASE_URL is correct
3. Ensure you have backup before proceeding
4. Test rollback script on staging first
5. Contact backend team lead if problems persist

---

## 📝 Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-28 | Initial migration created | HuntZen Team |

---

**Last Updated:** 2026-01-28
**Status:** ✅ Ready for staging deployment
