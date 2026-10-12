-- pipeline_runs: one row per job run, so reliability is visible (start, end, status, error).
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null check (job in ('daily_nav', 'weekly_report', 'manual_run', 'backfill')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  error       text,
  details     jsonb not null default '{}'::jsonb  -- e.g. which data source was used, rows written
);

create index if not exists pipeline_runs_job_started_idx
  on public.pipeline_runs (job, started_at desc);

-- Same security model as the other tables: RLS on, no public policies,
-- so only server code with the service role key can read or write.
alter table public.pipeline_runs enable row level security;

-- Make the API notice the new table straight away.
notify pgrst, 'reload schema';
