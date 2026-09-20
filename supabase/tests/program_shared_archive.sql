-- Shared program: A leaves, archive freezes; B stays active; Coach can still version.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401950-0000-4000-8000-000000000001','p3s-coach@example.test'),
 ('c3401950-0000-4000-8000-000000000002','p3s-client-a@example.test'),
 ('c3401950-0000-4000-8000-000000000003','p3s-client-b@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401950-0000-4000-8000-000000000001','free','coach'),
 ('c3401950-0000-4000-8000-000000000002','free','none'),
 ('c3401950-0000-4000-8000-000000000003','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401950-0000-4000-8000-000000000001','coach')
on conflict do nothing;
update public.user_profiles
   set timezone = 'America/Toronto'
 where id in (
   'c3401950-0000-4000-8000-000000000001',
   'c3401950-0000-4000-8000-000000000002',
   'c3401950-0000-4000-8000-000000000003'
 );

insert into public.coach_client_links(coach_id,client_id,status) values
 ('c3401950-0000-4000-8000-000000000001','c3401950-0000-4000-8000-000000000002','active'),
 ('c3401950-0000-4000-8000-000000000001','c3401950-0000-4000-8000-000000000003','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid;
  v_rev int;
begin
  v_program := public.create_program_complete(
    'Shared archive',
    'version A',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb
  );
  perform set_config('test.shared_program', v_program::text, true);
  perform public.assign_program_secure(
    v_program,
    'c3401950-0000-4000-8000-000000000002',
    current_date
  );
  perform public.assign_program_secure(
    v_program,
    'c3401950-0000-4000-8000-000000000003',
    current_date
  );
  v_rev := public.save_program_version(
    v_program,
    'Shared archive',
    'version A',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  perform public.activate_program_version(v_program, v_rev, null);
  perform set_config('test.shared_rev_a', v_rev::text, true);
end $$;
reset role;

do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev int := current_setting('test.shared_rev_a')::int;
begin
  if (select count(*) from public.program_assignments
      where program_id = v_program and status = 'active') is distinct from 2 then
    raise exception 'expected two active assignments';
  end if;
  if not public.actor_can_activate_program_version(v_program) then
    -- jwt cleared; helper uses auth.uid() so this must be called as coach.
    null;
  end if;
  if (select r.version_start_on
        from public.program_revisions r
       where r.program_id = v_program and r.revision_no = v_rev) is null then
    raise exception 'activated shared revision missing version_start_on';
  end if;
end $$;

-- A leaves: pause + freeze. B remains active.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_out jsonb;
begin
  v_out := public.client_end_coach_link();
  if v_out->>'ok' is distinct from 'true' then
    raise exception 'client A leave failed: %', v_out;
  end if;
end $$;
reset role;

do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev int := current_setting('test.shared_rev_a')::int;
  v_a uuid;
  v_b uuid;
  v_frozen int;
  v_snap jsonb;
begin
  select id into v_a
  from public.program_assignments
  where program_id = v_program
    and client_id = 'c3401950-0000-4000-8000-000000000002';
  select id into v_b
  from public.program_assignments
  where program_id = v_program
    and client_id = 'c3401950-0000-4000-8000-000000000003';
  if (select status from public.program_assignments where id = v_a) is distinct from 'paused' then
    raise exception 'client A was not paused';
  end if;
  if (select status from public.program_assignments where id = v_b) is distinct from 'active' then
    raise exception 'client B is not still active';
  end if;
  select frozen_revision_no into v_frozen
  from public.program_assignments where id = v_a;
  if v_frozen is distinct from v_rev then
    raise exception 'A frozen_revision_no %, expected %', v_frozen, v_rev;
  end if;
  select snapshot into v_snap
  from public.program_revisions
  where program_id = v_program and revision_no = v_frozen;
  if coalesce(v_snap->>'name', '') is distinct from 'Shared archive'
     or coalesce(v_snap->>'description', '') is distinct from 'version A' then
    raise exception 'A frozen snapshot is not version A';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_snap->'days') d
    where d->>'name' = 'Push A'
  ) then
    raise exception 'A frozen snapshot lost Push A';
  end if;
  perform set_config('test.shared_a', v_a::text, true);
  perform set_config('test.shared_b', v_b::text, true);
  perform set_config('test.shared_snap_a', v_snap::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev int;
  v_days int;
begin
  if not public.actor_can_activate_program_version(v_program) then
    raise exception 'paused archive blocked owner activate for remaining client';
  end if;
  v_days := public.save_program(
    v_program,
    'Shared live B',
    'version B live',
    8,
    '[{"weekday":1,"name":"Push B","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'coach save for B expected 1 day, got %', v_days;
  end if;
  v_rev := public.save_program_version(
    v_program,
    'Shared archive B',
    'version B',
    8,
    '[{"weekday":1,"name":"Push B","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
    null
  );
  perform public.schedule_program_version(
    v_program,
    v_rev,
    (current_date + 3),
    false,
    null
  );
  perform public.activate_program_version(v_program, v_rev, null);
  perform set_config('test.shared_rev_b', v_rev::text, true);
end $$;
reset role;

do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_a uuid := current_setting('test.shared_a')::uuid;
  v_rev_a int := current_setting('test.shared_rev_a')::int;
  v_rev_b int := current_setting('test.shared_rev_b')::int;
  v_snap jsonb;
begin
  if (select frozen_revision_no from public.program_assignments where id = v_a)
       is distinct from v_rev_a then
    raise exception 'A frozen_revision_no changed after B version';
  end if;
  if (select active_revision_no from public.programs where id = v_program)
       is distinct from v_rev_b then
    raise exception 'live program did not activate version B';
  end if;
  if (select name from public.programs where id = v_program) is distinct from 'Shared archive B' then
    raise exception 'live name was not version B';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = v_program and name = 'Push A'
  ) then
    raise exception 'live graph still has Push A after B activate';
  end if;
  if not exists (
    select 1 from public.program_days
    where program_id = v_program and name = 'Push B'
  ) then
    raise exception 'live graph missing Push B';
  end if;
  select snapshot into v_snap
  from public.program_revisions
  where program_id = v_program and revision_no = v_rev_a;
  if v_snap::text is distinct from current_setting('test.shared_snap_a') then
    raise exception 'A frozen snapshot mutated';
  end if;
  if coalesce(v_snap->>'description', '') is distinct from 'version A'
     or exists (
       select 1 from jsonb_array_elements(v_snap->'days') d where d->>'name' = 'Push B'
     ) then
    raise exception 'A archive now shows B';
  end if;
  if (select status from public.program_assignments
      where client_id = 'c3401950-0000-4000-8000-000000000003'
        and program_id = v_program) is distinct from 'active' then
    raise exception 'B is no longer active';
  end if;
end $$;

rollback;
\echo 'shared program archive: A leaves, B continues, frozen snapshot'
