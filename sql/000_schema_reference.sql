-- REFERENCE ONLY. Rebuilt from the live Supabase database (column names/types read from its API,
-- keys and constraints confirmed by testing). The original schema.sql used to create the project is
-- the source of truth; this file lets someone set the project up from scratch.
-- Safe to run on an existing database ("if not exists"). Run sql/001_pipeline_runs.sql afterwards.

create extension if not exists pgcrypto;

create table if not exists public.funds (
  scheme_code     bigint primary key,
  name            text not null,
  fund_house      text,
  slot            text not null,
  benchmark_name  text,
  benchmark_symbol text,
  peer_codes      bigint[] not null default '{}',
  active          boolean not null default true,
  added_at        timestamptz not null default now()
);

create table if not exists public.nav_history (
  scheme_code bigint not null references public.funds (scheme_code),
  nav_date    date not null,
  nav         numeric not null,
  primary key (scheme_code, nav_date)
);

create table if not exists public.index_history (
  symbol     text not null,
  price_date date not null,
  close      numeric not null,
  primary key (symbol, price_date)
);

create table if not exists public.weekly_snapshots (
  id             uuid primary key default gen_random_uuid(),
  week_ending    date not null,
  scheme_code    bigint not null references public.funds (scheme_code),
  nav            numeric,
  ret_1w numeric, ret_1m numeric, ret_ytd numeric,
  bench_ret_1w numeric, bench_ret_1m numeric, bench_ret_ytd numeric,
  cat_avg_1w numeric, cat_avg_1m numeric, cat_avg_ytd numeric,
  market_part_1w numeric, fund_part_1w numeric,
  status         text,
  weeks_lagging  int not null default 0,
  summary        text,
  created_at     timestamptz not null default now(),
  unique (week_ending, scheme_code)
);

create table if not exists public.weekly_reports (
  week_ending    date primary key,
  verdict        text not null check (verdict in ('No action needed', 'One fund worth watching', 'Consider reviewing your allocation')),
  verdict_reason text not null,
  market_context jsonb,
  report_json    jsonb,
  created_at     timestamptz not null default now()
);

-- RLS on, no public policies: only server code with the service-role key can read or write.
alter table public.funds            enable row level security;
alter table public.nav_history      enable row level security;
alter table public.index_history    enable row level security;
alter table public.weekly_snapshots enable row level security;
alter table public.weekly_reports   enable row level security;
