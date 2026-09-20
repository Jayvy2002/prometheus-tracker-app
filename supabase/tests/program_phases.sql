-- P3.2 — optional phases on the single program engine.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3291941-0000-4000-8000-000000000001','p32-owner@example.test'),
 ('c3291941-0000-4000-8000-000000000002','p32-stranger@example.test'),
 ('c3291941-0000-4000-8000-000000000003','p32-coach@example.test'),
 ('c3291941-0000-4000-8000-000000000004','p32-client@example.test'),
 ('c3291941-0000-4000-8000-000000000005','p32-dual@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3291941-0000-4000-8000-000000000001','free','none'),
 ('c3291941-0000-4000-8000-000000000002','free','none'),
 ('c3291941-0000-4000-8000-000000000003','free','coach'),
 ('c3291941-0000-4000-8000-000000000004','free','none'),
 ('c3291941-0000-4000-8000-000000000005','free','coach')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3291941-0000-4000-8000-000000000003','coach'),
 ('c3291941-0000-4000-8000-000000000005','coach')
on conflict do nothing;

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3291941-0000-4000-8000-000000000010','c3291941-0000-4000-8000-000000000001','Simple split','',12);

do $$ begin
  if exists (select 1 from public.program_phases where program_id = 'c3291941-0000-4000-8000-000000000010') then
    raise exception 'legacy program invented phases';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Simple program: empty phases, days stay phase-less. 7-arg save still works.
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'c3291941-0000-4000-8000-000000000010',
    'Simple split',
    '',
    12,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},{"weekday":3,"name":"Pull","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]},{"weekday":5,"name":"Legs","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  if v_days is distinct from 3 then
    raise exception 'simple save expected 3 days, got %', v_days;
  end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.program_phases where program_id = 'c3291941-0000-4000-8000-000000000010') then
    raise exception 'simple save created phases';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'c3291941-0000-4000-8000-000000000010' and phase_id is not null
  ) then
    raise exception 'simple days linked to a phase';
  end if;
end $$;

-- Periodized: accumulation / intensification / deload (same engine, variable duration).
set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'c3291941-0000-4000-8000-000000000010',
    'Periodized',
    '',
    9,
    '[{"id":null,"weekday":1,"name":"Push","phase_id":"c3291941-0000-4000-8000-0000000000a1","exercises":[{"name":"Bench","default_sets":4,"default_reps":8}]},{"weekday":3,"name":"Pull","phase_id":"c3291941-0000-4000-8000-0000000000a2","exercises":[{"name":"Row","default_sets":5,"default_reps":5}]},{"weekday":5,"name":"Deload lower","phase_id":"c3291941-0000-4000-8000-0000000000a3","exercises":[{"name":"Squat","default_sets":2,"default_reps":8,"default_rir":4}]}]'::jsonb,
    null,
    'fixed_days',
    '[
      {"id":"c3291941-0000-4000-8000-0000000000a1","name":"Accumulation","description":"volume","duration_weeks":4},
      {"id":"c3291941-0000-4000-8000-0000000000a2","name":"Intensification","description":"load","duration_weeks":4},
      {"id":"c3291941-0000-4000-8000-0000000000a3","name":"Deload","description":"taper","duration_weeks":1}
    ]'::jsonb
  );
  if v_days is distinct from 3 then
    raise exception 'periodized save expected 3 days, got %', v_days;
  end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.program_phases where program_id = 'c3291941-0000-4000-8000-000000000010')
     is distinct from 3 then
    raise exception 'expected 3 phases';
  end if;
  if (select name from public.program_phases where id = 'c3291941-0000-4000-8000-0000000000a3')
     is distinct from 'Deload' then
    raise exception 'deload is not a separate engine — name missing';
  end if;
  if (select array_agg(name order by order_index) from public.program_phases
        where program_id = 'c3291941-0000-4000-8000-000000000010')
     is distinct from array['Accumulation','Intensification','Deload'] then
    raise exception 'phase order wrong';
  end if;
  if (select d.phase_id from public.program_days d
        where d.program_id = 'c3291941-0000-4000-8000-000000000010' and d.name = 'Push')
     is distinct from 'c3291941-0000-4000-8000-0000000000a1' then
    raise exception 'push not on accumulation';
  end if;
  if not exists (
    select 1 from public.program_revisions r
    where r.program_id = 'c3291941-0000-4000-8000-000000000010'
      and jsonb_array_length(r.snapshot->'phases') = 3
      and r.snapshot->'days'->0 ? 'phase_id'
  ) then
    raise exception 'snapshot missing phases';
  end if;
end $$;

-- Same engine in_order + phases. History stamp on logger.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_assign uuid;
  v_day uuid;
  v_workout uuid;
  v_stamped text;
begin
  perform public.save_program(
    'c3291941-0000-4000-8000-000000000010',
    'Periodized sequence',
    '',
    9,
    '[{"name":"A","phase_id":"c3291941-0000-4000-8000-0000000000a1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},{"name":"B","phase_id":"c3291941-0000-4000-8000-0000000000a2","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'in_order',
    '[
      {"id":"c3291941-0000-4000-8000-0000000000a1","name":"Accumulation","duration_weeks":4},
      {"id":"c3291941-0000-4000-8000-0000000000a2","name":"Intensification","duration_weeks":4}
    ]'::jsonb
  );

  v_assign := public.assign_program_secure(
    'c3291941-0000-4000-8000-000000000010',
    'c3291941-0000-4000-8000-000000000001',
    current_date
  );
  select id into v_day from public.program_days
    where program_id = 'c3291941-0000-4000-8000-000000000010' and name = 'A';

  v_workout := public.start_workout_from_template(
    'A',
    now(),
    null,
    v_assign,
    v_day,
    '[{"name":"Bench","default_sets":3,"default_reps":5}]'::jsonb
  );
  select prescribed_phase_name into v_stamped from public.workouts where id = v_workout;
  if v_stamped is distinct from 'Accumulation' then
    raise exception 'logger did not stamp phase, got %', v_stamped;
  end if;

  -- Future phase rewrite must not change the logged name.
  perform public.save_program(
    'c3291941-0000-4000-8000-000000000010',
    'Periodized sequence',
    '',
    9,
    '[{"name":"A","phase_id":"c3291941-0000-4000-8000-0000000000a2","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},{"name":"B","phase_id":"c3291941-0000-4000-8000-0000000000a2","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'in_order',
    '[
      {"id":"c3291941-0000-4000-8000-0000000000a1","name":"Accumulation","duration_weeks":4},
      {"id":"c3291941-0000-4000-8000-0000000000a2","name":"Peak","duration_weeks":4}
    ]'::jsonb
  );
  if (select prescribed_phase_name from public.workouts where id = v_workout)
     is distinct from 'Accumulation' then
    raise exception 'logged phase was rewritten';
  end if;
end $$;
reset role;

-- Stranger cannot write phases.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
  perform public.sync_program_phases(
    'c3291941-0000-4000-8000-000000000010',
    '[{"name":"Hijack","duration_weeks":1}]'::jsonb
  );
  raise exception 'stranger sync_program_phases was allowed';
exception
  when others then
    if sqlerrm like '%stranger sync_program_phases was allowed%' then
      raise;
    elsif sqlerrm not like '%Not program owner%'
          and sqlerrm not like '%permission denied%' then
      raise;
    end if;
end $$;
reset role;

-- Coach + leftover Coaché: dual identity cannot edit own assigned plan phases.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3291941-0000-4000-8000-000000000012','c3291941-0000-4000-8000-000000000005','Dual leftover','',8),
 ('c3291941-0000-4000-8000-000000000013','c3291941-0000-4000-8000-000000000005','Roster plan','',8);
insert into public.coach_client_links(id,coach_id,client_id,status)
values ('c3291941-0000-4000-8000-0000000000aa','c3291941-0000-4000-8000-000000000003','c3291941-0000-4000-8000-000000000005','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values
 ('c3291941-0000-4000-8000-0000000000b1','c3291941-0000-4000-8000-000000000012','c3291941-0000-4000-8000-000000000005','c3291941-0000-4000-8000-000000000003',current_date,'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'c3291941-0000-4000-8000-000000000012',
    'Hijack leftover',
    '',
    8,
    '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
    null,
    'fixed_days',
    '[{"name":"Nope","duration_weeks":1}]'::jsonb
  );
  raise exception 'dual leftover phase save was allowed';
exception
  when others then
    if sqlerrm not like '%Coached client cannot edit assigned program%' then
      raise;
    end if;
end $$;

do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'c3291941-0000-4000-8000-000000000013',
    'Roster plan',
    '',
    8,
    '[{"weekday":2,"name":"Upper","phase_id":"c3291941-0000-4000-8000-0000000000c1","exercises":[{"name":"Press","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'fixed_days',
    '[{"id":"c3291941-0000-4000-8000-0000000000c1","name":"Block 1","duration_weeks":4}]'::jsonb
  );
  if v_days is distinct from 1 then
    raise exception 'dual roster phase save expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

-- Fork copies phases onto a new program without rewriting source history.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3291941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3291941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_fork uuid;
begin
  v_fork := public.fork_program('c3291941-0000-4000-8000-000000000010', 'Forked phases');
  if (select count(*) from public.program_phases where program_id = v_fork) is distinct from 2 then
    raise exception 'fork did not copy phases';
  end if;
  if exists (
    select 1 from public.program_phases
    where program_id = v_fork and id in (
      'c3291941-0000-4000-8000-0000000000a1',
      'c3291941-0000-4000-8000-0000000000a2'
    )
  ) then
    raise exception 'fork reused source phase ids';
  end if;
end $$;
reset role;

-- Grants: new RPC is not PUBLIC; métier save_program 8-arg is authenticated.
do $$
declare
  v_oid oid;
begin
  v_oid := to_regprocedure('public.sync_program_phases(uuid,jsonb)');
  if v_oid is null then raise exception 'sync_program_phases missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'sync_program_phases granted to anon';
  end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'sync_program_phases granted to authenticated';
  end if;
  v_oid := to_regprocedure('public.save_program(uuid,text,text,int,jsonb,timestamptz,text,jsonb)');
  if v_oid is null then raise exception 'save_program 8-arg missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'save_program 8-arg granted to anon';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'save_program 8-arg missing authenticated execute';
  end if;
  if to_regprocedure('public.save_program(uuid,text,text,int,jsonb,timestamptz,text)') is not null then
    raise exception 'stale 7-arg save_program still present';
  end if;
end $$;

\echo 'program phases: simple optional, periodized same engine, deload is a phase, logger stamps, leftover lock, fork copies'

commit;
