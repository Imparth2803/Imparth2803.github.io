-- Stage 3: usage records (what people do in the tools, never what they
-- work on).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Signed-in people's pages add rows; nobody can read them through the site.
-- Read them in the dashboard (Table Editor -> usage_events). Deleting an
-- account deletes that person's records.
--
-- Actions: open, files_added, text_pasted, task, batch, download, copy, crash.
-- details only ever holds numbers, true/false and short lowercase words
-- (enforced below), so file names, text and messages can't be stored.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- Groups the records from one visit to one tool page.
  page_session uuid not null,
  tool text not null check (tool ~ '^[a-z0-9-]{1,60}$'),
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  details jsonb not null default '{}'::jsonb,
  -- When it happened in the browser (records are sent in batches).
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint usage_details_are_simple check (
    jsonb_typeof(details) = 'object'
    and pg_column_size(details) <= 1024
    -- Every value is a number, true/false or a short lowercase word.
    and not jsonb_path_exists(
      details,
      '$.* ? (@.type() != "number" && @.type() != "boolean" && @.type() != "string")'
    )
    and not jsonb_path_exists(
      details,
      '$.* ? (@.type() == "string" && !(@ like_regex "^[a-z0-9_]{1,32}$"))'
    )
  )
);

create index usage_by_user_time on public.usage_events (user_id, created_at);
create index usage_by_tool_time on public.usage_events (tool, occurred_at);

alter table public.usage_events enable row level security;

-- How many records the caller has sent in the last day. It runs with the
-- table owner's rights, because callers can't read the table themselves.
create or replace function public.usage_sent_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.usage_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';
$$;

revoke execute on function public.usage_sent_today() from public, anon;
grant execute on function public.usage_sent_today() to authenticated;

-- People add their own records only: dated within the last two days (not
-- the future), and at most 5,000 a day.
create policy "Signed-in people add their own usage records"
  on public.usage_events
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and occurred_at > now() - interval '2 days'
    and occurred_at < now() + interval '10 minutes'
    and public.usage_sent_today() < 5000
  );

-- Only these columns can be filled in from the site. The id, the person and
-- the time it arrived are always set by the database.
revoke all on public.usage_events from anon, authenticated;
grant insert (page_session, tool, action, details, occurred_at)
  on public.usage_events to authenticated;
