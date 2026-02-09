---
name: create-migration
description: Create Supabase database migration with rollback
user-invocable: true
disable-model-invocation: true
---

# Create Supabase Migration

Generate SQL migration file for Supabase database changes with automatic rollback.

## Usage

`/create-migration <description>`

Examples:
- `/create-migration add_user_preferences_table`
- `/create-migration add_job_saved_column`
- `/create-migration update_subscription_plans_data`

## What this skill does

1. 📝 Ask user for migration details
2. 🗄️ Generate SQL migration (up + down)
3. 💾 Save to `backend/supabase/migrations/`
4. ✅ Validate SQL syntax
5. 📋 Show preview before applying

## Steps

### 1. Gather Migration Details

Ask the user:
```
What type of migration?
1. Create table
2. Add column
3. Modify column
4. Drop table/column
5. Update data
6. Add index
7. Add RLS policy
```

Then ask specific details based on type.

### 2. Generate Migration SQL

**File naming convention:**
```
backend/supabase/migrations/YYYYMMDDHHMMSS_<description>.sql
```

Example: `20260209183000_add_user_preferences_table.sql`

**Template structure:**
```sql
-- Migration: Add user preferences table
-- Created: 2026-02-09 18:30:00
-- Author: Claude Code

-- UP Migration
BEGIN;

-- Your changes here
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

COMMIT;

-- DOWN Migration (Rollback)
BEGIN;

DROP TABLE IF EXISTS public.user_preferences CASCADE;

COMMIT;
```

### 3. Migration Templates

#### A. Create Table
```sql
CREATE TABLE IF NOT EXISTS public.table_name (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- columns here
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rollback
DROP TABLE IF EXISTS public.table_name CASCADE;
```

#### B. Add Column
```sql
ALTER TABLE public.table_name
ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;

-- Rollback
ALTER TABLE public.table_name
DROP COLUMN IF EXISTS column_name;
```

#### C. Add Index
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name
ON public.table_name(column_name);

-- Rollback
DROP INDEX IF EXISTS idx_name;
```

#### D. RLS Policy
```sql
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy_name"
    ON public.table_name FOR SELECT
    USING (auth.uid() = user_id);

-- Rollback
DROP POLICY IF EXISTS "policy_name" ON public.table_name;
ALTER TABLE public.table_name DISABLE ROW LEVEL SECURITY;
```

### 4. Validate SQL

Check for common issues:
```bash
# Syntax check (if psql available)
psql -d postgres -f migration.sql --dry-run

# Or validate structure
grep -E "BEGIN|COMMIT|CREATE|ALTER|DROP" migration.sql
```

### 5. Show Preview

```
📋 Migration Preview
====================

File: backend/supabase/migrations/20260209183000_add_user_preferences_table.sql

✅ UP Migration:
   - CREATE TABLE user_preferences
   - CREATE INDEX idx_user_preferences_user_id
   - ENABLE RLS
   - CREATE POLICY for SELECT
   - CREATE POLICY for UPDATE

✅ DOWN Migration:
   - DROP TABLE user_preferences CASCADE

⚠️  IMPORTANT:
   - This will modify production database
   - Backup recommended before applying
   - Test in development first

Apply this migration? (yes/no)
```

### 6. Apply Migration (Optional)

If user confirms:
```bash
# Local Supabase
supabase db reset

# Production (via Supabase CLI)
supabase db push
```

## Best Practices

### Always Include:
1. ✅ IF EXISTS / IF NOT EXISTS checks
2. ✅ Rollback (DOWN) migration
3. ✅ Comments explaining changes
4. ✅ RLS policies for new tables
5. ✅ Indexes for foreign keys
6. ✅ ON DELETE CASCADE for user refs

### Never Do:
1. ❌ DROP column without rollback plan
2. ❌ Remove RLS policies
3. ❌ Forget timestamps (created_at, updated_at)
4. ❌ Skip validation
5. ❌ Apply to production without testing

## Common Migration Scenarios

### Scenario 1: Add feature flag column
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;
```

### Scenario 2: Rename column (safe way)
```sql
-- Step 1: Add new column
ALTER TABLE public.table_name
ADD COLUMN new_name TYPE;

-- Step 2: Copy data
UPDATE public.table_name SET new_name = old_name;

-- Step 3: Drop old column (in separate migration)
ALTER TABLE public.table_name DROP COLUMN old_name;
```

### Scenario 3: Add enum type
```sql
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due');

ALTER TABLE public.user_subscriptions
ADD COLUMN status subscription_status DEFAULT 'active';
```

## Integration with Deployment

Add to deploy checklist:
```bash
# Check for pending migrations
ls -la backend/supabase/migrations/

# Apply migrations
supabase db push

# Verify applied
supabase db diff
```

## Related Skills

- `/deploy-check` - Pre-deployment validation
- `/security-check` - Security audit
