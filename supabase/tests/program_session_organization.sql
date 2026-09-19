-- P3.1 — fixed_days vs in_order on the same program engine.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('b3191941-0000-4000-8000-000000000001','p31-owner@example.test'),
 ('b3191941-0000-4000-8000-000000000002','p31-stranger@example.test'),
 ('b3191941-0000-4000-8000-000000000003','p31-coach@example.test'),
 ('b3191941-0000-4000-8000-000000000004','p31-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('b3191941-0000-4000-8000-000000000001','free','none'),
 ('b3191941-0000-4000-8000-000000000002','free','none'),
 ('b3191941-0000-4000-8000-000000000003','free','coach'),
 ('b3191941-0000-4000-8000-000000000004','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('b3191941-0000-4000-8000-000000000003','coach')
on conflict do nothing;

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('b3191941-0000-4000-8000-000000000010','b3191941-0000-4000-8000-000000000001','Legacy split','',8);

do $$ begin
  if (select session_organization from public.programs where id = 'b3191941-0000-4000-8000-000000000010')
     is distinct from 'fixed_days' then
    raise exception 'legacy program did not default to fixed_days';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- 6-arg save_program still works (DEFAULT organization keeps legacy).
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'Legacy split',
    '',
    8,
    '[{"weekday":1,"name":"Upper","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},{"weekday":3,"name":"Lower","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 2 then
    raise exception 'legacy save expected 2 days, got %', v_days;
  end if;
end $$;

-- Switch to in_order: weekdays must be stored as NULL.
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'ABC sequence',
    '',
    8,
    '[{"name":"A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},{"name":"B","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]},{"name":"C","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'in_order'
  );
  if v_days is distinct from 3 then
    raise exception 'in_order save expected 3 days, got %', v_days;
  end if;
end $$;
reset role;

do $$ begin
  if (select session_organization from public.programs where id = 'b3191941-0000-4000-8000-000000000010')
     is distinct from 'in_order' then
    raise exception 'session_organization not persisted';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'b3191941-0000-4000-8000-000000000010' and weekday is not null
  ) then
    raise exception 'in_order kept weekday values';
  end if;
  if (select count(*) from public.program_days where program_id = 'b3191941-0000-4000-8000-000000000010')
     is distinct from 3 then
    raise exception 'in_order days missing';
  end if;
  if not exists (
    select 1 from public.program_revisions r
    where r.program_id = 'b3191941-0000-4000-8000-000000000010'
      and r.snapshot->>'session_organization' = 'in_order'
      and jsonb_typeof(r.snapshot->'days') = 'array'
  ) then
    raise exception 'wrapped snapshot missing organization';
  end if;
end $$;

-- Duplicate weekday still refused in fixed_days.
set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'Dup',
    '',
    8,
    '[{"weekday":1,"name":"A","exercises":[{"name":"X","default_sets":1,"default_reps":1}]},{"weekday":1,"name":"B","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
    null,
    'fixed_days'
  );
  raise exception 'duplicate weekday was allowed';
exception
  when others then
    if sqlerrm not like '%Duplicate weekday%' then
      raise;
    end if;
end $$;

-- Invalid organization refused.
do $$
begin
  perform public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'Bad org',
    '',
    8,
    '[{"name":"A","exercises":[{"name":"X","default_sets":1,"default_reps":1}]}]'::jsonb,
    null,
    'sequence_mode'
  );
  raise exception 'invalid organization was allowed';
exception
  when others then
    if sqlerrm not like '%Invalid session organization%' then
      raise;
    end if;
end $$;
reset role;

-- Stranger cannot write.
set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'Hijack',
    '',
    8,
    '[{"name":"A","exercises":[{"name":"X","default_sets":1,"default_reps":1}]}]'::jsonb,
    null,
    'in_order'
  );
  raise exception 'stranger save_program was allowed';
exception
  when others then
    if sqlerrm not like '%Not program owner%' then
      raise;
    end if;
end $$;
reset role;

-- create_program_complete in_order + leftover coached owner still blocked.
insert into public.coach_client_links(coach_id, client_id, status)
values
  ('b3191941-0000-4000-8000-000000000003','b3191941-0000-4000-8000-000000000001','active'),
  ('b3191941-0000-4000-8000-000000000003','b3191941-0000-4000-8000-000000000004','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values ('b3191941-0000-4000-8000-000000000020','b3191941-0000-4000-8000-000000000010','b3191941-0000-4000-8000-000000000001','b3191941-0000-4000-8000-000000000001',current_date,'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'b3191941-0000-4000-8000-000000000010',
    'Should fail leftover',
    '',
    8,
    '[{"name":"A","exercises":[{"name":"X","default_sets":1,"default_reps":1}]}]'::jsonb,
    null,
    'in_order'
  );
  raise exception 'coached leftover save_program was allowed';
exception
  when others then
    if sqlerrm not like '%Coached client cannot edit assigned program%' then
      raise;
    end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_id uuid;
  v_nulls int;
begin
  v_id := public.create_program_complete(
    'Coach ABC',
    '',
    6,
    '[{"name":"A","exercises":[{"name":"Press","default_sets":3,"default_reps":5}]},{"name":"B","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    'b3191941-0000-4000-8000-000000000004',
    current_date,
    'in_order'
  );
  if v_id is null then
    raise exception 'create_program_complete in_order returned null';
  end if;
  select count(*) into v_nulls from public.program_days where program_id = v_id and weekday is null;
  if v_nulls is distinct from 2 then
    raise exception 'create in_order expected 2 null weekdays, got %', v_nulls;
  end if;
  if (select session_organization from public.programs where id = v_id) is distinct from 'in_order' then
    raise exception 'create_program_complete did not persist in_order';
  end if;
end $$;
reset role;

-- fork copies organization.
set local role authenticated;
select set_config('request.jwt.claim.sub','b3191941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b3191941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_src uuid;
  v_fork uuid;
begin
  select id into v_src from public.programs
  where owner_id = 'b3191941-0000-4000-8000-000000000003' and session_organization = 'in_order'
  limit 1;
  v_fork := public.fork_program(v_src, 'Forked ABC');
  if (select session_organization from public.programs where id = v_fork) is distinct from 'in_order' then
    raise exception 'fork lost session_organization';
  end if;
  if exists (select 1 from public.program_days where program_id = v_fork and weekday is not null) then
    raise exception 'fork invented weekdays';
  end if;
end $$;
reset role;

do $$ begin
  if has_function_privilege('anon', (
    select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_program'
    order by p.pronargs desc
    limit 1
  ), 'execute') then
    raise exception 'anonymous save_program execution allowed';
  end if;
  if has_function_privilege('anon', (
    select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'normalize_session_organization'
    limit 1
  ), 'execute') then
    raise exception 'anonymous normalize_session_organization execution allowed';
  end if;
end $$;

rollback;
\echo 'program session organization: legacy fixed_days, in_order null weekdays, leftover lock, fork copy'
