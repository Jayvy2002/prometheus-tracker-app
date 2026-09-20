-- P3.3 — versions / activation on the existing revision engine.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3391941-0000-4000-8000-000000000001','p33-owner@example.test'),
 ('c3391941-0000-4000-8000-000000000002','p33-stranger@example.test'),
 ('c3391941-0000-4000-8000-000000000003','p33-coach@example.test'),
 ('c3391941-0000-4000-8000-000000000004','p33-client@example.test'),
 ('c3391941-0000-4000-8000-000000000005','p33-dual@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3391941-0000-4000-8000-000000000001','free','none'),
 ('c3391941-0000-4000-8000-000000000002','free','none'),
 ('c3391941-0000-4000-8000-000000000003','free','coach'),
 ('c3391941-0000-4000-8000-000000000004','free','none'),
 ('c3391941-0000-4000-8000-000000000005','free','coach')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3391941-0000-4000-8000-000000000003','coach'),
 ('c3391941-0000-4000-8000-000000000005','coach')
on conflict do nothing;

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3391941-0000-4000-8000-000000000010','c3391941-0000-4000-8000-000000000001','Version A','',12);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Legacy save still mutates live and becomes the active version.
do $$
declare
  v_days int;
  v_active int;
begin
  v_days := public.save_program(
    'c3391941-0000-4000-8000-000000000010',
    'Version A',
    '',
    12,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  if v_days is distinct from 1 then
    raise exception 'legacy save expected 1 day, got %', v_days;
  end if;
  select active_revision_no into v_active
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  if v_active is null then
    raise exception 'legacy program has no derived active version';
  end if;
end $$;

-- Saved future version does not rewrite live days.
do $$
declare
  v_rev int;
  v_name text;
  v_count int;
begin
  v_rev := public.save_program_version(
    'c3391941-0000-4000-8000-000000000010',
    'Version B',
    '',
    12,
    '[{"weekday":1,"name":"Lower","exercises":[{"name":"Squat","default_sets":4,"default_reps":6}]},{"weekday":3,"name":"Upper","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'fixed_days',
    '[{"name":"Intensification","duration_weeks":4}]'::jsonb
  );
  if v_rev is null or v_rev < 2 then
    raise exception 'expected saved version revision >= 2, got %', v_rev;
  end if;
  select name into v_name from public.program_days
  where program_id = 'c3391941-0000-4000-8000-000000000010' and weekday = 1;
  if v_name is distinct from 'Push' then
    raise exception 'future save mutated live day, got %', v_name;
  end if;
  select count(*) into v_count from public.program_days
  where program_id = 'c3391941-0000-4000-8000-000000000010';
  if v_count is distinct from 1 then
    raise exception 'future save added live days, got %', v_count;
  end if;
  select count(*) into v_count from public.program_phases
  where program_id = 'c3391941-0000-4000-8000-000000000010';
  if v_count is distinct from 0 then
    raise exception 'future save mutated live phases, got %', v_count;
  end if;
  perform public.schedule_program_version(
    'c3391941-0000-4000-8000-000000000010',
    v_rev,
    (current_date + 7),
    false,
    null
  );
end $$;

-- Retry of the same scheduled revision is idempotent.
do $$
declare
  v_rev int;
  v_out int;
begin
  select scheduled_revision_no into v_rev
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  v_out := public.schedule_program_version(
    'c3391941-0000-4000-8000-000000000010',
    v_rev,
    (current_date + 7),
    false,
    null
  );
  if v_out is distinct from v_rev then
    raise exception 'retry schedule changed revision % vs %', v_out, v_rev;
  end if;
end $$;

-- A second future version without replace fails; replace succeeds.
do $$
declare
  v_rev int;
  v_sched int;
begin
  v_rev := public.save_program_version(
    'c3391941-0000-4000-8000-000000000010',
    'Version C',
    '',
    8,
    '[{"weekday":2,"name":"Full","exercises":[{"name":"Deadlift","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  begin
    perform public.schedule_program_version(
      'c3391941-0000-4000-8000-000000000010',
      v_rev,
      (current_date + 14),
      false,
      null
    );
    raise exception 'second future version was allowed';
  exception
    when others then
      if sqlerrm not like '%already_scheduled%' then
        raise;
      end if;
  end;
  perform public.schedule_program_version(
    'c3391941-0000-4000-8000-000000000010',
    v_rev,
    (current_date + 14),
    true,
    null
  );
  select scheduled_revision_no into v_sched
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  if v_sched is distinct from v_rev then
    raise exception 'replace did not point at version C';
  end if;
end $$;

-- Stamp a workout against Version A before activation.
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3391941-0000-4000-8000-0000000000a1',
  'c3391941-0000-4000-8000-000000000010',
  'c3391941-0000-4000-8000-000000000001',
  'c3391941-0000-4000-8000-000000000001',
  current_date,
  'active'
);

do $$
declare
  v_wid uuid;
  v_day uuid;
  v_rev int;
begin
  select id into v_day from public.program_days
  where program_id = 'c3391941-0000-4000-8000-000000000010' limit 1;
  select active_revision_no into v_rev
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  v_wid := public.start_workout_from_template(
    'Push A',
    now(),
    null,
    'c3391941-0000-4000-8000-0000000000a1',
    v_day,
    '[{"name":"Bench","default_sets":1,"default_reps":5}]'::jsonb
  );
  if (select program_revision_no from public.workouts where id = v_wid) is distinct from v_rev then
    raise exception 'logger did not stamp active revision';
  end if;
end $$;

-- Activate C now. Live graph becomes Full/Deadlift. Historical workout stays on A.
do $$
declare
  v_rev int;
  v_name text;
  v_wid uuid;
  v_old int;
  v_active int;
begin
  select scheduled_revision_no into v_rev
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  select id into v_wid from public.workouts
  where program_assignment_id = 'c3391941-0000-4000-8000-0000000000a1' limit 1;
  select program_revision_no into v_old from public.workouts where id = v_wid;

  perform public.activate_program_version(
    'c3391941-0000-4000-8000-000000000010',
    v_rev,
    null
  );
  -- double-click / retry
  perform public.activate_program_version(
    'c3391941-0000-4000-8000-000000000010',
    v_rev,
    null
  );
  select name into v_name from public.program_days
  where program_id = 'c3391941-0000-4000-8000-000000000010' limit 1;
  if v_name is distinct from 'Full' then
    raise exception 'activation did not apply version C, live=%', v_name;
  end if;
  if (select program_revision_no from public.workouts where id = v_wid) is distinct from v_old then
    raise exception 'activation rewrote historical workout revision';
  end if;
  select active_revision_no into v_active
  from public.programs where id = 'c3391941-0000-4000-8000-000000000010';
  if v_active is distinct from v_rev then
    raise exception 'active pointer not C';
  end if;
  if (select scheduled_revision_no from public.programs
      where id = 'c3391941-0000-4000-8000-000000000010') is not null then
    raise exception 'scheduled pointer survived activation';
  end if;
end $$;

-- Activating a historical revision fails.
do $$
declare
  v_hist int;
begin
  select min(revision_no) into v_hist
  from public.program_revisions
  where program_id = 'c3391941-0000-4000-8000-000000000010';
  begin
    perform public.activate_program_version(
      'c3391941-0000-4000-8000-000000000010',
      v_hist,
      null
    );
    raise exception 'historical activation was allowed';
  exception
    when others then
      if sqlerrm not like '%historical%' then
        raise;
      end if;
  end;
end $$;

-- Stale schedule is refused.
do $$
begin
  begin
    perform public.schedule_program_version(
      'c3391941-0000-4000-8000-000000000010',
      (select max(revision_no) from public.program_revisions
       where program_id = 'c3391941-0000-4000-8000-000000000010'),
      (current_date + 3),
      true,
      '2000-01-01 00:00:00+00'::timestamptz
    );
    raise exception 'stale schedule was allowed';
  exception
    when others then
      if sqlerrm not like '%stale%' then
        raise;
      end if;
  end;
end $$;

-- Pointers are RPC-only for authenticated Data API.
do $$
begin
  begin
    update public.programs
    set scheduled_revision_no = 1
    where id = 'c3391941-0000-4000-8000-000000000010';
    raise exception 'authenticated pointer update was allowed';
  exception
    when others then
      if sqlerrm not like '%RPC-only%' and sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Stranger cannot save/activate.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.save_program_version(
      'c3391941-0000-4000-8000-000000000010',
      'Hijack',
      '',
      8,
      '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
      null,
      'fixed_days',
      '[]'::jsonb
    );
    raise exception 'stranger save_program_version was allowed';
  exception
    when others then
      if sqlerrm not like '%Not program owner%' then
        raise;
      end if;
  end;
  begin
    perform public.ensure_due_program_version('c3391941-0000-4000-8000-000000000010');
    raise exception 'stranger ensure_due was allowed';
  exception
    when others then
      if sqlerrm not like '%Not authorized%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Coach + leftover Coaché.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3391941-0000-4000-8000-000000000012','c3391941-0000-4000-8000-000000000005','Dual leftover','',8),
 ('c3391941-0000-4000-8000-000000000013','c3391941-0000-4000-8000-000000000005','Roster plan','',8);
insert into public.coach_client_links(id,coach_id,client_id,status)
values ('c3391941-0000-4000-8000-0000000000aa','c3391941-0000-4000-8000-000000000003','c3391941-0000-4000-8000-000000000005','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values
 ('c3391941-0000-4000-8000-0000000000b1','c3391941-0000-4000-8000-000000000012','c3391941-0000-4000-8000-000000000005','c3391941-0000-4000-8000-000000000003',current_date,'active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.save_program_version(
      'c3391941-0000-4000-8000-000000000012',
      'Hijack leftover',
      '',
      8,
      '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
      null,
      'fixed_days',
      '[]'::jsonb
    );
    raise exception 'dual leftover version save was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%' then
        raise;
      end if;
  end;
  begin
    perform public.schedule_program_version(
      'c3391941-0000-4000-8000-000000000012',
      1,
      current_date,
      false,
      null
    );
    raise exception 'dual leftover version schedule was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%' then
        raise;
      end if;
  end;
  begin
    perform public.activate_program_version(
      'c3391941-0000-4000-8000-000000000012',
      1,
      null
    );
    raise exception 'dual leftover version activate was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%' then
        raise;
      end if;
  end;
end $$;

do $$
declare
  v_rev int;
  v_today date;
begin
  perform public.save_program(
    'c3391941-0000-4000-8000-000000000013',
    'Roster plan',
    '',
    8,
    '[{"weekday":1,"name":"Upper","exercises":[{"name":"Press","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_rev := public.save_program_version(
    'c3391941-0000-4000-8000-000000000013',
    'Roster B',
    '',
    8,
    '[{"weekday":1,"name":"Lower","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  -- Civil "today" of the frozen owner clock, not UTC CURRENT_DATE.
  v_today := (now() AT TIME ZONE 'America/Toronto')::date;
  perform public.schedule_program_version(
    'c3391941-0000-4000-8000-000000000013',
    v_rev,
    v_today,
    false,
    null
  );
  if (select name from public.program_days
      where program_id = 'c3391941-0000-4000-8000-000000000013' limit 1)
     is distinct from 'Lower' then
    raise exception 'same-day schedule did not activate roster version';
  end if;
end $$;
reset role;

-- Assigned client can ensure a due version; former coach cannot after the link ends.
insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('c3391941-0000-4000-8000-000000000014','c3391941-0000-4000-8000-000000000003','Client plan','',8);
insert into public.coach_client_links(id,coach_id,client_id,status)
values ('c3391941-0000-4000-8000-0000000000ab','c3391941-0000-4000-8000-000000000003','c3391941-0000-4000-8000-000000000004','active');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status)
values (
  'c3391941-0000-4000-8000-0000000000c1',
  'c3391941-0000-4000-8000-000000000014',
  'c3391941-0000-4000-8000-000000000004',
  'c3391941-0000-4000-8000-000000000003',
  current_date,
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_rev int;
begin
  perform public.save_program(
    'c3391941-0000-4000-8000-000000000014',
    'Client plan',
    '',
    8,
    '[{"weekday":1,"name":"A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'in_order'
  );
  v_rev := public.save_program_version(
    'c3391941-0000-4000-8000-000000000014',
    'Client plan B',
    '',
    8,
    '[{"weekday":null,"name":"B","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'in_order',
    '[]'::jsonb
  );
  perform public.schedule_program_version(
    'c3391941-0000-4000-8000-000000000014',
    v_rev,
    (current_date + 7),
    false,
    null
  );
end $$;
reset role;

-- Assigned client can apply a due schedule (date reached) without being owner.
update public.programs
set scheduled_activates_on = (now() AT TIME ZONE COALESCE(scheduled_activation_timezone, 'America/Toronto'))::date
where id = 'c3391941-0000-4000-8000-000000000014';

set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_out int;
begin
  v_out := public.ensure_due_program_version('c3391941-0000-4000-8000-000000000014');
  if v_out is null or v_out = 0 then
    raise exception 'assigned client ensure_due did not activate';
  end if;
  if (select name from public.program_days
      where program_id = 'c3391941-0000-4000-8000-000000000014' limit 1)
     is distinct from 'B' then
    raise exception 'client due activation did not apply version B';
  end if;
end $$;
reset role;

-- After ending the relation, former coach cannot activate a new saved version.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3391941-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3391941-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_rev int;
begin
  perform public.end_coach_client_link('c3391941-0000-4000-8000-000000000004');
  v_rev := public.save_program_version(
    'c3391941-0000-4000-8000-000000000014',
    'After split',
    '',
    8,
    '[{"weekday":null,"name":"C","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    null,
    'in_order',
    '[]'::jsonb
  );
  begin
    perform public.activate_program_version(
      'c3391941-0000-4000-8000-000000000014',
      v_rev,
      null
    );
    raise exception 'former coach activation was allowed';
  exception
    when others then
      if sqlerrm not like '%Not an active coach of this assignment%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- Grants
do $$
declare
  v_oid oid;
begin
  v_oid := to_regprocedure('public.save_program_version(uuid,text,text,int,jsonb,timestamptz,text,jsonb)');
  if v_oid is null then raise exception 'save_program_version missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'save_program_version granted to anon';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'save_program_version missing authenticated execute';
  end if;
  v_oid := to_regprocedure('public.schedule_program_version(uuid,int,date,boolean,timestamptz)');
  if v_oid is null then raise exception 'schedule_program_version missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'schedule granted to anon';
  end if;
  v_oid := to_regprocedure('public.activate_program_version(uuid,int,timestamptz)');
  if v_oid is null then raise exception 'activate_program_version missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'activate granted to anon';
  end if;
  v_oid := to_regprocedure('public.ensure_due_program_version(uuid)');
  if v_oid is null then raise exception 'ensure_due_program_version missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'ensure_due granted to anon';
  end if;
  v_oid := to_regprocedure('public.apply_program_revision_snapshot(uuid,int)');
  if v_oid is null then raise exception 'apply helper missing'; end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'apply helper granted to authenticated';
  end if;
  v_oid := to_regprocedure('public.sync_program_days(uuid,jsonb,boolean,boolean)');
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'trusted sync_program_days granted to authenticated';
  end if;
end $$;

\echo 'program versions: saved without live mutate, schedule/replace, activate idempotent, historical locked, leftover, logger stamp'

commit;
