-- ============================================
-- HUNTZEN JOBSEARCH - SUPABASE SCHEMA
-- ============================================
-- Execute this in Supabase SQL Editor
-- Dashboard > SQL Editor > New Query

-- ============================================
-- 1. TABLE PROFILES (Extension de auth.users)
-- ============================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  preferred_language text default 'fr',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger pour créer automatiquement un profil
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if exists
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 2. TABLE JOB_SEARCHES (Historique recherches)
-- ============================================
create table if not exists public.job_searches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  job_title text not null,
  country_code text,
  city text,
  contract_type text,
  results_count integer default 0,
  query_params jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists job_searches_user_id_idx on public.job_searches(user_id);
create index if not exists job_searches_created_at_idx on public.job_searches(created_at desc);

-- ============================================
-- 3. TABLE CV_ANALYSES (Historique analyses CV)
-- ============================================
create table if not exists public.cv_analyses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  file_name text,
  file_type text, -- 'pdf', 'docx', 'text'
  cv_text text,
  job_description text,
  analysis_result jsonb,
  match_score integer,
  language text default 'fr',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists cv_analyses_user_id_idx on public.cv_analyses(user_id);
create index if not exists cv_analyses_created_at_idx on public.cv_analyses(created_at desc);

-- ============================================
-- 4. TABLE COACH_CONVERSATIONS (Historique coach)
-- Sprint 5: Enhanced with metadata columns for history feature
-- ============================================
create table if not exists public.coach_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  session_id text not null,
  messages jsonb default '[]'::jsonb,
  context jsonb, -- job search context, cv context, etc.

  -- Sprint 5: Metadata columns
  title text, -- Auto-generated intelligent title (max 60 chars)
  is_favorite boolean default false not null,
  message_count integer generated always as (
    case
      when jsonb_typeof(messages) = 'array' then jsonb_array_length(messages)
      else 0
    end
  ) stored,
  last_message_at timestamp with time zone, -- Auto-updated by trigger

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists coach_conversations_user_id_idx on public.coach_conversations(user_id);
create index if not exists coach_conversations_session_id_idx on public.coach_conversations(session_id);

-- Sprint 5: Additional indexes for search and filtering
create index if not exists coach_conversations_title_gin_idx
  on public.coach_conversations using gin (to_tsvector('french', coalesce(title, '')));
create index if not exists coach_conversations_is_favorite_idx
  on public.coach_conversations(user_id, is_favorite) where is_favorite = true;
create index if not exists coach_conversations_last_message_idx
  on public.coach_conversations(user_id, last_message_at desc);

-- ============================================
-- 5. TABLE SAVED_JOBS (Jobs sauvegardés)
-- ============================================
create table if not exists public.saved_jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  job_data jsonb not null, -- titre, company, url, etc.
  source text, -- 'adzuna', 'serpapi', 'indeed', etc.
  notes text,
  status text default 'saved', -- 'saved', 'applied', 'interview', 'rejected', 'offer'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, (job_data->>'url'))
);

create index if not exists saved_jobs_user_id_idx on public.saved_jobs(user_id);
create index if not exists saved_jobs_status_idx on public.saved_jobs(status);

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Activer RLS sur toutes les tables
alter table public.profiles enable row level security;
alter table public.job_searches enable row level security;
alter table public.cv_analyses enable row level security;
alter table public.coach_conversations enable row level security;
alter table public.saved_jobs enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own job searches" on public.job_searches;
drop policy if exists "Users can insert own job searches" on public.job_searches;
drop policy if exists "Users can delete own job searches" on public.job_searches;
drop policy if exists "Users can view own cv analyses" on public.cv_analyses;
drop policy if exists "Users can insert own cv analyses" on public.cv_analyses;
drop policy if exists "Users can delete own cv analyses" on public.cv_analyses;
drop policy if exists "Users can view own conversations" on public.coach_conversations;
drop policy if exists "Users can insert own conversations" on public.coach_conversations;
drop policy if exists "Users can update own conversations" on public.coach_conversations;
drop policy if exists "Users can view own saved jobs" on public.saved_jobs;
drop policy if exists "Users can insert own saved jobs" on public.saved_jobs;
drop policy if exists "Users can update own saved jobs" on public.saved_jobs;
drop policy if exists "Users can delete own saved jobs" on public.saved_jobs;

-- Policies pour profiles
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Policies pour job_searches
create policy "Users can view own job searches"
  on public.job_searches for select
  using (auth.uid() = user_id);

create policy "Users can insert own job searches"
  on public.job_searches for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own job searches"
  on public.job_searches for delete
  using (auth.uid() = user_id);

-- Policies pour cv_analyses
create policy "Users can view own cv analyses"
  on public.cv_analyses for select
  using (auth.uid() = user_id);

create policy "Users can insert own cv analyses"
  on public.cv_analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own cv analyses"
  on public.cv_analyses for delete
  using (auth.uid() = user_id);

-- Policies pour coach_conversations (Sprint 5: Added DELETE policy)
create policy "Users can view own conversations"
  on public.coach_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.coach_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.coach_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.coach_conversations for delete
  using (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.coach_conversations for update
  using (auth.uid() = user_id);

-- Policies pour saved_jobs
create policy "Users can view own saved jobs"
  on public.saved_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved jobs"
  on public.saved_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved jobs"
  on public.saved_jobs for update
  using (auth.uid() = user_id);

create policy "Users can delete own saved jobs"
  on public.saved_jobs for delete
  using (auth.uid() = user_id);

-- ============================================
-- SPRINT 5: TRIGGERS FOR AUTO-UPDATE
-- Automatically update updated_at and last_message_at
-- ============================================
create or replace function public.update_coach_conversation_metadata()
returns trigger as $$
begin
  new.updated_at = now();

  -- Update last_message_at from last message timestamp
  if jsonb_typeof(new.messages) = 'array' and jsonb_array_length(new.messages) > 0 then
    new.last_message_at = (new.messages->-1->>'timestamp')::timestamptz;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger update_coach_conversations_metadata
  before insert or update on public.coach_conversations
  for each row
  execute function public.update_coach_conversation_metadata();

-- Add column comments for documentation
comment on column public.coach_conversations.title is 'Auto-generated conversation title (max 60 chars)';
comment on column public.coach_conversations.is_favorite is 'User-marked favorite conversations';
comment on column public.coach_conversations.message_count is 'Computed: number of messages in conversation';
comment on column public.coach_conversations.last_message_at is 'Auto-updated: timestamp of last message';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
-- If you see this, the schema was created successfully!
select 'HuntZen schema created successfully!' as status;
