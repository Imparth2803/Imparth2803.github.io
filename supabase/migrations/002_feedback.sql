-- Stage 2: feedback on the tools.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Signed-in people can add feedback, but nobody can read it through the
-- site, not even their own. Read it in the dashboard (Table Editor ->
-- feedback). Deleting an account deletes that person's feedback.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- The tool's slug, e.g. 'text-splitter'.
  tool text not null check (tool ~ '^[a-z0-9-]{1,60}$'),
  -- 1 = not useful ... 5 = very useful.
  rating smallint check (rating between 1 and 5),
  comment text check (char_length(comment) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint feedback_has_content check (rating is not null or comment is not null)
);

create index feedback_by_user_time on public.feedback (user_id, created_at);
create index feedback_by_tool_time on public.feedback (tool, created_at);

alter table public.feedback enable row level security;

-- How much feedback the caller has sent in the last day. It runs with the
-- table owner's rights, because callers can't read the table themselves.
create or replace function public.feedback_sent_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.feedback
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';
$$;

revoke execute on function public.feedback_sent_today() from public, anon;
grant execute on function public.feedback_sent_today() to authenticated;

-- People add their own feedback only, at most 20 a day.
create policy "Signed-in people add their own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.feedback_sent_today() < 20
  );

-- Only these three columns can be filled in from the site. The id, the
-- person and the time are always set by the database.
revoke all on public.feedback from anon, authenticated;
grant insert (tool, rating, comment) on public.feedback to authenticated;
