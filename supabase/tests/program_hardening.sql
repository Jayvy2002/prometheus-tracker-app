-- P3 hardening — phase engine, weekdays, logger, civil date, relation end, Data API, versions.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401941-0000-4000-8000-000000000001','p3h-owner@example.test'),
 ('c3401941-0000-4000-8000-000000000002','p3h-stranger@example.test'),
 ('c3401941-0000-4000-8000-000000000003','p3h-coach@example.test'),
 ('c3401941-0000-4000-8000-000000000004','p3h-client@example.test'),
 ('c3401941-0000-4000-8000-000000000005','p3h-leftover@example.test'),
 ('c3401941-0000-4000-8000-000000000006','p3h-toronto@example.test'),
 ('c3401941-0000-4000-8000-000000000007','p3h-vancouver@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401941-0000-4000-8000-000000000001','free','none'),
 ('c3401941-0000-4000-8000-000000000002','free','none'),
 ('c3401941-0000-4000-8000-000000000003','free','coach'),
 ('c3401941-0000-4000-8000-000000000004','free','none'),
 ('c3401941-0000-4000-8000-000000000005','free','coach'),
 ('c3401941-0000-4000-8000-000000000006','free','none'),
 ('c3401941-0000-4000-8000-000000000007','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401941-0000-4000-8000-000000000003','coach'),
 ('c3401941-0000-4000-8000-000000000005','coach')
on conflict do nothing;

update public.user_profiles
   set timezone = 'America/Toronto'
 where id in (
   'c3401941-0000-4000-8000-000000000003',
   'c3401941-0000-4000-8000-000000000004',
   'c3401941-0000-4000-8000-000000000006'
 );
update public.user_profiles
   set timezone = 'UTC'
 where id = 'c3401941-0000-4000-8000-000000000001';
update public.user_profiles
   set timezone = 'America/Vancouver'
 where id = 'c3401941-0000-4000-8000-000000000007';

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
     or has_table_privilege('authenticated', 'public.programs', 'delete')
     or not has_table_privilege('authenticated', 'public.program_days', 'select') then
    raise exception 'authenticated graph table privileges wrong';
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
  if has_function_privilege('authenticated', 'public.program_actor_timezone(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.program_activation_timezone(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.program_current_phase_id(uuid,date,date)', 'execute')
     or has_function_privilege('authenticated', 'public.program_civil_date(text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.program_version_is_due(date,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.program_has_history(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_program_days(uuid,jsonb,boolean,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.cancel_scheduled_program_version(uuid)', 'execute') then
    raise exception 'internal P3 helper exposed to authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_program(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.schedule_program_version(uuid,int,date,boolean,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.ensure_due_program_version(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.start_workout_from_template(text,timestamptz,uuid,uuid,uuid,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.save_program(uuid,text,text,int,jsonb,timestamptz,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.save_program_version(uuid,text,text,int,jsonb,timestamptz,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.activate_program_version(uuid,int,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_program_complete(text,text,int,jsonb,uuid,date,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.sync_program_days(uuid,jsonb)', 'execute') then
    raise exception 'public P3 command lost authenticated execute';
  end if;
end $$;

-- Runtime: authenticated cannot call DEFINER timezone helper with an arbitrary user id.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.program_actor_timezone('c3401941-0000-4000-8000-000000000002');
    raise exception 'authenticated executed program_actor_timezone';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%authenticated executed program_actor_timezone%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;
end $$;
reset role;

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
  begin
    delete from public.programs where id = 'c3401941-0000-4000-8000-000000000010';
    raise exception 'owner Data API programs DELETE was allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%owner Data API programs DELETE was allowed%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
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

-- Shared program: freeze owner/Coach TZ (Toronto), not first client, not Vancouver.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3401941-0000-4000-8000-000000000012','c3401941-0000-4000-8000-000000000003','Shared clock','',8);
insert into public.coach_client_links(id,coach_id,client_id,status) values
 ('c3401941-0000-4000-8000-0000000000ab','c3401941-0000-4000-8000-000000000003','c3401941-0000-4000-8000-000000000006','active'),
 ('c3401941-0000-4000-8000-0000000000ac','c3401941-0000-4000-8000-000000000003','c3401941-0000-4000-8000-000000000007','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('c3401941-0000-4000-8000-0000000000d1','c3401941-0000-4000-8000-000000000012','c3401941-0000-4000-8000-000000000006','c3401941-0000-4000-8000-000000000003',current_date,'active'),
 ('c3401941-0000-4000-8000-0000000000d2','c3401941-0000-4000-8000-000000000012','c3401941-0000-4000-8000-000000000007','c3401941-0000-4000-8000-000000000003',current_date,'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_rev int;
begin
  perform public.save_program(
    'c3401941-0000-4000-8000-000000000012',
    'Shared clock',
    '',
    8,
    '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000012',
    'Shared B',
    '',
    8,
    '[{"weekday":1,"name":"B","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-000000000012',
    v_rev,
    (current_date + 7),
    false,
    null
  );
end $$;
reset role;

do $$
declare
  v_tz text;
  v_on date;
begin
  select scheduled_activation_timezone, scheduled_activates_on
    into v_tz, v_on
  from public.programs
  where id = 'c3401941-0000-4000-8000-000000000012';
  if v_tz is distinct from 'America/Toronto' then
    raise exception 'shared schedule froze %, expected America/Toronto', v_tz;
  end if;
  if public.program_version_is_due(date '2026-09-21', v_tz, timestamptz '2026-09-21 00:30:00+00') then
    raise exception 'frozen Toronto clock treated UTC Monday as due';
  end if;
  if not public.program_version_is_due(date '2026-09-21', v_tz, timestamptz '2026-09-21 04:00:00+00') then
    raise exception 'frozen Toronto clock missed Monday 00:00 EDT';
  end if;
  if v_on is null then
    raise exception 'shared schedule missing activates_on';
  end if;
end $$;

-- Live owner TZ must not rewrite a frozen schedule (shared clock stays Toronto).
update public.user_profiles
   set timezone = 'Pacific/Auckland'
 where id = 'c3401941-0000-4000-8000-000000000003';

do $$
begin
  if public.program_activation_timezone('c3401941-0000-4000-8000-000000000012')
     is distinct from 'Pacific/Auckland' then
    raise exception 'live owner timezone helper did not follow the new profile TZ';
  end if;
  if (select scheduled_activation_timezone from public.programs
      where id = 'c3401941-0000-4000-8000-000000000012') is distinct from 'America/Toronto' then
    raise exception 'owner timezone change rewrote frozen scheduled_activation_timezone';
  end if;
end $$;

update public.program_assignments
   set status = 'paused'
 where id = 'c3401941-0000-4000-8000-0000000000d1';

do $$
begin
  if (select scheduled_activation_timezone from public.programs
      where id = 'c3401941-0000-4000-8000-000000000012') is distinct from 'America/Toronto' then
    raise exception 'first-client leave changed frozen timezone';
  end if;
  if (select scheduled_revision_no from public.programs
      where id = 'c3401941-0000-4000-8000-000000000012') is null then
    raise exception 'remaining active client lost the scheduled version';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$
declare
  v_out int;
begin
  v_out := public.ensure_due_program_version('c3401941-0000-4000-8000-000000000012');
  if v_out is distinct from 0 then
    raise exception 'Vancouver client applied a Toronto-future version';
  end if;
end $$;
reset role;

update public.programs
set scheduled_activates_on = (now() AT TIME ZONE scheduled_activation_timezone)::date
where id = 'c3401941-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000007","role":"authenticated"}',true);
do $$
declare
  v_out int;
begin
  v_out := public.ensure_due_program_version('c3401941-0000-4000-8000-000000000012');
  if v_out is null or v_out = 0 then
    raise exception 'ensure_due did not use frozen owner timezone after first client left';
  end if;
  if (select name from public.program_days
      where program_id = 'c3401941-0000-4000-8000-000000000012' limit 1)
     is distinct from 'B' then
    raise exception 'shared due apply did not replace live days';
  end if;
end $$;
reset role;

-- UTC owner + Toronto client: freeze owner clock, not the assigned client.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3401941-0000-4000-8000-000000000013','c3401941-0000-4000-8000-000000000001','UTC owner clock','',8);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_rev int;
begin
  perform public.save_program(
    'c3401941-0000-4000-8000-000000000013',
    'UTC owner clock',
    '',
    8,
    '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000013',
    'UTC owner clock B',
    '',
    8,
    '[{"weekday":1,"name":"B","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-000000000013',
    v_rev,
    (current_date + 7),
    false,
    null
  );
end $$;
reset role;

do $$
declare
  v_tz text;
  v_on date;
begin
  select scheduled_activation_timezone, scheduled_activates_on
    into v_tz, v_on
  from public.programs
  where id = 'c3401941-0000-4000-8000-000000000013';
  if v_tz is distinct from 'UTC' then
    raise exception 'Toronto client froze %, expected owner UTC', v_tz;
  end if;
  if not public.program_version_is_due(date '2026-09-21', v_tz, timestamptz '2026-09-21 00:30:00+00') then
    raise exception 'frozen UTC clock missed UTC Monday 00:30';
  end if;
  if public.program_version_is_due(date '2026-09-21', 'America/Toronto', timestamptz '2026-09-21 00:30:00+00') then
    raise exception 'client Toronto clock would have delayed the UTC-frozen schedule';
  end if;
  if v_on is null then
    raise exception 'UTC owner schedule missing activates_on';
  end if;
end $$;

insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('c3401941-0000-4000-8000-0000000000d3','c3401941-0000-4000-8000-000000000013','c3401941-0000-4000-8000-000000000004','c3401941-0000-4000-8000-000000000001',current_date,'active');

do $$
begin
  if (select scheduled_activation_timezone from public.programs
      where id = 'c3401941-0000-4000-8000-000000000013') is distinct from 'UTC' then
    raise exception 'assigning a Toronto client rewrote the frozen owner timezone';
  end if;
end $$;

-- delete_program: virgin OK; stranger/leftover/active/history refuse; Data API closed.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3401941-0000-4000-8000-000000000020','c3401941-0000-4000-8000-000000000001','Virgin','',8),
 ('c3401941-0000-4000-8000-000000000022','c3401941-0000-4000-8000-000000000005','Leftover owned','',8),
 ('c3401941-0000-4000-8000-000000000025','c3401941-0000-4000-8000-000000000001','Workout history','',8);
insert into public.coach_client_links(id,coach_id,client_id,status) values
 ('c3401941-0000-4000-8000-0000000000ad','c3401941-0000-4000-8000-000000000003','c3401941-0000-4000-8000-000000000005','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('c3401941-0000-4000-8000-0000000000e2','c3401941-0000-4000-8000-000000000022','c3401941-0000-4000-8000-000000000005','c3401941-0000-4000-8000-000000000003',current_date,'active');
insert into public.program_days(id,program_id,weekday,name,order_index) values
 ('c3401941-0000-4000-8000-0000000000f1','c3401941-0000-4000-8000-000000000025',1,'Hist day',0);
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('c3401941-0000-4000-8000-0000000000e5','c3401941-0000-4000-8000-000000000025','c3401941-0000-4000-8000-000000000001','c3401941-0000-4000-8000-000000000001',current_date,'paused');
insert into public.workouts(id,user_id,name,date,completed,program_assignment_id,program_day_id) values
 ('c3401941-0000-4000-8000-0000000000w1','c3401941-0000-4000-8000-000000000001','Hist','2026-09-01',true,'c3401941-0000-4000-8000-0000000000e5','c3401941-0000-4000-8000-0000000000f1');
insert into public.program_revisions(program_id,revision_no,snapshot) values
 ('c3401941-0000-4000-8000-000000000025',1,'[]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000020');
    raise exception 'stranger delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%Not program owner%' then
        raise;
      end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000022');
    raise exception 'leftover delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%' then
        raise;
      end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_id uuid;
  v_revs int;
  v_asg int;
  v_wo int;
begin
  v_id := public.delete_program('c3401941-0000-4000-8000-000000000020');
  if v_id is distinct from 'c3401941-0000-4000-8000-000000000020' then
    raise exception 'virgin delete_program failed';
  end if;
  if exists (select 1 from public.programs where id = 'c3401941-0000-4000-8000-000000000020') then
    raise exception 'virgin program still present';
  end if;

  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000010');
    raise exception 'active assignment delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%program_has_active_assignment%' then
        raise;
      end if;
  end;

  select count(*) into v_revs from public.program_revisions
   where program_id = 'c3401941-0000-4000-8000-000000000025';
  select count(*) into v_asg from public.program_assignments
   where program_id = 'c3401941-0000-4000-8000-000000000025';
  select count(*) into v_wo from public.workouts
   where id = 'c3401941-0000-4000-8000-0000000000w1';
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000025');
    raise exception 'historical workout delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%program_has_history%' then
        raise;
      end if;
  end;
  if (select count(*) from public.program_revisions
      where program_id = 'c3401941-0000-4000-8000-000000000025') is distinct from v_revs
     or (select count(*) from public.program_assignments
         where program_id = 'c3401941-0000-4000-8000-000000000025') is distinct from v_asg
     or (select count(*) from public.workouts
         where id = 'c3401941-0000-4000-8000-0000000000w1') is distinct from v_wo then
    raise exception 'refused delete mutated history';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_revs int;
begin
  select count(*) into v_revs from public.program_revisions
   where program_id = 'c3401941-0000-4000-8000-000000000011';
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000011');
    raise exception 'historical assignment delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%program_has_history%' then
        raise;
      end if;
  end;
  if (select count(*) from public.program_revisions
      where program_id = 'c3401941-0000-4000-8000-000000000011') is distinct from v_revs then
    raise exception 'refused assignment-history delete dropped revisions';
  end if;
end $$;
reset role;

rollback;
\echo 'program hardening: phase engine, duplicate weekdays, server prescription, civil date, relation end, Data API, name/description, helper ACL, delete, frozen tz'
