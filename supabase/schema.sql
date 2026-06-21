-- ChurnLens — saved analysis history.
-- Run this in the Supabase SQL editor (or via the CLI) for the project whose
-- URL/anon key you put in .env.local.
--
-- Privacy note: this table stores ONLY aggregate results. Raw customer rows and
-- the per-customer at-risk list are never sent to the server — they stay in the
-- user's browser.

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  total_customers integer not null,
  at_risk_count integer not null,
  churn_rate double precision not null,
  revenue_at_risk double precision,
  model_f1 double precision not null,
  summary jsonb not null,
  recommendations jsonb not null,
  global_importance jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.analyses enable row level security;

drop policy if exists "Users can read their own analyses" on public.analyses;
create policy "Users can read their own analyses"
  on public.analyses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own analyses" on public.analyses;
create policy "Users can insert their own analyses"
  on public.analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own analyses" on public.analyses;
create policy "Users can delete their own analyses"
  on public.analyses for delete
  using (auth.uid() = user_id);

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);
