-- P3 hardening — phase engine, weekdays, logger, civil date, relation end, Data API, versions.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401941-0000-4000-8000-000000000001','p3h-owner@example.test'),
 ('c3401941-0000-4000-8000-000000000002','p3h-stranger@example.test'),
 ('c3401941-0000-4000-8000-000000000003','p3h-coach@example.test'),
 ('c3401941-0000-4000-8000-000000000004','p3h-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401941-0000-4000-8000-000000000001','free','none'),
 ('c3401941-0000-4000-8000-000000000002','free','none'),
 ('c3401941-0000-4000-8000-000000000003','free','coach'),
 ('c3401941-0000-4000-8000-000000000004','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401941-0000-4000-8000-000000000003','coach')
on conflict do nothing;

update public.user_profiles
   set timezone = 'America/Toronto'
 where id = 'c3401941-0000-4000-8000-000000000004';
update public.user_profiles
   set timezone = 'UTC'
 where id in (
   'c3401941-0000-4000-8000-000000000001',
   'c3401941-0000-4000-8000-000000000003'
 );

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3401941-0000-4000-8000-000000000010','c3401941-0000-4000-8000-000000000001','Periodized','',9),
 ('c3401941-0000-4000-8000-000000000011','c3401941-0000-4000-8000-000000000003','Coach plan','Version A',8);

-- Sunday 20:30 Toronto is still Sunday; UTC is already Monday.
do $$
declare
  v_at timestamptz := timestamptz '2026-09-21 00:30:00+00';
  v_civil date;
begin
  v_civil := public.program_civil_date('America/Toronto', v_at);
  if v_civil is distinct from date '2026-09-20' then
    raise exception 'Toronto Sunday evening civil date expected 2026-09-20, got %', v_civil;
  end if;
  if public.program_civil_date('UTC', v_at) is distinct from date '2026-09-21' then
    raise exception 'UTC civil date expected 2026-09-21';
  end if;
  if public.program_version_is_due(date '2026-09-21', 'America/Toronto', v_at) then
    raise exception 'Monday version was due Sunday evening in Toronto';
  end if;
  if not public.program_version_is_due(
    date '2026-09-21',
    'America/Toronto',
    timestamptz '2026-09-21 04:00:00+00'
  ) then
    raise exception 'Monday 00:00 EDT should be due';
  end if;
  -- UTC CURRENT_DATE is not the activation clock when Toronto is still yesterday.
  if public.program_civil_date('America/Toronto', now()) is distinct from current_date
     and public.program_version_is_due(current_date, 'America/Toronto', now()) then
    raise exception 'UTC current_date was due in Toronto while civil dates differ';
  end if;
end $$;

-- Data API graph writes are closed.
do $$
begin
  if has_table_privilege('authenticated', 'public.program_days', 'insert')
     or has_table_privilege('authenticated', 'public.program_days', 'update')
     or has_table_privilege('authenticated', 'public.program_days', 'delete')
     or has_table_privilege('authenticated', 'public.program_day_exercises', 'insert')
     or has_table_privilege('authenticated', 'public.program_phases', 'insert')
     or has_table_privilege('authenticated', 'public.programs', 'insert')
     or has_table_privilege('authenticated', 'public.programs', 'update') then
    raise exception 'authenticated still has Data API graph writes';
  end if;
  if not has_table_privilege('authenticated', 'public.programs', 'select')
     or not has_table_privilege('authenticated', 'public.programs', 'delete')
     or not has_table_privilege('authenticated', 'public.program_days', 'select') then
    raise exception 'authenticated lost required SELECT/DELETE';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.apply_program_revision_snapshot(uuid,int)',
    'execute'
  ) then
    raise exception 'apply snapshot exposed to authenticated';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.validate_program_graph_payload(text,jsonb,jsonb)',
    'execute'
  ) then
    raise exception 'validator exposed to authenticated';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Same weekday in three phases (real periodization).
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'c3401941-0000-4000-8000-000000000010',
    'Periodized',
    '',
    9,
    '[
      {"weekday":1,"name":"Upper A","phase_id":"c3401941-0000-4000-8000-0000000000a1","exercises":[{"name":"Bench","default_sets":4,"default_reps":8}]},
      {"weekday":3,"name":"Lower A","phase_id":"c3401941-0000-4000-8000-0000000000a1","exercises":[{"name":"Squat","default_sets":4,"default_reps":8}]},
      {"weekday":1,"name":"Upper I","phase_id":"c3401941-0000-4000-8000-0000000000a2","exercises":[{"name":"Bench","default_sets":5,"default_reps":3}]},
      {"weekday":3,"name":"Lower I","phase_id":"c3401941-0000-4000-8000-0000000000a2","exercises":[{"name":"Squat","default_sets":5,"default_reps":3}]},
      {"weekday":1,"name":"Upper D","phase_id":"c3401941-0000-4000-8000-0000000000a3","exercises":[{"name":"Bench","default_sets":2,"default_reps":8}]},
      {"weekday":3,"name":"Lower D","phase_id":"c3401941-0000-4000-8000-0000000000a3","exercises":[{"name":"Squat","default_sets":2,"default_reps":8}]}
    ]'::jsonb,
    null,
    'fixed_days',
    '[
      {"id":"c3401941-0000-4000-8000-0000000000a1","name":"Accumulation","duration_weeks":4},
      {"id":"c3401941-0000-4000-8000-0000000000a2","name":"Intensification","duration_weeks":4},
      {"id":"c3401941-0000-4000-8000-0000000000a3","name":"Deload","duration_weeks":1}
    ]'::jsonb
  );
  if v_days is distinct from 6 then
    raise exception 'periodized same-weekday save expected 6 days, got %', v_days;
  end if;
end $$;
reset role;

do $$
declare
  v_phase uuid;
  v_today date := current_date;
begin
  if (select count(*) from public.program_days
      where program_id = 'c3401941-0000-4000-8000-000000000010' and weekday = 1) <> 3 then
    raise exception 'expected 3 monday sessions, one per phase';
  end if;
  v_phase := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000010',
    v_today,
    v_today
  );
  if v_phase is distinct from 'c3401941-0000-4000-8000-0000000000a1' then
    raise exception 'week 1 should be Accumulation, got %', v_phase;
  end if;
  v_phase := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000010',
    v_today,
    (v_today + 28)
  );
  if v_phase is distinct from 'c3401941-0000-4000-8000-0000000000a2' then
    raise exception 'week 5 should be Intensification, got %', v_phase;
  end if;
  v_phase := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000010',
    v_today,
    (v_today + 56)
  );
  if v_phase is distinct from 'c3401941-0000-4000-8000-0000000000a3' then
    raise exception 'week 9 should be Deload, got %', v_phase;
  end if;
end $$;

-- Duplicate weekday in the same phase still fails.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.save_program(
      'c3401941-0000-4000-8000-000000000010',
      'Periodized',
      '',
      9,
      '[
        {"weekday":1,"name":"A1","phase_id":"c3401941-0000-4000-8000-0000000000a1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},
        {"weekday":1,"name":"A1b","phase_id":"c3401941-0000-4000-8000-0000000000a1","exercises":[{"name":"Row","default_sets":3,"default_reps":5}]}
      ]'::jsonb,
      null,
      'fixed_days',
      '[{"id":"c3401941-0000-4000-8000-0000000000a1","name":"Accumulation","duration_weeks":4}]'::jsonb
    );
    raise exception 'duplicate weekday in the same phase was allowed';
  exception
    when others then
      if sqlerrm not like '%Duplicate weekday%' then
        raise;
      end if;
  end;
  if (select count(*) from public.program_days
      where program_id = 'c3401941-0000-4000-8000-000000000010' and weekday = 1) <> 3 then
    raise exception 'failed duplicate save mutated live mondays';
  end if;
end $$;

-- Invalid future version is rejected at save, not at activation day.
do $$
begin
  begin
    perform public.save_program_version(
      'c3401941-0000-4000-8000-000000000010',
      'Bad future',
      '',
      8,
      '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":0,"default_reps":5}]}]'::jsonb,
      null,
      'fixed_days',
      '[]'::jsonb
    );
    raise exception 'invalid future version was saved';
  exception
    when others then
      if sqlerrm not like '%Invalid sets%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Owner Data API cannot rewrite days.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  begin
    update public.program_days set name = 'Hijack' where program_id = 'c3401941-0000-4000-8000-000000000010';
    raise exception 'owner Data API program_days UPDATE was allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;
  begin
    update public.programs set name = 'Hijack' where id = 'c3401941-0000-4000-8000-000000000010';
    raise exception 'owner Data API programs UPDATE was allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%owner Data API programs UPDATE was allowed%' then
        raise;
      elsif sqlerrm not like '%permission denied%' and sqlerrm not like '%RPC-only%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Logger loads server prescription; future-phase day is refused.
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-0000000000b1',
  'c3401941-0000-4000-8000-000000000010',
  'c3401941-0000-4000-8000-000000000001',
  'c3401941-0000-4000-8000-000000000001',
  current_date,
  'active'
);
update public.programs
   set phase_anchor_on = current_date
 where id = 'c3401941-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_day uuid;
  v_future uuid;
  v_wid uuid;
  v_sets int;
  v_name text;
begin
  select id into v_day from public.program_days
   where program_id = 'c3401941-0000-4000-8000-000000000010'
     and name = 'Upper A';
  select id into v_future from public.program_days
   where program_id = 'c3401941-0000-4000-8000-000000000010'
     and name = 'Upper I';

  v_wid := public.start_workout_from_template(
    'Upper A',
    now(),
    null,
    'c3401941-0000-4000-8000-0000000000b1',
    v_day,
    '[{"name":"Hijack squat","default_sets":10,"default_reps":10}]'::jsonb
  );
  select we.name, we.prescribed_sets
    into v_name, v_sets
  from public.workout_exercises we
  where we.workout_id = v_wid
  order by we.order_index
  limit 1;
  if v_name is distinct from 'Bench' or v_sets is distinct from 4 then
    raise exception 'client prescription was stamped as Coach, got % x %', v_name, v_sets;
  end if;

  begin
    perform public.start_workout_from_template(
      'Upper I',
      now(),
      null,
      'c3401941-0000-4000-8000-0000000000b1',
      v_future,
      '[]'::jsonb
    );
    raise exception 'future-phase day was allowed';
  exception
    when others then
      if sqlerrm not like '%program_day_not_current_phase%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Name/description apply + phase_anchor restart on activation.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_days int;
  v_rev int;
begin
  v_days := public.save_program(
    'c3401941-0000-4000-8000-000000000011',
    'Version A',
    'old desc',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  if v_days is distinct from 1 then
    raise exception 'coach live save expected 1 day';
  end if;
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000011',
    'Bloc Force',
    'force block',
    8,
    '[
      {"weekday":1,"name":"Upper B1","phase_id":"c3401941-0000-4000-8000-0000000000c1","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]},
      {"weekday":1,"name":"Upper B2","phase_id":"c3401941-0000-4000-8000-0000000000c2","exercises":[{"name":"Press","default_sets":5,"default_reps":3}]}
    ]'::jsonb,
    null,
    'fixed_days',
    '[
      {"id":"c3401941-0000-4000-8000-0000000000c1","name":"Block 1","duration_weeks":4},
      {"id":"c3401941-0000-4000-8000-0000000000c2","name":"Block 2","duration_weeks":4}
    ]'::jsonb
  );
  perform public.activate_program_version(
    'c3401941-0000-4000-8000-000000000011',
    v_rev,
    null
  );
end $$;
reset role;

do $$
declare
  v_name text;
  v_desc text;
  v_anchor date;
  v_phase uuid;
begin
  select name, description, phase_anchor_on
    into v_name, v_desc, v_anchor
  from public.programs
  where id = 'c3401941-0000-4000-8000-000000000011';
  if v_name is distinct from 'Bloc Force' then
    raise exception 'activated name not applied, got %', v_name;
  end if;
  if v_desc is distinct from 'force block' then
    raise exception 'activated description not applied, got %', v_desc;
  end if;
  if v_anchor is null then
    raise exception 'phase_anchor_on not set on activation';
  end if;
  v_phase := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000011',
    v_anchor,
    v_anchor + 10
  );
  if v_phase is distinct from 'c3401941-0000-4000-8000-0000000000c1' then
    raise exception 'new version should restart in Block 1, got %', v_phase;
  end if;
end $$;

-- Relation ends before activation: scheduled version is cancelled, paused client cannot apply.
insert into public.coach_client_links(id,coach_id,client_id,status)
values (
  'c3401941-0000-4000-8000-0000000000aa',
  'c3401941-0000-4000-8000-000000000003',
  'c3401941-0000-4000-8000-000000000004',
  'active'
);
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-0000000000c1',
  'c3401941-0000-4000-8000-000000000011',
  'c3401941-0000-4000-8000-000000000004',
  'c3401941-0000-4000-8000-000000000003',
  current_date - 60,
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_rev int;
begin
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000011',
    'After split',
    '',
    8,
    '[{"weekday":1,"name":"Should not apply","exercises":[{"name":"Curl","default_sets":3,"default_reps":10}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-000000000011',
    v_rev,
    (current_date + 7),
    false,
    null
  );
  perform public.end_coach_client_link('c3401941-0000-4000-8000-000000000004');
end $$;
reset role;

do $$ begin
  if (select scheduled_revision_no from public.programs
      where id = 'c3401941-0000-4000-8000-000000000011') is not null then
    raise exception 'scheduled version survived the ended relation';
  end if;
  if (select status from public.program_assignments
      where id = 'c3401941-0000-4000-8000-0000000000c1') is distinct from 'paused' then
    raise exception 'assignment was not paused at split';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_out int;
begin
  v_out := public.ensure_due_program_version('c3401941-0000-4000-8000-000000000011');
  if v_out is distinct from 0 then
    raise exception 'paused client applied a due version, got %', v_out;
  end if;
end $$;
reset role;

do $$ begin
  if (select name from public.program_days
      where program_id = 'c3401941-0000-4000-8000-000000000011'
      order by order_index limit 1) is distinct from 'Upper B1' then
    raise exception 'live graph changed after ended relation';
  end if;
end $$;

rollback;
\echo 'program hardening: phase engine, duplicate weekdays, server prescription, civil date, relation end, Data API, name/description'
