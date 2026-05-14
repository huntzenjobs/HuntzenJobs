# Assistant Message Quota — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the client-side coach timer with a server-side message quota system, protect all `/api/assistant/*` routes with JWT auth + quota enforcement, and update the admin UI to configure messages/day per plan.

**Architecture:** New `assistant_messages_used` column in `usage_quotas` table tracks messages sent per user per day. Backend verifies JWT + checks quota before every assistant response, increments after. Frontend shows a simple "X messages remaining" counter instead of the timer. Admin can configure the limit per plan via the existing plan editor.

**Tech Stack:** Supabase (PostgreSQL RPC functions), FastAPI `Depends()`, Next.js React context, Supabase JS client

---

## Context — What exists today

### Database
- `usage_quotas` table: columns `cv_analyses_used`, `coach_seconds_used`, `job_searches_used` per user per day
- `subscription_plans.limits` JSONB: keys `cv_analyses`, `coach_seconds`, `job_searches` (value -1 = unlimited)
- `get_quota_status(p_user_id)` RPC: returns rows with `feature`, `quota_limit`, `quota_used`, `quota_remaining`, `has_access`
- `increment_usage(p_user_id, p_feature, p_amount)` RPC: increments a usage counter, validates feature name

### Backend
- `get_current_user` and `CurrentUserDep` in `backend/src/api/deps.py:349` — raises 401 if no valid Bearer token
- `/api/assistant/*` routes in `backend/src/api/routes/assistant.py` — **currently NO auth**
- `/api/auth/me` in `backend/src/api/routes/auth.py:83` — calls `get_quota_status`, returns `quotas.coach` today
- `/api/admin/plans/{id}/limits` — `allowed_keys = {"cv_analyses", "coach_seconds", "job_searches"}` (line 459)

### Frontend
- `huntzen-client.ts`: `sendAssistantMessage` and `sendBrandingMessage` use `this.fetch` (no auth header); `attachCVToAssistant` uses raw `fetch` (no auth header)
- `use-subscription-api.ts`: `QuotasData` interface has `cv_analysis`, `coach`, `job_search` — needs `assistant_messages`
- `use-freemium-limits.ts`: `PLAN_LIMITS` has `coach_minutes_per_day`; `FeatureType` has `coach_time`; has `startCoachSession`, `stopCoachSession`, `getCoachTimeRemaining` timer logic
- `subscription-context.tsx`: exposes `coachTimeRemaining`, `startCoachSession`, `stopCoachSession`, `isCoachSessionActive`
- `assistant/page.tsx`: uses `CoachTimerBadge`, `handleTimeUp`, `isCoachSessionActive`, `startCoachSession`, `stopCoachSession`
- `plan-card-editor.tsx`: admin field `coach_seconds` with display "X min"

---

## Task 1 — DB Migration: add `assistant_messages` quota

**Files:**
- Create: `supabase/migrations/20260306000001_assistant_message_quota.sql`

**Step 1: Write the migration SQL**

```sql
-- 1. Add column to usage_quotas
ALTER TABLE usage_quotas
  ADD COLUMN IF NOT EXISTS assistant_messages_used INTEGER DEFAULT 0 CHECK (assistant_messages_used >= 0);

-- 2. Add assistant_messages limits to each plan (free=10, starter=100, pro=-1, premium=-1)
UPDATE subscription_plans SET limits = jsonb_set(limits, '{assistant_messages}', '10'::jsonb)   WHERE name = 'free';
UPDATE subscription_plans SET limits = jsonb_set(limits, '{assistant_messages}', '100'::jsonb)  WHERE name = 'starter';
UPDATE subscription_plans SET limits = jsonb_set(limits, '{assistant_messages}', '-1'::jsonb)   WHERE name = 'pro';
UPDATE subscription_plans SET limits = jsonb_set(limits, '{assistant_messages}', '-1'::jsonb)   WHERE name = 'premium';

-- 3. Update increment_usage to support 'assistant_messages'
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_normalized_feature TEXT;
BEGIN
  v_normalized_feature := p_feature;
  IF p_feature = 'cv_analyses' THEN
    v_normalized_feature := 'cv_analysis';
  END IF;

  IF v_normalized_feature NOT IN ('cv_analysis', 'coach', 'job_search', 'assistant_messages') THEN
    RAISE EXCEPTION 'Invalid feature: %. Must be cv_analysis, coach, job_search, or assistant_messages', p_feature;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative, got: %', p_amount;
  END IF;

  INSERT INTO usage_quotas (
    user_id, quota_date,
    cv_analyses_used, coach_seconds_used, job_searches_used, assistant_messages_used
  ) VALUES (
    p_user_id, CURRENT_DATE,
    CASE WHEN v_normalized_feature = 'cv_analysis'        THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'coach'              THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'job_search'         THEN p_amount ELSE 0 END,
    CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id, quota_date) DO UPDATE SET
    cv_analyses_used        = usage_quotas.cv_analyses_used        + CASE WHEN v_normalized_feature = 'cv_analysis'        THEN p_amount ELSE 0 END,
    coach_seconds_used      = usage_quotas.coach_seconds_used      + CASE WHEN v_normalized_feature = 'coach'              THEN p_amount ELSE 0 END,
    job_searches_used       = usage_quotas.job_searches_used       + CASE WHEN v_normalized_feature = 'job_search'         THEN p_amount ELSE 0 END,
    assistant_messages_used = usage_quotas.assistant_messages_used + CASE WHEN v_normalized_feature = 'assistant_messages' THEN p_amount ELSE 0 END,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update get_quota_status to include assistant_messages
CREATE OR REPLACE FUNCTION get_quota_status(p_user_id UUID)
RETURNS TABLE (
  feature TEXT,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  quota_percentage NUMERIC,
  has_access BOOLEAN,
  reset_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH user_plan AS (
    SELECT sp.limits
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
      AND us.current_period_end > NOW()
    ORDER BY sp.sort_order DESC, us.created_at DESC
    LIMIT 1
  ),
  plan_limits AS (
    SELECT
      COALESCE((SELECT limits FROM user_plan), '{"cv_analyses":1,"coach_seconds":300,"job_searches":3,"assistant_messages":10}'::jsonb) AS limits
  ),
  user_usage AS (
    SELECT cv_analyses_used, coach_seconds_used, job_searches_used, assistant_messages_used
    FROM usage_quotas
    WHERE user_id = p_user_id AND quota_date = CURRENT_DATE
  ),
  features(internal_key, api_name, used_value) AS (
    SELECT 'cv_analyses',        'cv_analysis',        COALESCE((SELECT cv_analyses_used        FROM user_usage), 0) UNION ALL
    SELECT 'coach_seconds',      'coach',              COALESCE((SELECT coach_seconds_used      FROM user_usage), 0) UNION ALL
    SELECT 'job_searches',       'job_search',         COALESCE((SELECT job_searches_used       FROM user_usage), 0) UNION ALL
    SELECT 'assistant_messages', 'assistant_messages', COALESCE((SELECT assistant_messages_used FROM user_usage), 0)
  )
  SELECT
    f.api_name::TEXT,
    ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER AS quota_limit,
    f.used_value::INTEGER,
    CASE
      WHEN ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER = -1 THEN -1
      ELSE GREATEST(0, ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER - f.used_value)
    END::INTEGER,
    CASE
      WHEN ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER <= 0 THEN 100.0
      WHEN ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER = -1 THEN 0.0
      ELSE ROUND((f.used_value::NUMERIC / ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER) * 100, 1)
    END,
    CASE
      WHEN ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER = -1 THEN TRUE
      ELSE f.used_value < ((SELECT limits FROM plan_limits) ->> f.internal_key)::INTEGER
    END,
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  FROM features f;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_quota_status(UUID) TO authenticated, service_role;
```

**Step 2: Apply the migration**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
supabase db push
```

Expected: migration applies without errors.

**Step 3: Verify in Supabase SQL editor**

```sql
-- Check column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'usage_quotas' AND column_name = 'assistant_messages_used';

-- Check plan limits updated
SELECT name, limits->>'assistant_messages' as msg_limit FROM subscription_plans;
-- Expected: free=10, starter=100, pro=-1, premium=-1

-- Test increment
SELECT increment_usage('00000000-0000-0000-0000-000000000001'::uuid, 'assistant_messages', 1);

-- Test get_quota_status includes assistant_messages
SELECT * FROM get_quota_status('00000000-0000-0000-0000-000000000001'::uuid)
WHERE feature = 'assistant_messages';
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260306000001_assistant_message_quota.sql
git commit -m "feat(db): add assistant_messages quota column and RPC support"
```

---

## Task 2 — Backend: auth + quota on all assistant routes

**Files:**
- Modify: `backend/src/api/deps.py` (add quota helpers)
- Modify: `backend/src/api/routes/assistant.py` (add auth + quota check + increment)

### Step 1: Add quota helpers to `deps.py`

Add after `CurrentUserDep = Annotated[dict, Depends(get_current_user)]` (line 398):

```python
def check_assistant_quota(user_id: str) -> None:
    """
    Check if user has remaining assistant messages quota.
    Raises HTTP 429 if quota exceeded.
    Uses Supabase get_quota_status RPC.
    """
    try:
        supabase = get_supabase_client()
        result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        if not result.data:
            return  # No quota data = new user, allow through
        for row in result.data:
            if row.get("feature") == "assistant_messages":
                if not row.get("has_access", True):
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "code": "QUOTA_EXCEEDED",
                            "feature": "assistant_messages",
                            "limit": row.get("quota_limit"),
                            "used": row.get("quota_used"),
                            "reset_at": row.get("reset_at"),
                            "message": "Quota de messages journalier atteint. Passez à un plan supérieur pour continuer."
                        }
                    )
                return
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[quota] check failed for {user_id}, allowing through: {e}")


def increment_assistant_messages(user_id: str) -> None:
    """
    Increment assistant_messages usage counter for today.
    Best-effort: logs warning on failure, does NOT raise.
    """
    try:
        supabase = get_supabase_client()
        supabase.rpc("increment_usage", {
            "p_user_id": user_id,
            "p_feature": "assistant_messages",
            "p_amount": 1,
        }).execute()
    except Exception as e:
        logger.warning(f"[quota] increment failed for {user_id}: {e}")
```

### Step 2: Protect assistant routes

In `backend/src/api/routes/assistant.py`, add `current_user: CurrentUserDep` to each route and quota check/increment pattern.

**Pattern for each chat route** (`/job-scout`, `/cv-analyzer`, `/cv-adapter`, `/interview-sim`):

```python
# BEFORE (no auth):
@router.post("/job-scout", response_model=AssistantResponse)
async def job_scout_chat(
    request: AssistantRequest,
    agent: ScoutConversationalAgentDep,
):

# AFTER (with auth + quota):
@router.post("/job-scout", response_model=AssistantResponse)
async def job_scout_chat(
    request: AssistantRequest,
    agent: ScoutConversationalAgentDep,
    current_user: CurrentUserDep,
):
    user_id = current_user["id"]
    check_assistant_quota(user_id)

    # ... existing logic (get history, run agent, update history) ...

    # After successful response, before return:
    increment_assistant_messages(user_id)
    return AssistantResponse(...)
```

Add imports at top of `assistant.py`:
```python
from src.api.deps import (
    ...,
    CurrentUserDep,
    check_assistant_quota,
    increment_assistant_messages,
)
```

Apply this pattern to all 4 chat routes:
- `job_scout_chat` (line 107)
- `cv_analyzer_chat` (line 150)
- `cv_adapter_chat` (line 193)
- `interview_sim_chat` (line 236)
- `attach_cv_to_chat` (line 313) — counts as 1 message

**Step 3: Verify imports compile**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch/backend
python -c "from src.api.routes.assistant import router; print('OK')"
```

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/src/api/deps.py backend/src/api/routes/assistant.py
git commit -m "feat(backend): protect assistant routes with JWT auth + message quota enforcement"
```

---

## Task 3 — Backend: add `assistant_messages` to admin plans + `/api/auth/me`

**Files:**
- Modify: `backend/src/api/routes/admin.py:459`
- Modify: `backend/src/api/routes/auth.py` (quota response)

### Step 1: Admin — allow `assistant_messages` in plan limits

In `admin.py` line 459, change:
```python
# BEFORE:
allowed_keys = {"cv_analyses", "coach_seconds", "job_searches"}

# AFTER:
allowed_keys = {"cv_analyses", "coach_seconds", "job_searches", "assistant_messages"}
```

### Step 2: Auth/me — add `assistant_messages` to quota response

In `auth.py`, find the quota mapping block (around line 232-244). The `get_quota_status` RPC now returns `assistant_messages` as a feature row automatically. The existing loop already maps all rows by feature name, so **no code change needed** in `auth.py` — the `assistant_messages` row will appear in `quotas` automatically once the SQL function is updated.

Verify by checking the loop:
```python
# This existing loop already handles new features generically:
for quota in quota_response.data:
    feature = quota["feature"]  # Will include "assistant_messages"
    quotas[feature] = { "limit": ..., "used": ..., ... }
```

### Step 3: Verify admin endpoint

```bash
curl -X PATCH http://localhost:8000/api/admin/plans/{plan_id}/limits \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assistant_messages": 15}'
# Expected: {"success": true, "limits": {"assistant_messages": 15, ...}}
```

### Step 4: Commit

```bash
git add backend/src/api/routes/admin.py
git commit -m "feat(backend): add assistant_messages to plan limits admin API"
```

---

## Task 4 — Frontend: pass auth token from assistant API calls

**Files:**
- Modify: `frontend-next/src/lib/api/huntzen-client.ts`

The `private fetch()` method already spreads `options.headers` after `Content-Type`, so passing `Authorization` in headers works. We add an optional `token` parameter to assistant-related methods.

### Step 1: Update `sendAssistantMessage`

```typescript
// BEFORE:
async sendAssistantMessage(
  message: string,
  sessionId: string,
  assistantType: ...,
  language: string = "fr",
): Promise<...> {
  return this.fetch<...>(endpoint, {
    method: "POST",
    body: JSON.stringify({ message, session_id: sessionId, assistant_type: assistantType, language }),
  });
}

// AFTER:
async sendAssistantMessage(
  message: string,
  sessionId: string,
  assistantType: ...,
  language: string = "fr",
  token?: string,
): Promise<...> {
  return this.fetch<...>(endpoint, {
    method: "POST",
    body: JSON.stringify({ message, session_id: sessionId, assistant_type: assistantType, language }),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
```

### Step 2: Update `sendBrandingMessage`

```typescript
// Add token?: string parameter and forward to headers
async sendBrandingMessage(
  message: string,
  sessionId: string,
  language: string = "fr",
  brandingState?: Record<string, unknown> | null,
  token?: string,
): Promise<...> {
  return this.fetch("/api/branding/chat", {
    method: "POST",
    body: JSON.stringify({ message, session_id: sessionId, language, branding_state: brandingState ?? null }),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
```

### Step 3: Update `attachCVToAssistant`

```typescript
// BEFORE:
async attachCVToAssistant(file, assistantType, sessionId, language = "fr") {
  ...
  const response = await fetch(`${this.baseUrl}/api/assistant/attach-cv`, {
    method: "POST",
    body: formData,
  });

// AFTER:
async attachCVToAssistant(file, assistantType, sessionId, language = "fr", token?: string) {
  ...
  const response = await fetch(`${this.baseUrl}/api/assistant/attach-cv`, {
    method: "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
```

### Step 4: Commit

```bash
git add frontend-next/src/lib/api/huntzen-client.ts
git commit -m "feat(api-client): forward Bearer token on all assistant API calls"
```

---

## Task 5 — Frontend: update `use-subscription-api.ts` (add `assistant_messages`)

**Files:**
- Modify: `frontend-next/src/hooks/use-subscription-api.ts`

### Step 1: Add `assistant_messages` to `QuotasData` interface

```typescript
// BEFORE:
interface QuotasData {
  cv_analysis: QuotaData;
  coach: QuotaData;
  job_search: QuotaData;
}

// AFTER:
interface QuotasData {
  cv_analysis: QuotaData;
  coach: QuotaData;
  job_search: QuotaData;
  assistant_messages: QuotaData;
}
```

The rest of the hook is generic — it just passes `quotas` through. No other changes needed here.

### Step 2: Commit

```bash
git add frontend-next/src/hooks/use-subscription-api.ts
git commit -m "feat(subscription): add assistant_messages quota to API types"
```

---

## Task 6 — Frontend: update `use-freemium-limits.ts` (replace timer with message count)

**Files:**
- Modify: `frontend-next/src/hooks/use-freemium-limits.ts`

### Step 1: Replace `coach_minutes_per_day` with `assistant_messages_per_day` in `PLAN_LIMITS`

```typescript
// BEFORE (in each plan):
coach_minutes_per_day: 5,  // free
coach_minutes_per_day: 30, // starter
coach_minutes_per_day: Infinity, // pro/premium

// AFTER:
assistant_messages_per_day: 10,       // free
assistant_messages_per_day: 100,      // starter
assistant_messages_per_day: Infinity, // pro
assistant_messages_per_day: Infinity, // premium
```

### Step 2: Replace `coach_time` in `FeatureType`

```typescript
// BEFORE:
export type FeatureType = 'job_search' | 'job_view' | 'cv_analysis' | 'coach_time'

// AFTER:
export type FeatureType = 'job_search' | 'job_view' | 'cv_analysis' | 'assistant_messages'
```

### Step 3: Update `UsageLimits` interface

```typescript
// BEFORE:
interface UsageLimits {
  ...
  coachSecondsUsedToday: number
  coachSessionStartTime: number | null
  ...
}

// AFTER:
interface UsageLimits {
  ...
  assistantMessagesUsedToday: number
  ...
}
// Remove: coachSecondsUsedToday, coachSessionStartTime
```

### Step 4: Update `getDefaultState`, `canUse`, `getRemaining`, `incrementUsage`

Replace all `coach_time` / `coachSecondsUsedToday` / `coach_minutes_per_day` references with `assistant_messages` / `assistantMessagesUsedToday` / `assistant_messages_per_day`.

Remove: `startCoachSession`, `stopCoachSession`, `getCoachTimeRemaining` functions entirely.

Update return object: remove `startCoachSession`, `stopCoachSession`, `getCoachTimeRemaining`, `isCoachSessionActive`. The hook becomes simpler.

### Step 5: Commit

```bash
git add frontend-next/src/hooks/use-freemium-limits.ts
git commit -m "feat(freemium): replace coach timer with assistant message quota"
```

---

## Task 7 — Frontend: update `subscription-context.tsx` (remove timer, expose message quota)

**Files:**
- Modify: `frontend-next/src/contexts/subscription-context.tsx`

### Step 1: Remove timer from `SubscriptionContextType`

```typescript
// REMOVE from interface:
coachTimeRemaining: number;
startCoachSession: () => void;
stopCoachSession: () => void;
isCoachSessionActive: boolean;

// ADD:
assistantMessagesRemaining: number;
assistantMessagesLimit: number;
```

### Step 2: Remove timer state and interval

Remove:
```typescript
const [coachTimeRemaining, setCoachTimeRemaining] = useState(0);

// The entire useEffect for timer (lines 107-133):
useEffect(() => {
  if (!freemium.isLoaded) return;
  if (freemium.isCoachSessionActive) { ... }
  else { ... setCoachTimeRemaining(...) }
}, [...])
```

### Step 3: Add `assistantMessagesRemaining` from API quotas

```typescript
const assistantMessagesRemaining = useMemo((): number => {
  if (!apiData.quotas?.assistant_messages) {
    // Fallback to local limits
    return PLAN_LIMITS[plan].assistant_messages_per_day === Infinity
      ? Infinity
      : PLAN_LIMITS[plan].assistant_messages_per_day;
  }
  const q = apiData.quotas.assistant_messages;
  return q.remaining === -1 ? Infinity : q.remaining;
}, [apiData.quotas, plan]);

const assistantMessagesLimit = useMemo((): number => {
  if (!apiData.quotas?.assistant_messages) return PLAN_LIMITS[plan].assistant_messages_per_day as number;
  const q = apiData.quotas.assistant_messages;
  return q.limit === -1 ? Infinity : q.limit;
}, [apiData.quotas, plan]);
```

### Step 4: Update `canUse` for `assistant_messages`

```typescript
case "assistant_messages":
  return apiData.quotas?.assistant_messages?.has_access ?? freemium.canUse(feature);
```

### Step 5: Update `limitsFromApi` — replace `coach_minutes_per_day`

```typescript
// BEFORE:
coach_minutes_per_day: apiData.quotas.coach.limit === -1 ? Infinity : Math.round(apiData.quotas.coach.limit / 60),

// AFTER:
assistant_messages_per_day: apiData.quotas.assistant_messages
  ? (apiData.quotas.assistant_messages.limit === -1 ? Infinity : apiData.quotas.assistant_messages.limit)
  : PLAN_LIMITS[plan].assistant_messages_per_day,
```

### Step 6: Update context value object

Remove `coachTimeRemaining`, `startCoachSession`, `stopCoachSession`, `isCoachSessionActive` from the value object.
Add `assistantMessagesRemaining`, `assistantMessagesLimit`.

### Step 7: Commit

```bash
git add frontend-next/src/contexts/subscription-context.tsx
git commit -m "feat(context): remove coach timer, expose assistant message quota"
```

---

## Task 8 — Frontend: update `assistant/page.tsx` (remove timer UI, add counter + auth token)

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx`

### Step 1: Add `useAuth` import and get token

```typescript
import { useAuth } from "@/contexts/auth-context";

// Inside component:
const { session } = useAuth();
const accessToken = session?.access_token;
```

### Step 2: Replace timer-based `canChat` with quota-based check

```typescript
// BEFORE:
const canChat = coachTimeRemaining > 0 || limits.coach_minutes_per_day === Infinity;

// AFTER:
const canChat = assistantMessagesRemaining > 0 || assistantMessagesLimit === Infinity;
```

### Step 3: Remove timer destructuring from `useSubscription`

```typescript
// BEFORE:
const {
  coachTimeRemaining,
  startCoachSession,
  stopCoachSession,
  isCoachSessionActive,
  ...
} = useSubscription();

// AFTER:
const {
  assistantMessagesRemaining,
  assistantMessagesLimit,
  ...
} = useSubscription();
// Remove: coachTimeRemaining, startCoachSession, stopCoachSession, isCoachSessionActive
```

### Step 4: Remove timer-related code from `sendMessage`

```typescript
// REMOVE these lines from sendMessage:
if (!isCoachSessionActive && isFreePlan) {
  startCoachSession();
}
```

### Step 5: Remove timer-related code from handleCVUpload

```typescript
// REMOVE:
if (!isCoachSessionActive && isFreePlan) {
  startCoachSession();
}
```

### Step 6: Remove `handleTimeUp` function and stop-session useEffect

```typescript
// REMOVE entire function:
const handleTimeUp = () => { openPricingModal("coach_minutes_per_day"); };

// REMOVE entire useEffect:
useEffect(() => {
  return () => {
    if (isCoachSessionActive) { stopCoachSession(); }
  };
}, [isCoachSessionActive, stopCoachSession]);
```

### Step 7: Remove `formatTime` function (no longer used)

### Step 8: Remove `isTimeWarning` and time warning banner

```typescript
// REMOVE:
const isTimeWarning = isFreePlan && coachTimeRemaining <= 180 && coachTimeRemaining > 0;

// REMOVE the AnimatePresence time warning banner from JSX (lines 483-503)
```

### Step 9: Replace `CoachTimerBadge` with message counter badge

```typescript
// BEFORE (in header):
{isFreePlan && (
  <CoachTimerBadge
    totalSeconds={coachTimeRemaining}
    onTimeUp={handleTimeUp}
  />
)}

// AFTER:
{isFreePlan && assistantMessagesLimit !== Infinity && (
  <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
    <MessageSquare className="w-3.5 h-3.5" />
    <span className="font-medium">
      {assistantMessagesRemaining > 0
        ? `${assistantMessagesRemaining} message${assistantMessagesRemaining > 1 ? 's' : ''} restant${assistantMessagesRemaining > 1 ? 's' : ''}`
        : "Quota atteint"}
    </span>
  </div>
)}
```

### Step 10: Pass `accessToken` to API calls in `sendMessage`

```typescript
// In sendMessage, update branding call:
const brandingResponse = await huntzenApi.sendBrandingMessage(
  messageText, sessionId, locale, brandingState, accessToken
);

// Update assistant call:
response = await huntzenApi.sendAssistantMessage(
  messageText, sessionId, selectedAssistant, locale, accessToken
);
```

### Step 11: Pass `accessToken` in `handleCVUpload`

```typescript
const result = await huntzenApi.attachCVToAssistant(
  file, selectedAssistant, sessionId, locale, accessToken
);
```

### Step 12: Update `openPricingModal` call for quota exceeded

```typescript
// BEFORE (in sendMessage guard):
openPricingModal("coach_minutes_per_day");

// AFTER:
openPricingModal("assistant_messages");
```

### Step 13: Remove `CoachTimer` import and `formatTime` function

### Step 14: Commit

```bash
git add "frontend-next/src/app/(dashboard)/assistant/page.tsx"
git commit -m "feat(assistant): remove timer, add message quota counter + auth token forwarding"
```

---

## Task 9 — Frontend: update admin `plan-card-editor.tsx`

**Files:**
- Modify: `frontend-next/src/components/admin/plans/plan-card-editor.tsx`

### Step 1: Update `limits` state

```typescript
// BEFORE:
const [limits, setLimits] = useState({
  cv_analyses: plan.limits?.cv_analyses ?? 0,
  coach_seconds: plan.limits?.coach_seconds ?? 0,
  job_searches: plan.limits?.job_searches ?? 0,
})

// AFTER:
const [limits, setLimits] = useState({
  cv_analyses: plan.limits?.cv_analyses ?? 0,
  assistant_messages: plan.limits?.assistant_messages ?? 10,
  job_searches: plan.limits?.job_searches ?? 0,
})
// Note: keep coach_seconds out — it's legacy, admin no longer edits it
```

### Step 2: Replace "Secondes coach/jour" field with "Messages assistant/jour"

```tsx
// BEFORE:
<div className="space-y-1">
  <Label className="text-xs">Secondes coach/jour</Label>
  <Input
    type="number"
    min="-1"
    value={limits.coach_seconds}
    onChange={e => setLimits(l => ({ ...l, coach_seconds: parseInt(e.target.value) || 0 }))}
    className="h-8 text-sm"
  />
  <p className="text-xs text-muted-foreground">
    {limits.coach_seconds === -1 ? '∞' : `${Math.round(limits.coach_seconds / 60)} min`}
  </p>
</div>

// AFTER:
<div className="space-y-1">
  <Label className="text-xs">Messages assistant/jour</Label>
  <Input
    type="number"
    min="-1"
    value={limits.assistant_messages}
    onChange={e => setLimits(l => ({ ...l, assistant_messages: parseInt(e.target.value) || 0 }))}
    className="h-8 text-sm"
  />
  <p className="text-xs text-muted-foreground">{formatLimit(limits.assistant_messages)}</p>
</div>
```

### Step 3: Commit

```bash
git add frontend-next/src/components/admin/plans/plan-card-editor.tsx
git commit -m "feat(admin): replace coach_seconds with assistant_messages in plan editor"
```

---

## Task 10 — Cleanup: remove unused timer components and stale imports

**Files:**
- Check: `frontend-next/src/components/coach/coach-timer.tsx` — kept if used elsewhere, just no longer imported in `assistant/page.tsx`
- Check: `frontend-next/src/components/freemium/usage-counter.tsx` — `CoachTimer` export stays for now
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx` — remove `CoachTimer` import

### Step 1: Verify `coach-timer.tsx` is not used anywhere else

```bash
grep -r "CoachTimer\|coach-timer" frontend-next/src --include="*.tsx" --include="*.ts" -l
```

If only `assistant/page.tsx` uses it, the import removal in Task 8 is sufficient. Do NOT delete the component file yet — keep for potential future use.

### Step 2: Verify TypeScript compiles

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors (or only pre-existing unrelated errors).

### Step 3: Final commit

```bash
git add -A
git commit -m "chore: cleanup stale timer imports after quota migration"
```

---

## Verification End-to-End

### Manual test flow

1. **Free user test:**
   - Login as free user
   - Go to assistant page
   - Verify: message counter badge visible in header ("10 messages restants")
   - Send a message → counter decrements to 9
   - Send 9 more messages → quota reached
   - On 11th send: pricing modal opens (frontend guard)
   - In DevTools Network: 429 from backend if someone bypasses frontend

2. **Premium user test:**
   - Login as premium user
   - Go to assistant page
   - Verify: no counter badge (unlimited)
   - Send messages freely

3. **Unauthenticated request test:**
   ```bash
   curl -X POST http://localhost:8000/api/assistant/cv-analyzer \
     -H "Content-Type: application/json" \
     -d '{"message": "test", "session_id": "abc", "assistant_type": "cv-analyzer"}'
   # Expected: 401 {"detail": "Missing or invalid authorization header"}
   ```

4. **Admin test:**
   - Go to `/admin/plans`
   - Verify: "Messages assistant/jour" field visible for each plan
   - Change free plan to 5
   - Logout and login as free user
   - Verify: counter shows "5 messages restants"

5. **Session expiry test (regression):**
   - Clear Supabase tokens in DevTools
   - Try to send a message
   - Expected: 401 → redirect to `/login?reason=token_expired` (not app crash)
