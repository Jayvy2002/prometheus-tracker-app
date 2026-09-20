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
  if (
    select count(distinct a.attname)
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where nsp.nspname = 'public'
      and rel.relname = 'workouts'
      and c.contype = 'f'
      and a.attname in ('program_day_id', 'program_phase_id')
      and c.condeferrable
      and not c.condeferred
  ) is distinct from 2 then
    raise exception 'workout provenance FKs are not DEFERRABLE INITIALLY IMMEDIATE';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.apply_program_revision_snapshot(uuid,int,text)',
    'execute'
  ) then
    raise exception 'apply snapshot exposed to authenticated';
  end if;
  if to_regprocedure('public.apply_program_revision_snapshot(uuid,int)') is not null then
    raise exception 'stale 2-arg apply still present';
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
     or has_function_privilege('authenticated', 'public.sync_program_days(uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_program_phases(uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_program_phases(uuid,jsonb,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.snapshot_program_revision(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.save_program_day_exercises(uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.create_program_with_days(text,text,int,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.cancel_scheduled_program_version(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.program_effective_version_start(date,date)', 'execute')
     or has_function_privilege('authenticated', 'public.lock_programs_for_assignment_mutation(uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.lock_client_assignment_programs(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.lock_client_assignment_mutex(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.remap_program_revision_snapshot(jsonb)', 'execute') then
    raise exception 'internal P3 helper exposed to authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.actor_owns_program(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.actor_can_read_program(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.actor_can_activate_program_version(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.coached_client_cannot_edit_program(uuid)', 'execute') then
    raise exception 'RLS program helper lost authenticated execute';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname ~* '(program|snapshot_program|sync_program|save_program)'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname not in (
        'save_program',
        'save_program_version',
        'schedule_program_version',
        'activate_program_version',
        'ensure_due_program_version',
        'create_program_complete',
        'delete_program',
        'fork_program',
        'adopt_client_assignment',
        'assign_program_secure',
        'get_frozen_program_archive',
        'actor_owns_program',
        'actor_can_read_program',
        'actor_can_activate_program_version',
        'coached_client_cannot_edit_program'
      )
  ) then
    raise exception 'unexpected authenticated program DEFINER: %', (
      select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.proname ~* '(program|snapshot_program|sync_program|save_program)'
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in (
          'save_program',
          'save_program_version',
          'schedule_program_version',
          'activate_program_version',
          'ensure_due_program_version',
          'create_program_complete',
          'delete_program',
          'fork_program',
          'adopt_client_assignment',
          'assign_program_secure',
          'get_frozen_program_archive',
          'actor_owns_program',
          'actor_can_read_program',
          'actor_can_activate_program_version',
          'coached_client_cannot_edit_program'
        )
    );
  end if;
  if not has_function_privilege('authenticated', 'public.delete_program(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.schedule_program_version(uuid,int,date,boolean,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.ensure_due_program_version(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.start_workout_from_template(text,timestamptz,uuid,uuid,uuid,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.save_program(uuid,text,text,int,jsonb,timestamptz,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.save_program_version(uuid,text,text,int,jsonb,timestamptz,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.activate_program_version(uuid,int,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_program_complete(text,text,int,jsonb,uuid,date,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_frozen_program_archive(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.adopt_client_assignment(uuid,text)', 'execute') then
    raise exception 'public P3 command lost authenticated execute';
  end if;
  if to_regprocedure('public.adopt_client_program(uuid,uuid,text)') is not null then
    raise exception 'ambiguous adopt_client_program(uuid,uuid,text) still exists';
  end if;
  if has_table_privilege('authenticated', 'public.program_revisions', 'insert')
     or has_table_privilege('authenticated', 'public.program_revisions', 'update')
     or has_table_privilege('authenticated', 'public.program_revisions', 'delete')
     or not has_table_privilege('authenticated', 'public.program_revisions', 'select') then
    raise exception 'program_revisions table privileges are not SELECT-only';
  end if;
end $$;

-- Hotfix A: SELECT-only graph/assignments; SIDU logger tables; no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; anon none.
do $$
declare
  v_table text;
  v_priv text;
  v_select_only text[] := array[
    'programs',
    'program_days',
    'program_day_exercises',
    'program_phases',
    'program_revisions',
    'program_assignments'
  ];
  v_sidu text[] := array['workouts', 'workout_exercises', 'workout_sets'];
begin
  foreach v_table in array v_select_only loop
    if not has_table_privilege('authenticated', 'public.' || v_table, 'select') then
      raise exception '% missing authenticated SELECT', v_table;
    end if;
    foreach v_priv in array array['insert','update','delete','truncate','references','trigger','maintain'] loop
      if has_table_privilege('authenticated', 'public.' || v_table, v_priv) then
        raise exception 'authenticated still has % on %', v_priv, v_table;
      end if;
    end loop;
    foreach v_priv in array array['select','insert','update','delete','truncate','references','trigger','maintain'] loop
      if has_table_privilege('anon', 'public.' || v_table, v_priv) then
        raise exception 'anon still has % on %', v_priv, v_table;
      end if;
    end loop;
    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(c.relacl) a
      where c.oid = ('public.' || v_table)::regclass
        and c.relacl is not null
        and a.grantee in (0::oid, 'anon'::regrole)
    ) then
      raise exception 'PUBLIC/anon ACL leftover on %', v_table;
    end if;
  end loop;

  foreach v_table in array v_sidu loop
    if not has_table_privilege('authenticated', 'public.' || v_table, 'select')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'insert')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'update')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'delete') then
      raise exception '% missing authenticated SIDU', v_table;
    end if;
    foreach v_priv in array array['truncate','references','trigger','maintain'] loop
      if has_table_privilege('authenticated', 'public.' || v_table, v_priv) then
        raise exception 'authenticated still has % on %', v_priv, v_table;
      end if;
    end loop;
    foreach v_priv in array array['select','insert','update','delete','truncate','references','trigger','maintain'] loop
      if has_table_privilege('anon', 'public.' || v_table, v_priv) then
        raise exception 'anon still has % on %', v_priv, v_table;
      end if;
    end loop;
    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(c.relacl) a
      where c.oid = ('public.' || v_table)::regclass
        and c.relacl is not null
        and a.grantee in (0::oid, 'anon'::regrole)
    ) then
      raise exception 'PUBLIC/anon ACL leftover on %', v_table;
    end if;
  end loop;

  if public.program_effective_version_start(date '2026-07-01', date '2026-09-01')
       is distinct from date '2026-09-01'
     or public.program_effective_version_start(date '2026-09-30', date '2026-09-01')
       is distinct from date '2026-09-30'
     or public.program_effective_version_start(date '2026-09-30', null)
       is distinct from date '2026-09-30' then
    raise exception 'laterOf(assignment, version start) is wrong';
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
  if (select we.prescription_source
        from public.workout_exercises we
       where we.workout_id = v_wid
       order by we.order_index
       limit 1) is distinct from 'program' then
    raise exception 'start RPC did not stamp prescription_source=program';
  end if;
  if (select w.program_id from public.workouts w where w.id = v_wid)
       is distinct from 'c3401941-0000-4000-8000-000000000010'
     or (select w.program_revision_no from public.workouts w where w.id = v_wid) is null then
    raise exception 'start_workout did not stamp durable program_id/revision';
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

-- Data API cannot rewrite or delete an assignment (owner/assigner included).
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  begin
    update public.program_assignments
       set start_date = current_date - 7
     where id = 'c3401941-0000-4000-8000-0000000000b1';
    raise exception 'assignment start_date Data API update was allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%assignment start_date Data API update was allowed%' then
        raise;
      elsif sqlerrm not like '%permission denied%'
         and sqlerrm not like '%program assignment%' then
        raise;
      end if;
  end;
  begin
    delete from public.program_assignments
     where id = 'c3401941-0000-4000-8000-0000000000b1';
    raise exception 'assignment Data API delete was allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%assignment Data API delete was allowed%' then
        raise;
      elsif sqlerrm not like '%permission denied%'
         and sqlerrm not like '%program assignment%' then
        raise;
      end if;
  end;
  if (select start_date from public.program_assignments
      where id = 'c3401941-0000-4000-8000-0000000000b1') is distinct from current_date
     or (select status from public.program_assignments
         where id = 'c3401941-0000-4000-8000-0000000000b1') is distinct from 'active' then
    raise exception 'assignment identity mutated through Data API';
  end if;
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
  if (select r.version_start_on
        from public.program_revisions r
        join public.programs p on p.id = r.program_id and p.active_revision_no = r.revision_no
       where p.id = 'c3401941-0000-4000-8000-000000000011')
     is distinct from v_anchor then
    raise exception 'activated revision did not store version_start_on';
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
  if (select frozen_revision_no from public.program_assignments
      where id = 'c3401941-0000-4000-8000-0000000000d1') is null then
    raise exception 'active→paused did not freeze revision';
  end if;
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
    raise exception 'UTC owner froze %, expected UTC not client Toronto', v_tz;
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

-- delete_program: FOR UPDATE before checks (source contract).
do $$
declare
  src text;
  lock_at int;
  owner_at int;
  leftover_at int;
  active_at int;
  hist_at int;
  del_at int;
begin
  src := regexp_replace(
    lower(pg_get_functiondef('public.delete_program(uuid)'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  lock_at := position('from public.programs where id = p_program_id for update' in src);
  owner_at := position('not program owner' in src);
  leftover_at := position('coached_client_cannot_edit_program' in src);
  active_at := position('program_has_active_assignment' in src);
  hist_at := position('program_has_history(p_program_id)' in src);
  del_at := position('delete from public.programs' in src);
  if lock_at = 0 or owner_at = 0 or leftover_at = 0 or active_at = 0 or hist_at = 0 or del_at = 0 then
    raise exception 'delete_program missing lock or check';
  end if;
  if not (
    lock_at < owner_at
    and owner_at < leftover_at
    and leftover_at < active_at
    and active_at < hist_at
    and hist_at < del_at
  ) then
    raise exception 'delete_program does not lock the program row before deletion checks';
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
 ('c3401941-0000-4000-8000-0000000000c2','c3401941-0000-4000-8000-000000000001','Hist','2026-09-01',true,'c3401941-0000-4000-8000-0000000000e5','c3401941-0000-4000-8000-0000000000f1');
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

-- Stranger JWT cannot SELECT another owner's program (RLS). Prove survival as postgres.
do $$
begin
  if not exists (
    select 1 from public.programs where id = 'c3401941-0000-4000-8000-000000000020'
  ) then
    raise exception 'stranger refuse deleted the program';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_asg int;
begin
  select count(*) into v_asg from public.program_assignments
   where program_id = 'c3401941-0000-4000-8000-000000000022';
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000022');
    raise exception 'leftover delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%' then
        raise;
      end if;
  end;
  if not exists (
    select 1 from public.programs where id = 'c3401941-0000-4000-8000-000000000022'
  ) then
    raise exception 'leftover refuse deleted the program';
  end if;
  if (select count(*) from public.program_assignments
      where program_id = 'c3401941-0000-4000-8000-000000000022') is distinct from v_asg then
    raise exception 'leftover refuse mutated assignments';
  end if;
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

  select count(*) into v_asg from public.program_assignments
   where program_id = 'c3401941-0000-4000-8000-000000000010';
  begin
    perform public.delete_program('c3401941-0000-4000-8000-000000000010');
    raise exception 'active assignment delete_program was allowed';
  exception
    when others then
      if sqlerrm not like '%program_has_active_assignment%' then
        raise;
      end if;
  end;
  if not exists (
    select 1 from public.programs where id = 'c3401941-0000-4000-8000-000000000010'
  ) then
    raise exception 'active refuse deleted the program';
  end if;
  if (select count(*) from public.program_assignments
      where program_id = 'c3401941-0000-4000-8000-000000000010') is distinct from v_asg then
    raise exception 'active refuse mutated assignments';
  end if;

  select count(*) into v_revs from public.program_revisions
   where program_id = 'c3401941-0000-4000-8000-000000000025';
  select count(*) into v_asg from public.program_assignments
   where program_id = 'c3401941-0000-4000-8000-000000000025';
  select count(*) into v_wo from public.workouts
   where id = 'c3401941-0000-4000-8000-0000000000c2';
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
         where id = 'c3401941-0000-4000-8000-0000000000c2') is distinct from v_wo then
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
  v_asg int;
begin
  select count(*) into v_revs from public.program_revisions
   where program_id = 'c3401941-0000-4000-8000-000000000011';
  select count(*) into v_asg from public.program_assignments
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
  if (select count(*) from public.program_assignments
      where program_id = 'c3401941-0000-4000-8000-000000000011') is distinct from v_asg then
    raise exception 'refused assignment-history delete dropped assignments';
  end if;
end $$;
reset role;

-- Shared weekdays without durations are refused. Untimed labels on distinct weekdays stay allowed.
-- Program 000010 already has a logged workout (start_workout above). CASCADE
-- phase delete must raise "phase duration required", not a workout FK error.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.save_program(
      'c3401941-0000-4000-8000-000000000010',
      'Ambiguous',
      '',
      8,
      '[
        {"weekday":1,"name":"A","phase_id":"c3401941-0000-4000-8000-0000000000d1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},
        {"weekday":1,"name":"B","phase_id":"c3401941-0000-4000-8000-0000000000d2","exercises":[{"name":"Row","default_sets":3,"default_reps":5}]}
      ]'::jsonb,
      null,
      'fixed_days',
      '[
        {"id":"c3401941-0000-4000-8000-0000000000d1","name":"Block A"},
        {"id":"c3401941-0000-4000-8000-0000000000d2","name":"Block B"}
      ]'::jsonb
    );
    raise exception 'untimed shared-weekday phases were allowed';
  exception
    when others then
      if sqlerrm not like '%phase duration required%' then
        raise;
      end if;
  end;
  begin
    perform public.save_program_version(
      'c3401941-0000-4000-8000-000000000010',
      'Ambiguous future',
      '',
      8,
      '[
        {"weekday":1,"name":"A","phase_id":"c3401941-0000-4000-8000-0000000000d1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},
        {"weekday":1,"name":"B","phase_id":"c3401941-0000-4000-8000-0000000000d2","exercises":[{"name":"Row","default_sets":3,"default_reps":5}]}
      ]'::jsonb,
      null,
      'fixed_days',
      '[
        {"id":"c3401941-0000-4000-8000-0000000000d1","name":"Block A"},
        {"id":"c3401941-0000-4000-8000-0000000000d2","name":"Block B"}
      ]'::jsonb
    );
    raise exception 'untimed shared-weekday future version was allowed';
  exception
    when others then
      if sqlerrm like '%untimed shared-weekday future version was allowed%' then
        raise;
      elsif sqlerrm not like '%phase duration required%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Provenance: off-plan OK; forged stamps refused; start RPC stamps; UPDATE freeze; prescribed freeze.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_off uuid;
  v_wid uuid;
  v_ex uuid;
  v_day uuid;
  v_rev int;
begin
  insert into public.workouts(user_id, name, date)
  values ('c3401941-0000-4000-8000-000000000001', 'Off plan', now())
  returning id into v_off;
  if (select program_id from public.workouts where id = v_off) is not null
     or (select program_revision_no from public.workouts where id = v_off) is not null then
    raise exception 'off-plan workout carried program provenance';
  end if;

  begin
    insert into public.workouts(user_id, name, date, program_revision_no)
    values ('c3401941-0000-4000-8000-000000000001', 'Forged rev', now(), 9);
    raise exception 'forged program_revision_no insert was allowed';
  exception
    when others then
      if sqlerrm like '%forged program_revision_no insert was allowed%' then
        raise;
      elsif sqlerrm not like '%program provenance is RPC-only%' then
        raise;
      end if;
  end;

  begin
    insert into public.workouts(
      user_id, name, date, program_id, program_day_id, program_phase_id
    ) values (
      'c3401941-0000-4000-8000-000000000001',
      'Forged phase',
      now(),
      'c3401941-0000-4000-8000-000000000010',
      'c3401941-0000-4000-8000-0000000000aa',
      'c3401941-0000-4000-8000-0000000000a1'
    );
    raise exception 'forged program day insert was allowed';
  exception
    when others then
      if sqlerrm like '%forged program day insert was allowed%' then
        raise;
      elsif sqlerrm not like '%program provenance is RPC-only%'
            and sqlerrm not like '%foreign key%' then
        raise;
      end if;
  end;

  select id into v_day from public.program_days
   where program_id = 'c3401941-0000-4000-8000-000000000010' and name = 'Upper A';
  v_wid := public.start_workout_from_template(
    'Upper A stamp',
    now(),
    null,
    'c3401941-0000-4000-8000-0000000000b1',
    v_day,
    '[]'::jsonb
  );
  select program_revision_no into v_rev from public.workouts where id = v_wid;
  if v_rev is null then
    raise exception 'legitimate start left program_revision_no null';
  end if;
  if (select program_id from public.workouts where id = v_wid)
       is distinct from 'c3401941-0000-4000-8000-000000000010' then
    raise exception 'legitimate start left program_id unset';
  end if;

  begin
    update public.workouts set program_revision_no = v_rev + 1 where id = v_wid;
    raise exception 'stamp update was allowed';
  exception
    when others then
      if sqlerrm like '%stamp update was allowed%' then
        raise;
      elsif sqlerrm not like '%program provenance is immutable%' then
        raise;
      end if;
  end;

  select we.id into v_ex
  from public.workout_exercises we
  where we.workout_id = v_wid
  order by we.order_index
  limit 1;

  update public.workout_exercises set name = 'Bench (swap)' where id = v_ex;

  begin
    update public.workout_exercises set prescribed_sets = 99 where id = v_ex;
    raise exception 'prescribed update was allowed';
  exception
    when others then
      if sqlerrm like '%prescribed update was allowed%' then
        raise;
      elsif sqlerrm not like '%workout prescription is immutable%' then
        raise;
      end if;
  end;

  begin
    update public.workout_exercises set prescription_source = 'user' where id = v_ex;
    raise exception 'prescription_source update was allowed';
  exception
    when others then
      if sqlerrm like '%prescription_source update was allowed%' then
        raise;
      elsif sqlerrm not like '%prescription_source is immutable%' then
        raise;
      end if;
  end;

  insert into public.workouts(id, user_id, name, date)
  values (
    'c3401941-0000-4000-8000-0000000000e1',
    'c3401941-0000-4000-8000-000000000001',
    'Solo add',
    now()
  );

  begin
    insert into public.workout_exercises(
      workout_id, name, order_index,
      prescribed_sets, prescribed_reps, prescribed_rir, prescription_source
    ) values (
      'c3401941-0000-4000-8000-0000000000e1',
      'Fake coach',
      0,
      99, 99, 0, 'program'
    );
    raise exception 'direct fake prescription_source=program was allowed';
  exception
    when others then
      if sqlerrm like '%direct fake prescription_source=program was allowed%' then
        raise;
      elsif sqlerrm not like '%prescription_source is RPC-only%' then
        raise;
      end if;
  end;

  insert into public.workout_exercises(
    workout_id, name, order_index,
    prescribed_sets, prescribed_reps, prescription_source
  ) values (
    'c3401941-0000-4000-8000-0000000000e1',
    'Solo target',
    0,
    6, 8, 'user'
  );
  if not exists (
    select 1 from public.workout_exercises
    where workout_id = 'c3401941-0000-4000-8000-0000000000e1'
      and name = 'Solo target'
      and prescription_source = 'user'
      and prescribed_sets = 6
  ) then
    raise exception 'direct user addition was refused';
  end if;
end $$;
reset role;

-- Timezone boundary: Vancouver still previous civil day while UTC is next.
do $$
declare
  v_at timestamptz := timestamptz '2026-09-29 06:30:00+00';
  v_phase_van uuid;
  v_phase_utc uuid;
begin
  if public.program_civil_date('America/Vancouver', v_at) is distinct from date '2026-09-28' then
    raise exception 'Vancouver civil date expected 2026-09-28';
  end if;
  if public.program_civil_date('UTC', v_at) is distinct from date '2026-09-29' then
    raise exception 'UTC civil date expected 2026-09-29';
  end if;
  v_phase_van := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000010',
    date '2026-09-01',
    date '2026-09-28'
  );
  v_phase_utc := public.program_current_phase_id(
    'c3401941-0000-4000-8000-000000000010',
    date '2026-09-01',
    date '2026-09-29'
  );
  if v_phase_van is distinct from 'c3401941-0000-4000-8000-0000000000a1' then
    raise exception 'Vancouver Sep 28 should still be Accumulation';
  end if;
  if v_phase_utc is distinct from 'c3401941-0000-4000-8000-0000000000a2' then
    raise exception 'UTC Sep 29 should be Intensification';
  end if;
end $$;

-- Activer maintenant uses owner civil today; scheduled/due keeps planned date.
-- Owner 000001 timezone is UTC. Do not call internalized program_civil_date as authenticated.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_rev int;
  v_anchor date;
  v_today date;
  v_planned date;
begin
  v_today := (now() AT TIME ZONE 'UTC')::date;
  v_planned := v_today + 10;
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000010',
    'Version Now',
    'now block',
    8,
    '[{"weekday":1,"name":"Now day","exercises":[{"name":"Press","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-000000000010',
    v_rev,
    v_planned,
    true,
    null
  );
  perform public.activate_program_version(
    'c3401941-0000-4000-8000-000000000010',
    v_rev,
    null
  );
  select phase_anchor_on into v_anchor
  from public.programs
  where id = 'c3401941-0000-4000-8000-000000000010';
  if v_anchor is distinct from v_today then
    raise exception 'activate now anchored %, expected owner today % not planned %', v_anchor, v_today, v_planned;
  end if;

  -- Past dates are refused (tested later). A future schedule keeps the planned
  -- date as a pointer and must not move the live anchor.
  v_rev := public.save_program_version(
    'c3401941-0000-4000-8000-000000000010',
    'Version Due',
    'due block',
    8,
    '[{"weekday":1,"name":"Due day","exercises":[{"name":"Press","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_planned := v_today + 10;
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-000000000010',
    v_rev,
    v_planned,
    true,
    null
  );
  if (select scheduled_revision_no from public.programs
      where id = 'c3401941-0000-4000-8000-000000000010') is distinct from v_rev then
    raise exception 'future schedule did not record revision';
  end if;
  if (select scheduled_activates_on from public.programs
      where id = 'c3401941-0000-4000-8000-000000000010') is distinct from v_planned then
    raise exception 'future schedule did not keep planned date %', v_planned;
  end if;
  select phase_anchor_on into v_anchor
  from public.programs
  where id = 'c3401941-0000-4000-8000-000000000010';
  if v_anchor is distinct from v_today then
    raise exception 'future schedule mutated live anchor %, expected %', v_anchor, v_today;
  end if;
end $$;
reset role;

-- Legacy backfill: freeze live graph, do not rewrite historical workout revisions.
-- Self-assign on 000002: 000001 already has an active assignment, and
-- assigned_by <> client_id requires an active coach_client_link.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','{}',true);
insert into public.programs(id,owner_id,name,description,duration_weeks)
values ('c3401941-0000-4000-8000-000000000099','c3401941-0000-4000-8000-000000000001','Legacy','',4);
insert into public.program_days(id,program_id,weekday,name,order_index)
values ('c3401941-0000-4000-8000-00000000009d','c3401941-0000-4000-8000-000000000099',1,'Legacy day',0);
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-00000000009a',
  'c3401941-0000-4000-8000-000000000099',
  'c3401941-0000-4000-8000-000000000002',
  'c3401941-0000-4000-8000-000000000002',
  current_date,
  'active'
);
insert into public.workouts(id,user_id,name,date,program_assignment_id,program_day_id)
values (
  'c3401941-0000-4000-8000-00000000009c',
  'c3401941-0000-4000-8000-000000000002',
  'Old log',
  now(),
  'c3401941-0000-4000-8000-00000000009a',
  'c3401941-0000-4000-8000-00000000009d'
);
do $$
declare
  v_id uuid;
  v_no int;
  v_before int;
begin
  if (select active_revision_no from public.programs where id = 'c3401941-0000-4000-8000-000000000099') is not null then
    raise exception 'legacy fixture already had an active revision';
  end if;
  if (select program_revision_no from public.workouts where id = 'c3401941-0000-4000-8000-00000000009c') is not null then
    raise exception 'legacy workout already had a revision stamp';
  end if;

  select count(*) into v_before
  from public.programs p
  join public.program_assignments pa on pa.program_id = p.id and pa.status = 'active'
  where p.active_revision_no is null;
  if v_before < 1 then
    raise exception 'expected at least the legacy fixture to need backfill';
  end if;

  -- Replay the candidate backfill (same loop as 20260920014500).
  for v_id in
    select p.id
    from public.programs p
    where p.active_revision_no is null
       or not exists (
         select 1 from public.program_revisions r
         where r.program_id = p.id
           and r.revision_no = p.active_revision_no
       )
  loop
    perform public.snapshot_program_revision(v_id);
  end loop;

  select active_revision_no into v_no
  from public.programs where id = 'c3401941-0000-4000-8000-000000000099';
  if v_no is null then
    raise exception 'legacy backfill did not set active_revision_no';
  end if;
  if (select program_revision_no from public.workouts where id = 'c3401941-0000-4000-8000-00000000009c') is not null then
    raise exception 'legacy workout was retro-stamped with a revision';
  end if;
  update public.workouts w
     set program_id = pa.program_id
    from public.program_assignments pa
   where w.id = 'c3401941-0000-4000-8000-00000000009c'
     and w.program_assignment_id = pa.id
     and w.program_id is null;
  if (select program_id from public.workouts where id = 'c3401941-0000-4000-8000-00000000009c')
       is distinct from 'c3401941-0000-4000-8000-000000000099' then
    raise exception 'legacy workout program_id was not backfilled from assignment';
  end if;
  if exists (
    select 1
    from public.programs p
    join public.program_assignments pa on pa.program_id = p.id and pa.status = 'active'
    where p.active_revision_no is null
  ) then
    raise exception 'active assignment without active_revision_no after backfill';
  end if;
end $$;

-- 21 sets rejected at save; 20 is executable. Mixed timed/untimed rejected.
-- Assignment after activation starts week 1 (laterOf).
update public.program_assignments
   set status = 'paused'
 where client_id = 'c3401941-0000-4000-8000-000000000001'
   and status = 'active';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_id uuid;
  v_days int;
  v_asg uuid := 'c3401941-0000-4000-8000-0000000000f1';
  v_day uuid;
  v_phase uuid;
  v_late uuid;
begin
  begin
    perform public.create_program_complete(
      'Too many sets',
      '',
      4,
      '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":21,"default_reps":5}]}]'::jsonb
    );
    raise exception '21 sets create was allowed';
  exception
    when others then
      if sqlerrm like '%21 sets create was allowed%' then
        raise;
      elsif sqlerrm not like '%Invalid sets%' then
        raise;
      end if;
  end;

  v_id := public.create_program_complete(
    'Twenty sets',
    '',
    4,
    '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":20,"default_reps":5}]}]'::jsonb
  );
  v_days := public.save_program(
    v_id,
    'Twenty sets',
    '',
    4,
    '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":20,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception '20 sets save expected 1 day, got %', v_days;
  end if;
  begin
    perform public.save_program(
      v_id,
      'Twenty-one sets',
      '',
      4,
      '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":21,"default_reps":5}]}]'::jsonb,
      null
    );
    raise exception '21 sets save was allowed';
  exception
    when others then
      if sqlerrm like '%21 sets save was allowed%' then
        raise;
      elsif sqlerrm not like '%Invalid sets%' then
        raise;
      end if;
  end;
  begin
    perform public.save_program_version(
      v_id,
      'Twenty-one future',
      '',
      4,
      '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":21,"default_reps":5}]}]'::jsonb,
      null
    );
    raise exception '21 sets version was allowed';
  exception
    when others then
      if sqlerrm like '%21 sets version was allowed%' then
        raise;
      elsif sqlerrm not like '%Invalid sets%' then
        raise;
      end if;
  end;

  begin
    perform public.save_program(
      v_id,
      'Mixed phases',
      '',
      8,
      '[
        {"weekday":1,"name":"A","phase_id":"c3401941-0000-4000-8000-0000000000e2","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]},
        {"weekday":2,"name":"B","phase_id":"c3401941-0000-4000-8000-0000000000e3","exercises":[{"name":"Row","default_sets":3,"default_reps":5}]}
      ]'::jsonb,
      null,
      'fixed_days',
      '[
        {"id":"c3401941-0000-4000-8000-0000000000e2","name":"Timed","duration_weeks":4},
        {"id":"c3401941-0000-4000-8000-0000000000e3","name":"Untimed"}
      ]'::jsonb
    );
    raise exception 'mixed phase durations were allowed';
  exception
    when others then
      if sqlerrm like '%mixed phase durations were allowed%' then
        raise;
      elsif sqlerrm not like '%mixed phase durations%' then
        raise;
      end if;
  end;

  perform set_config('test.twenty_sets_program', v_id::text, true);
end $$;
reset role;

select public.snapshot_program_revision(current_setting('test.twenty_sets_program')::uuid);
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-0000000000f1',
  current_setting('test.twenty_sets_program')::uuid,
  'c3401941-0000-4000-8000-000000000001',
  'c3401941-0000-4000-8000-000000000001',
  current_date,
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_day uuid;
begin
  select id into v_day
  from public.program_days
  where program_id = current_setting('test.twenty_sets_program')::uuid
  limit 1;
  perform public.start_workout_from_template(
    'Twenty sets log',
    now(),
    null,
    'c3401941-0000-4000-8000-0000000000f1',
    v_day,
    '[]'::jsonb
  );
end $$;
reset role;

update public.program_assignments
   set status = 'paused'
 where id = 'c3401941-0000-4000-8000-0000000000f1';

-- New client assigned after activation starts week 1, not a later phase.
insert into public.programs(id,owner_id,name,description,duration_weeks)
values ('c3401941-0000-4000-8000-0000000000e4','c3401941-0000-4000-8000-000000000001','Late assign','',9);
insert into public.program_phases(id,program_id,name,order_index,duration_weeks) values
 ('c3401941-0000-4000-8000-0000000000e5','c3401941-0000-4000-8000-0000000000e4','Accumulation',0,4),
 ('c3401941-0000-4000-8000-0000000000e6','c3401941-0000-4000-8000-0000000000e4','Intensification',1,4),
 ('c3401941-0000-4000-8000-0000000000e7','c3401941-0000-4000-8000-0000000000e4','Deload',2,1);
insert into public.program_days(id,program_id,weekday,name,order_index,phase_id) values
 ('c3401941-0000-4000-8000-0000000000e8','c3401941-0000-4000-8000-0000000000e4',1,'Acc day',0,'c3401941-0000-4000-8000-0000000000e5'),
 ('c3401941-0000-4000-8000-0000000000e9','c3401941-0000-4000-8000-0000000000e4',1,'Int day',1,'c3401941-0000-4000-8000-0000000000e6');
insert into public.program_day_exercises(program_day_id,name,default_sets,default_reps,order_index)
values ('c3401941-0000-4000-8000-0000000000e8','Bench',3,5,0),
       ('c3401941-0000-4000-8000-0000000000e9','Press',5,3,0);
select public.snapshot_program_revision('c3401941-0000-4000-8000-0000000000e4');
update public.programs
   set phase_anchor_on = current_date - 60
 where id = 'c3401941-0000-4000-8000-0000000000e4';
update public.program_revisions
   set version_start_on = current_date - 60,
       activated_at = coalesce(activated_at, now())
 where program_id = 'c3401941-0000-4000-8000-0000000000e4';
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-0000000000ea',
  'c3401941-0000-4000-8000-0000000000e4',
  'c3401941-0000-4000-8000-000000000001',
  'c3401941-0000-4000-8000-000000000001',
  current_date,
  'active'
);

do $$
declare
  v_effective date;
  v_phase uuid;
begin
  select public.program_effective_version_start(pa.start_date, coalesce(r.version_start_on, p.phase_anchor_on))
    into v_effective
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  left join public.program_revisions r
    on r.program_id = p.id and r.revision_no = p.active_revision_no
  where pa.id = 'c3401941-0000-4000-8000-0000000000ea';
  if v_effective is distinct from current_date then
    raise exception 'late assignment effective start %, expected current_date', v_effective;
  end if;
  v_phase := public.program_current_phase_id(
    'c3401941-0000-4000-8000-0000000000e4',
    v_effective,
    current_date
  );
  if v_phase is distinct from 'c3401941-0000-4000-8000-0000000000e5' then
    raise exception 'late assignment should be week 1 Accumulation, got %', v_phase;
  end if;
  if public.program_current_phase_id(
       'c3401941-0000-4000-8000-0000000000e4',
       current_date - 60,
       current_date
     ) is not distinct from 'c3401941-0000-4000-8000-0000000000e5' then
    raise exception 'anchor-only clock did not leave week 1 — fixture is not past phase 1';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  perform public.start_workout_from_template(
    'Late week 1',
    now(),
    null,
    'c3401941-0000-4000-8000-0000000000ea',
    'c3401941-0000-4000-8000-0000000000e8',
    '[]'::jsonb
  );
  begin
    perform public.start_workout_from_template(
      'Late week 5 hijack',
      now(),
      null,
      'c3401941-0000-4000-8000-0000000000ea',
      'c3401941-0000-4000-8000-0000000000e9',
      '[]'::jsonb
    );
    raise exception 'late assignment started a later-phase day';
  exception
    when others then
      if sqlerrm like '%late assignment started a later-phase day%' then
        raise;
      elsif sqlerrm not like '%program_day_not_current_phase%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Freeze trigger must lock programs so activation/save cannot race the pin.
do $$
declare
  src text;
begin
  src := regexp_replace(
    lower(pg_get_functiondef('public.program_assignments_freeze_on_pause()'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('from public.programs p where p.id = new.program_id for update' in src) = 0 then
    raise exception 'freeze trigger does not lock programs FOR UPDATE';
  end if;
  src := regexp_replace(
    lower(pg_get_functiondef('public.lock_programs_for_assignment_mutation(uuid[])'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('order by p.id for update' in src) = 0 then
    raise exception 'assignment lock helper missing ORDER BY id FOR UPDATE';
  end if;
  src := regexp_replace(
    lower(pg_get_functiondef('public.lock_client_assignment_programs(uuid,uuid)'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('lock_client_assignment_mutex' in src) = 0
     or position('lock_client_assignment_mutex' in src)
        > position('lock_programs_for_assignment_mutation' in src) then
    raise exception 'assignment helper does not take client mutex before program locks';
  end if;
  src := regexp_replace(
    lower(pg_get_functiondef('public.assign_program_secure(uuid,uuid,date)'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('lock_client_assignment_programs' in src) = 0
     or position('lock_client_assignment_programs' in src)
        > position('set status = ''paused''' in src) then
    raise exception 'assign_program_secure does not lock programs before pause';
  end if;
  src := regexp_replace(
    lower(pg_get_functiondef('public.create_program_complete(text,text,int,jsonb,uuid,date,text,jsonb)'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('lock_client_assignment_programs' in src) = 0
     or position('lock_client_assignment_programs' in src)
        > position('set status = ''paused''' in src) then
    raise exception 'create_program_complete does not lock programs before pause';
  end if;
  src := regexp_replace(
    lower(pg_get_functiondef('public.close_coach_account(uuid)'::regprocedure)),
    '\s+',
    ' ',
    'g'
  );
  if position('remap_program_revision_snapshot' in src) = 0
     or position('apply_program_revision_snapshot' in src) = 0
     or position('lock_client_assignment_mutex' in src) = 0
     or position('lock_client_assignment_mutex' in src)
        > position('lock_programs_for_assignment_mutation' in src)
     or position('lock_programs_for_assignment_mutation' in src) = 0
     or position('frozen_revision_no = v_rev' in src) = 0
     or position('insert into public.program_days' in src) > 0 then
    raise exception 'close_coach_account is not on the P3 snapshot engine';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('programs', 'program_days', 'program_day_exercises', 'program_phases')
      and policyname like 'Assigned clients read%'
      and qual ilike '%paused%'
  ) then
    raise exception 'assigned-client live graph policy still allows paused';
  end if;
end $$;

-- Active client cannot SELECT an unscheduled saved draft; can SELECT active + scheduled.
-- 000002 already has the legacy self-assignment 00009a (one-active-per-client).
update public.program_assignments
   set status = 'paused'
 where id = 'c3401941-0000-4000-8000-00000000009a'
   and status = 'active';

insert into public.programs(id,owner_id,name,description,duration_weeks)
values ('c3401941-0000-4000-8000-0000000000ee','c3401941-0000-4000-8000-000000000001','Draft isolation','',8);
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3401941-0000-4000-8000-0000000000ef',
  'c3401941-0000-4000-8000-0000000000ee',
  'c3401941-0000-4000-8000-000000000002',
  'c3401941-0000-4000-8000-000000000002',
  current_date,
  'active'
);
update public.user_profiles
   set timezone = 'UTC'
 where id = 'c3401941-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_active int;
  v_sched int;
  v_draft int;
begin
  perform public.save_program(
    'c3401941-0000-4000-8000-0000000000ee',
    'Draft isolation',
    'live A',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_active := public.save_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    'Draft isolation',
    'live A',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  perform public.activate_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    v_active,
    null
  );
  v_sched := public.save_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    'Draft isolation scheduled',
    'sched',
    8,
    '[{"weekday":1,"name":"Push S","exercises":[{"name":"Row","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    v_sched,
    (current_date + 5),
    false,
    null
  );
  v_draft := public.save_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    'Private saved draft',
    'coach only',
    8,
    '[{"weekday":1,"name":"Secret","exercises":[{"name":"Curl","default_sets":3,"default_reps":10}]}]'::jsonb,
    null
  );
  perform set_config('test.draft_active', v_active::text, true);
  perform set_config('test.draft_sched', v_sched::text, true);
  perform set_config('test.draft_saved', v_draft::text, true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_active int := current_setting('test.draft_active')::int;
  v_sched int := current_setting('test.draft_sched')::int;
  v_draft int := current_setting('test.draft_saved')::int;
  v_seen int[];
begin
  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = 'c3401941-0000-4000-8000-0000000000ee';
  if not (v_active = any (v_seen)) then
    raise exception 'active client cannot SELECT current active revision';
  end if;
  if not (v_sched = any (v_seen)) then
    raise exception 'active client cannot SELECT scheduled revision';
  end if;
  if v_draft = any (v_seen) then
    raise exception 'active client SELECT unscheduled saved revision';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  n int;
begin
  select count(*) into n
  from public.program_revisions
  where program_id = 'c3401941-0000-4000-8000-0000000000ee';
  if n < 3 then
    raise exception 'owner lost full revision history, saw %', n;
  end if;
end $$;
reset role;

-- Assignment starting tomorrow: no program session today; RPC refused; start day allowed.
update public.program_assignments
   set start_date = current_date + 1
 where id = 'c3401941-0000-4000-8000-0000000000ef';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_day uuid;
begin
  select id into v_day
  from public.program_days
  where program_id = 'c3401941-0000-4000-8000-0000000000ee'
  limit 1;
  begin
    perform public.start_workout_from_template(
      'Too early',
      now(),
      null,
      'c3401941-0000-4000-8000-0000000000ef',
      v_day,
      '[]'::jsonb
    );
    raise exception 'future start_date workout was allowed';
  exception
    when others then
      if sqlerrm like '%future start_date workout was allowed%' then
        raise;
      elsif sqlerrm not like '%program_not_started%' then
        raise;
      end if;
  end;
end $$;
reset role;

update public.program_assignments
   set start_date = current_date
 where id = 'c3401941-0000-4000-8000-0000000000ef';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_day uuid;
begin
  select id into v_day
  from public.program_days
  where program_id = 'c3401941-0000-4000-8000-0000000000ee'
    and name = 'Push A'
  limit 1;
  if v_day is null then
    raise exception 'live Push A day missing for start-day week 1';
  end if;
  perform public.start_workout_from_template(
    'Start day week 1',
    now(),
    null,
    'c3401941-0000-4000-8000-0000000000ef',
    v_day,
    '[]'::jsonb
  );
end $$;
reset role;

-- Past schedule date refused against the frozen owner civil clock.
-- program_civil_date / program_activation_timezone are internalized; compute
-- the owner clock as postgres, then call schedule as authenticated.
do $$
begin
  perform set_config('test.owner_today', (now() at time zone 'UTC')::date::text, true);
  perform set_config('test.utc_today', (now() at time zone 'UTC')::date::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_rev int := current_setting('test.draft_saved')::int;
  v_today date := current_setting('test.owner_today')::date;
  v_today_rev int;
begin
  begin
    perform public.schedule_program_version(
      'c3401941-0000-4000-8000-0000000000ee',
      v_rev,
      (v_today - 1),
      true,
      null
    );
    raise exception 'past activation date was allowed';
  exception
    when others then
      if sqlerrm like '%past activation date was allowed%' then
        raise;
      elsif sqlerrm not like '%activation_date_in_past%' then
        raise;
      end if;
  end;

  -- Today → immediate activation, anchor today.
  v_today_rev := public.save_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    'Activate today',
    'today apply',
    8,
    '[{"weekday":1,"name":"Today","exercises":[{"name":"Press","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  perform public.schedule_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    v_today_rev,
    v_today,
    true,
    null
  );
  if (select active_revision_no from public.programs
      where id = 'c3401941-0000-4000-8000-0000000000ee') is distinct from v_today_rev then
    raise exception 'today schedule did not apply immediately';
  end if;
  if (select phase_anchor_on from public.programs
      where id = 'c3401941-0000-4000-8000-0000000000ee') is distinct from v_today then
    raise exception 'today schedule anchored %, expected %',
      (select phase_anchor_on from public.programs where id = 'c3401941-0000-4000-8000-0000000000ee'),
      v_today;
  end if;
end $$;
reset role;

-- Owner profile Toronto vs UTC midnight: yesterday in Toronto is still past.
update public.user_profiles
   set timezone = 'America/Toronto'
 where id = 'c3401941-0000-4000-8000-000000000001';

do $$
begin
  perform set_config(
    'test.toronto_today',
    (now() at time zone 'America/Toronto')::date::text,
    true
  );
  perform set_config('test.utc_today', (now() at time zone 'UTC')::date::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401941-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_rev int := public.save_program_version(
    'c3401941-0000-4000-8000-0000000000ee',
    'TZ boundary draft',
    '',
    8,
    '[{"weekday":1,"name":"TZ","exercises":[{"name":"Fly","default_sets":3,"default_reps":8}]}]'::jsonb,
    null
  );
  v_today date := current_setting('test.toronto_today')::date;
  v_utc date := current_setting('test.utc_today')::date;
begin
  begin
    perform public.schedule_program_version(
      'c3401941-0000-4000-8000-0000000000ee',
      v_rev,
      (v_today - 1),
      true,
      null
    );
    raise exception 'Toronto-past activation date was allowed';
  exception
    when others then
      if sqlerrm like '%Toronto-past activation date was allowed%' then
        raise;
      elsif sqlerrm not like '%activation_date_in_past%' then
        raise;
      end if;
  end;
  -- When UTC is already the next civil day, that date is still future for Toronto.
  if v_utc > v_today then
    perform public.schedule_program_version(
      'c3401941-0000-4000-8000-0000000000ee',
      v_rev,
      v_utc,
      true,
      null
    );
    if (select scheduled_revision_no from public.programs
        where id = 'c3401941-0000-4000-8000-0000000000ee') is distinct from v_rev then
      raise exception 'UTC-ahead civil date was treated as past for owner TZ';
    end if;
    if (select active_revision_no from public.programs
        where id = 'c3401941-0000-4000-8000-0000000000ee') is not distinct from v_rev then
      raise exception 'UTC-ahead civil date applied immediately in Toronto';
    end if;
  end if;
end $$;
reset role;

rollback;
\echo 'program hardening: phase engine, duplicate weekdays, server prescription, civil date, relation end, Data API, name/description, helper ACL, delete, frozen tz'
\echo 'delete_program locks program row FOR UPDATE before checks'
\echo 'program hardening: provenance immutability, program_id stamp, prescribed freeze, version backfill, activate now vs due'
\echo 'program hardening: allowlist ACL, assignment Data API closed, laterOf start, 20/21 sets, mixed phases, prescription_source'
\echo 'program hardening: live graph active-only, revision drafts, not-started, past schedule, freeze FOR UPDATE, archive RPC'
