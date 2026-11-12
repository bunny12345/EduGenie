-- School-wide display period only; existing learning evidence remains cumulative.
create table public.school_progress_periods (
  school_id uuid primary key references public.schools(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  constraint school_progress_period_order check (end_date >= start_date),
  constraint school_progress_period_length check (
    (extract(year from end_date) - extract(year from start_date)) * 12
      + extract(month from end_date) - extract(month from start_date) < 24
  )
);

alter table public.school_progress_periods enable row level security;
revoke all on public.school_progress_periods from public, anon, authenticated;
grant all on public.school_progress_periods to service_role;
