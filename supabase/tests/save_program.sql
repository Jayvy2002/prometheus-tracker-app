-- UX20 — save_program est atomique (métadonnées + jours) et refuse le stale.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a1780000-0000-4000-8000-000000000001','ux20-owner@example.test'),
 ('a1780000-0000-4000-8000-000000000002','ux20-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1780000-0000-4000-8000-000000000001','free','coach'),
 ('a1780000-0000-4000-8000-000000000002','free','coach')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('a1780000-0000-4000-8000-000000000010','a1780000-0000-4000-8000-000000000001','Old name','',8),
 ('a1780000-0000-4000-8000-000000000011','a1780000-0000-4000-8000-000000000001','Atomic name','',8);

do $$ begin
  if has_function_privilege('anon', (
    select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_program'
    limit 1
  ), 'execute') then
    raise exception 'anonymous save_program execution allowed';
  end if;
  if not has_function_privilege('authenticated', (
    select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_program'
    limit 1
  ), 'execute') then
    raise exception 'authenticated cannot execute save_program';
  end if;
end $$;

-- Owner: metadata + days + revision in one call.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1780000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_days int;
  v_seen timestamptz;
begin
  select updated_at into v_seen
  from public.programs
  where id = 'a1780000-0000-4000-8000-000000000010';

  v_days := public.save_program(
    'a1780000-0000-4000-8000-000000000010',
    'New name',
    'Desc',
    6,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    v_seen
  );
  if v_days is distinct from 1 then
    raise exception 'expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1780000-0000-4000-8000-000000000010')
     is distinct from 'New name' then
    raise exception 'name not updated';
  end if;
  if (select duration_weeks from public.programs where id = 'a1780000-0000-4000-8000-000000000010')
     is distinct from 6 then
    raise exception 'weeks not updated';
  end if;
  if not exists (
    select 1 from public.program_days d
    join public.program_day_exercises e on e.program_day_id = d.id
    where d.program_id = 'a1780000-0000-4000-8000-000000000010'
      and d.weekday = 1 and e.name = 'Bench'
  ) then
    raise exception 'days/exercises missing after save_program';
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = 'a1780000-0000-4000-8000-000000000010'
  ) then
    raise exception 'revision not snapshotted';
  end if;
end $$;

-- Stale expected_updated_at refuses and leaves the previous write intact.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1780000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_old timestamptz := '2000-01-01 00:00:00+00';
begin
  perform public.save_program(
    'a1780000-0000-4000-8000-000000000010',
    'Should not stick',
    '',
    12,
    '[{"weekday":2,"name":"Pull","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    v_old
  );
  raise exception 'stale save_program was allowed';
exception
  when others then
    if sqlerrm not like '%stale%' then
      raise;
    end if;
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1780000-0000-4000-8000-000000000010')
     is distinct from 'New name' then
    raise exception 'stale write mutated name';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'a1780000-0000-4000-8000-000000000010' and weekday = 2
  ) then
    raise exception 'stale write mutated days';
  end if;
end $$;

-- Other user cannot save.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1780000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'a1780000-0000-4000-8000-000000000010',
    'Hijack',
    '',
    8,
    '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
    null
  );
  raise exception 'non-owner save_program was allowed';
exception
  when others then
    if sqlerrm not like '%Not program owner%' then
      raise;
    end if;
end $$;
reset role;

-- Metadata update rolls back when a day exercise insert fails.
create or replace function public.save_program_test_fail()
returns trigger language plpgsql as $$
begin
  if new.name = '__ATOMIC_FAIL__' then
    raise exception 'ATOMIC_FAIL';
  end if;
  return new;
end;
$$;
drop trigger if exists save_program_test_fail_trg on public.program_day_exercises;
create trigger save_program_test_fail_trg
  before insert on public.program_day_exercises
  for each row execute function public.save_program_test_fail();

set local role authenticated;
select set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1780000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'a1780000-0000-4000-8000-000000000011',
    'Should rollback',
    '',
    4,
    '[{"weekday":3,"name":"Legs","exercises":[{"name":"__ATOMIC_FAIL__","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  raise exception 'failed exercise still committed save_program';
exception
  when others then
    if sqlerrm not like '%ATOMIC_FAIL%' then
      raise;
    end if;
end $$;
reset role;

drop trigger if exists save_program_test_fail_trg on public.program_day_exercises;
drop function if exists public.save_program_test_fail();

do $$ begin
  if (select name from public.programs where id = 'a1780000-0000-4000-8000-000000000011')
     is distinct from 'Atomic name' then
    raise exception 'partial save left metadata updated';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'a1780000-0000-4000-8000-000000000011'
  ) then
    raise exception 'partial save left days';
  end if;
end $$;

rollback;
\echo 'save_program atomic + stale guard passed'
