-- M3 — choose_account_intent : préférence, pas de lien, capacité préservée, rollback atomique.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a1790000-0000-4000-8000-000000000001','intent-a@example.test'),
 ('a1790000-0000-4000-8000-000000000002','intent-b@example.test');

do $$ begin
  if has_function_privilege('anon','public.choose_account_intent(text)','execute') then
    raise exception 'anonymous intention write exposed';
  end if;
  if not has_function_privilege('authenticated','public.choose_account_intent(text)','execute') then
    raise exception 'authenticated cannot choose an intention';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1790000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1790000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare r jsonb; begin
  r := public.choose_account_intent('find_coach');
  if r->>'coaching_role' <> 'none' then raise exception 'search granted a role'; end if;
  if r->>'intent' is distinct from 'find_coach' then raise exception 'intention not returned'; end if;
  if not exists (
    select 1 from public.user_profiles
    where id = auth.uid() and entry_intent = 'find_coach'
  ) then raise exception 'intention not persisted'; end if;
  if exists (select 1 from public.coach_client_links where client_id = auth.uid()) then
    raise exception 'search created coaching link';
  end if;
  r := public.choose_account_intent('coach');
  if r->>'coaching_role' <> 'coach' then raise exception 'coach capability missing'; end if;
  r := public.choose_account_intent('solo');
  if r->>'coaching_role' <> 'coach' then raise exception 'preference removed professional capability'; end if;
  begin
    perform public.choose_account_intent('admin');
    raise exception 'invalid intention granted';
  exception when others then
    if sqlerrm <> 'invalid_intent' then raise; end if;
  end;
end $$;
reset role;

create function public.intent_injected_failure() returns trigger language plpgsql as $$
begin
  if new.id = 'a1790000-0000-4000-8000-000000000002' and new.entry_intent = 'coach' then
    raise exception 'injected_profile_failure';
  end if;
  return new;
end $$;
create trigger intent_injected_failure
  before update on public.user_profiles
  for each row execute function public.intent_injected_failure();

set local role authenticated;
select set_config('request.jwt.claim.sub','a1790000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1790000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.choose_account_intent('coach');
    raise exception 'injection did not fail';
  exception when others then
    if sqlerrm <> 'injected_profile_failure' then raise; end if;
  end;
  if exists (select 1 from public.user_capabilities where user_id = auth.uid()) then
    raise exception 'partial capability grant';
  end if;
  if exists (
    select 1 from public.user_profiles
    where id = auth.uid() and entry_intent is not null
  ) then raise exception 'partial profile change'; end if;
end $$;
reset role;

do $$ begin
  if exists (
    select 1 from public.user_roles
    where user_id = 'a1790000-0000-4000-8000-000000000002'
      and coaching_role is distinct from 'none'
  ) then
    raise exception 'partial role update';
  end if;
end $$;

rollback;
\echo 'entry intention: preference, no synthetic link, preserved capability and atomic rollback passed'
