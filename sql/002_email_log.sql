-- email_log: one row per Saturday email, so the same week is never emailed twice (even if a job re-runs).
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  week_ending date not null,
  kind        text not null default 'weekly_report' check (kind in ('weekly_report', 'test')),
  recipients  integer not null default 0,           -- how many addresses (the addresses themselves are not stored)
  status      text not null check (status in ('sending', 'sent', 'failed')),
  provider_id text,                                  -- Resend's id for the email
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- At most ONE weekly email per week can be "sending" or "sent". A failed attempt does not block a retry.
create unique index if not exists email_log_one_weekly_per_week
  on public.email_log (week_ending)
  where kind = 'weekly_report' and status in ('sending', 'sent');

alter table public.email_log enable row level security;  -- no public policies: server code only

notify pgrst, 'reload schema';
