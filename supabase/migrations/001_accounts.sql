-- Stage 1: accounts.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Sign-in itself needs no tables (Supabase Auth keeps accounts in auth.users).
-- This adds the one thing the site needs on top: letting a signed-in person
-- delete their own account. Later stages' tables reference auth.users with
-- "on delete cascade", so deleting the account deletes their rows too.

create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

-- Only signed-in people may call it, and it only ever deletes the caller.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
