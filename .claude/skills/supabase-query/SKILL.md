---
name: supabase-query
description: Generate optimized Supabase queries with RLS policies
user-invocable: true
---

# HuntZen Supabase Query Generator

Generate optimized Supabase queries with proper RLS policies, error handling, and TypeScript types.

## Usage

`/supabase-query <operation> <table>`

Examples:
- `/supabase-query select user_subscriptions` - Generate SELECT query
- `/supabase-query insert usage_quotas` - Generate INSERT query
- `/supabase-query update profiles` - Generate UPDATE query
- `/supabase-query delete webhook_failures` - Generate DELETE query
- `/supabase-query rpc check_quota` - Generate RPC call

## What this skill does

1. 🗄️ Generate type-safe Supabase queries
2. 🛡️ Include RLS policies
3. 🔍 Add error handling
4. ⚡ Optimize performance
5. 📝 Add TypeScript types
6. ✅ Generate tests

---

## HuntZen Database Schema

### Key Tables

```typescript
// user_subscriptions
{
  id: UUID
  user_id: UUID (FK → auth.users)
  stripe_subscription_id: string
  stripe_customer_id: string
  plan_name: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'canceled' | 'past_due'
  current_period_start: timestamp
  current_period_end: timestamp
  created_at: timestamp
  updated_at: timestamp
}

// usage_quotas
{
  id: UUID
  user_id: UUID (FK → auth.users)
  quota_type: 'job_search' | 'cv_analysis' | 'coach_messages'
  used_count: number
  limit_count: number
  date: date
  created_at: timestamp
  updated_at: timestamp
}

// profiles
{
  id: UUID (FK → auth.users)
  email: string
  full_name: string
  avatar_url: string
  created_at: timestamp
  updated_at: timestamp
}

// webhook_failures
{
  id: UUID
  event_id: string
  event_type: string
  payload: jsonb
  error_message: string
  retry_count: number
  created_at: timestamp
}
```

---

## Query Templates

### 1. SELECT Queries

#### A. Get User Subscription
```typescript
// backend/src/db/queries/subscriptions.ts

import { SupabaseClient } from '@supabase/supabase-js'

interface UserSubscription {
  id: string
  user_id: string
  plan_name: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'canceled' | 'past_due'
  current_period_end: string
}

export async function getUserSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSubscription | null> {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      // No subscription found
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    return data
  } catch (error) {
    console.error('Failed to fetch subscription:', error)
    throw new Error('Could not retrieve subscription')
  }
}
```

**RLS Policy:**
```sql
CREATE POLICY "Users can view own subscription"
ON public.user_subscriptions FOR SELECT
USING (auth.uid() = user_id);
```

---

#### B. Get Usage Quotas with Aggregation
```typescript
// backend/src/db/queries/quotas.ts

interface QuotaStatus {
  quota_type: string
  used_count: number
  limit_count: number
  remaining: number
  percentage_used: number
}

export async function getUserQuotas(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaStatus[]> {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('usage_quotas')
      .select('quota_type, used_count, limit_count')
      .eq('user_id', userId)
      .eq('date', today)

    if (error) throw error

    return (data || []).map(quota => ({
      ...quota,
      remaining: quota.limit_count - quota.used_count,
      percentage_used: (quota.used_count / quota.limit_count) * 100
    }))
  } catch (error) {
    console.error('Failed to fetch quotas:', error)
    throw new Error('Could not retrieve usage quotas')
  }
}
```

**Optimized with function:**
```typescript
// Use Supabase RPC for better performance
export async function getUserQuotasRPC(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaStatus[]> {
  const { data, error } = await supabase
    .rpc('get_user_quotas', { p_user_id: userId })

  if (error) throw error
  return data
}
```

---

### 2. INSERT Queries

#### A. Create Subscription
```typescript
// backend/src/db/queries/subscriptions.ts

interface CreateSubscriptionData {
  user_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  plan_name: 'free' | 'pro' | 'enterprise'
  status: 'active'
  current_period_start: string
  current_period_end: string
}

export async function createSubscription(
  supabase: SupabaseClient,
  data: CreateSubscriptionData
): Promise<UserSubscription> {
  try {
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      // Handle duplicate subscription
      if (error.code === '23505') {
        throw new Error('Subscription already exists for this user')
      }
      throw error
    }

    // Invalidate cache
    await invalidateUserQuotaCache(userId)

    return subscription
  } catch (error) {
    console.error('Failed to create subscription:', error)
    throw new Error('Could not create subscription')
  }
}
```

**RLS Policy:**
```sql
CREATE POLICY "Service role can insert subscriptions"
ON public.user_subscriptions FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

---

#### B. Increment Usage Quota
```typescript
// backend/src/db/queries/quotas.ts

export async function incrementQuota(
  supabase: SupabaseClient,
  userId: string,
  quotaType: 'job_search' | 'cv_analysis' | 'coach_messages'
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Use RPC for atomic increment
    const { error } = await supabase
      .rpc('increment_usage_quota', {
        p_user_id: userId,
        p_quota_type: quotaType,
        p_date: today
      })

    if (error) throw error

    // Invalidate cache
    await invalidateUserQuotaCache(userId)
  } catch (error) {
    console.error('Failed to increment quota:', error)
    throw new Error('Could not update usage quota')
  }
}
```

**Database Function:**
```sql
CREATE OR REPLACE FUNCTION increment_usage_quota(
    p_user_id UUID,
    p_quota_type TEXT,
    p_date DATE
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.usage_quotas (
        user_id, quota_type, date, used_count, limit_count
    )
    VALUES (
        p_user_id,
        p_quota_type,
        p_date,
        1,
        CASE p_quota_type
            WHEN 'job_search' THEN 10
            WHEN 'cv_analysis' THEN 5
            WHEN 'coach_messages' THEN 50
        END
    )
    ON CONFLICT (user_id, quota_type, date)
    DO UPDATE SET
        used_count = usage_quotas.used_count + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 3. UPDATE Queries

#### A. Update Subscription Status
```typescript
// backend/src/db/queries/subscriptions.ts

export async function updateSubscriptionStatus(
  supabase: SupabaseClient,
  subscriptionId: string,
  status: 'active' | 'canceled' | 'past_due'
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)

    if (error) throw error

    // Invalidate cache
    const { data } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscriptionId)
      .single()

    if (data) {
      await invalidateUserQuotaCache(data.user_id)
    }
  } catch (error) {
    console.error('Failed to update subscription:', error)
    throw new Error('Could not update subscription status')
  }
}
```

---

### 4. DELETE Queries

#### A. Delete Old Webhook Failures
```typescript
// backend/src/db/queries/webhooks.ts

export async function deleteOldWebhookFailures(
  supabase: SupabaseClient,
  daysOld: number = 30
): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const { data, error } = await supabase
      .from('webhook_failures')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id')

    if (error) throw error

    return data?.length || 0
  } catch (error) {
    console.error('Failed to delete webhook failures:', error)
    throw new Error('Could not delete old webhook failures')
  }
}
```

**RLS Policy:**
```sql
CREATE POLICY "Service role can delete webhook failures"
ON public.webhook_failures FOR DELETE
USING (auth.role() = 'service_role');
```

---

### 5. RPC Calls

#### A. Check User Quota
```typescript
// backend/src/db/queries/quotas.ts

interface QuotaCheckResult {
  can_use: boolean
  remaining: number
  limit: number
}

export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  quotaType: string
): Promise<QuotaCheckResult> {
  try {
    const { data, error } = await supabase
      .rpc('check_user_quota', {
        p_user_id: userId,
        p_quota_type: quotaType
      })

    if (error) throw error

    return data
  } catch (error) {
    console.error('Failed to check quota:', error)
    // Fallback: allow usage if check fails
    return { can_use: true, remaining: 999, limit: 999 }
  }
}
```

**Database Function:**
```sql
CREATE OR REPLACE FUNCTION check_user_quota(
    p_user_id UUID,
    p_quota_type TEXT
)
RETURNS TABLE(can_use BOOLEAN, remaining INT, limit_count INT) AS $$
DECLARE
    v_used INT;
    v_limit INT;
    v_plan TEXT;
BEGIN
    -- Get user plan
    SELECT plan_name INTO v_plan
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active';

    -- Default to free if no subscription
    v_plan := COALESCE(v_plan, 'free');

    -- Get limit based on plan
    v_limit := CASE
        WHEN v_plan = 'free' THEN
            CASE p_quota_type
                WHEN 'job_search' THEN 10
                WHEN 'cv_analysis' THEN 5
                WHEN 'coach_messages' THEN 50
            END
        WHEN v_plan = 'pro' THEN 999999
        ELSE 999999
    END;

    -- Get usage today
    SELECT COALESCE(used_count, 0) INTO v_used
    FROM public.usage_quotas
    WHERE user_id = p_user_id
    AND quota_type = p_quota_type
    AND date = CURRENT_DATE;

    v_used := COALESCE(v_used, 0);

    RETURN QUERY SELECT
        (v_used < v_limit) AS can_use,
        (v_limit - v_used) AS remaining,
        v_limit AS limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Performance Optimization

### 1. Indexes
```sql
-- Critical indexes for HuntZen
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_id ON public.user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_usage_quotas_user_date ON public.usage_quotas(user_id, date);
CREATE INDEX idx_usage_quotas_composite ON public.usage_quotas(user_id, quota_type, date);
CREATE INDEX idx_webhook_failures_created_at ON public.webhook_failures(created_at);
```

### 2. Caching
```typescript
// backend/src/db/cache.ts

import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

export async function getUserSubscriptionCached(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSubscription | null> {
  const cacheKey = `subscription:${userId}`

  // Check cache
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Fetch from DB
  const subscription = await getUserSubscription(supabase, userId)

  // Cache for 5 minutes
  if (subscription) {
    await redis.setex(cacheKey, 300, JSON.stringify(subscription))
  }

  return subscription
}

export async function invalidateUserQuotaCache(userId: string): Promise<void> {
  await redis.del(`subscription:${userId}`)
  await redis.del(`quotas:${userId}`)
}
```

### 3. Batch Operations
```typescript
// Fetch multiple users' subscriptions in one query
export async function getBatchSubscriptions(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserSubscription>> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .in('user_id', userIds)

  if (error) throw error

  return new Map(
    (data || []).map(sub => [sub.user_id, sub])
  )
}
```

---

## Error Handling

### Standard Error Wrapper
```typescript
// backend/src/db/errors.ts

export class SupabaseQueryError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'SupabaseQueryError'
  }
}

export function handleSupabaseError(error: any): never {
  // Log to Sentry
  console.error('Supabase error:', error)

  // Map common errors
  switch (error.code) {
    case 'PGRST116':
      throw new SupabaseQueryError('Resource not found', '404')
    case '23505':
      throw new SupabaseQueryError('Resource already exists', '409')
    case '23503':
      throw new SupabaseQueryError('Referenced resource not found', '400')
    default:
      throw new SupabaseQueryError('Database error', '500', error)
  }
}
```

---

## Testing Supabase Queries

```typescript
// backend/tests/db/test_subscriptions.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

describe('Subscription Queries', () => {
  beforeEach(async () => {
    // Clean up test data
    await supabase
      .from('user_subscriptions')
      .delete()
      .eq('user_id', 'test-user-id')
  })

  it('creates a new subscription', async () => {
    const subscription = await createSubscription(supabase, {
      user_id: 'test-user-id',
      stripe_subscription_id: 'sub_test',
      stripe_customer_id: 'cus_test',
      plan_name: 'pro',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString()
    })

    expect(subscription).toBeDefined()
    expect(subscription.plan_name).toBe('pro')
  })

  it('retrieves user subscription', async () => {
    // Create first
    await createSubscription(supabase, { ... })

    // Then fetch
    const subscription = await getUserSubscription(supabase, 'test-user-id')

    expect(subscription).toBeDefined()
    expect(subscription?.user_id).toBe('test-user-id')
  })
})
```

---

## Best Practices

### 1. Always Use Transactions
```typescript
// For multiple related operations
const { data, error } = await supabase.rpc('create_subscription_with_quotas', {
  p_user_id: userId,
  p_plan_name: 'pro'
})
```

### 2. Use Prepared Statements (via RPC)
```typescript
// ✅ GOOD: RPC with parameters
supabase.rpc('check_quota', { p_user_id: userId })

// ❌ BAD: String interpolation
supabase.from('quotas').select(`*`).eq('user_id', userId)
```

### 3. Handle NULL Values
```typescript
// Always check for null
const subscription = await getUserSubscription(supabase, userId)
if (!subscription) {
  // Handle missing subscription
  return createDefaultSubscription(userId)
}
```

---

## Related Skills

- `/create-migration` - Create database migrations
- `/security-check` - Security audit
- `/performance-check` - Performance optimization
- `/gen-test` - Generate query tests
