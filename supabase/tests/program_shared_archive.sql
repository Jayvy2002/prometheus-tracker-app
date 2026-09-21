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
  v_rev := public.save_program_version(
    v_program,
    'Private saved draft',
    'coach only',
    8,
    '[{"weekday":1,"name":"Secret","exercises":[{"name":"Curl","default_sets":3,"default_reps":10}]}]'::jsonb,
    null
  );
  perform set_config('test.shared_draft', v_rev::text, true);
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

-- Active A: live graph + active revision; not the unscheduled saved draft.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev_a int := current_setting('test.shared_rev_a')::int;
  v_draft int := current_setting('test.shared_draft')::int;
  v_seen int[];
begin
  if not exists (select 1 from public.programs where id = v_program) then
    raise exception 'active A cannot read live program';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'Push A') then
    raise exception 'active A cannot read live days';
  end if;
  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = v_program;
  if not (v_rev_a = any (v_seen)) then
    raise exception 'active A cannot SELECT current active revision';
  end if;
  if v_draft = any (v_seen) then
    raise exception 'active A SELECT unscheduled saved revision';
  end if;
end $$;
reset role;

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
  v_rev := public.save_program_version(
    v_program,
    'Shared archive C',
    'scheduled C',
    8,
    '[{"weekday":1,"name":"Push C","exercises":[{"name":"Dip","default_sets":3,"default_reps":8}]}]'::jsonb,
    null
  );
  perform public.schedule_program_version(
    v_program,
    v_rev,
    (current_date + 10),
    false,
    null
  );
  perform set_config('test.shared_rev_c', v_rev::text, true);
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

-- Paused A cannot read live B; frozen A only; no post-departure revisions.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_a uuid := current_setting('test.shared_a')::uuid;
  v_b uuid := current_setting('test.shared_b')::uuid;
  v_rev_a int := current_setting('test.shared_rev_a')::int;
  v_rev_b int := current_setting('test.shared_rev_b')::int;
  v_rev_c int := current_setting('test.shared_rev_c')::int;
  v_draft int := current_setting('test.shared_draft')::int;
  v_seen int[];
  v_arch jsonb;
begin
  if exists (select 1 from public.programs where id = v_program) then
    raise exception 'paused A still reads live programs';
  end if;
  if exists (select 1 from public.program_days where program_id = v_program) then
    raise exception 'paused A still reads live program_days';
  end if;
  if exists (
    select 1
    from public.program_day_exercises e
    join public.program_days d on d.id = e.program_day_id
    where d.program_id = v_program
  ) then
    raise exception 'paused A still reads live program_day_exercises';
  end if;
  if exists (select 1 from public.program_phases where program_id = v_program) then
    raise exception 'paused A still reads live program_phases';
  end if;
  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = v_program;
  if v_seen is distinct from array[v_rev_a] then
    raise exception 'paused A revision set %, expected only frozen %', v_seen, v_rev_a;
  end if;
  if v_rev_b = any (v_seen) or v_rev_c = any (v_seen) or v_draft = any (v_seen) then
    raise exception 'paused A SELECT B/newer/draft revision';
  end if;
  v_arch := public.get_frozen_program_archive(v_a);
  if (v_arch->>'frozen_revision_no')::int is distinct from v_rev_a then
    raise exception 'archive RPC did not return frozen A';
  end if;
  if coalesce(v_arch->'snapshot'->>'description', '') is distinct from 'version A' then
    raise exception 'archive RPC leaked live B metadata';
  end if;
  begin
    perform public.get_frozen_program_archive(v_b);
    raise exception 'paused A read B assignment archive';
  exception
    when others then
      if sqlerrm like '%paused A read B assignment archive%' then
        raise;
      elsif sqlerrm not like '%Not authorized%' and sqlerrm not like '%archive_not_frozen%' then
        raise;
      end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev_b int := current_setting('test.shared_rev_b')::int;
  v_rev_c int := current_setting('test.shared_rev_c')::int;
  v_draft int := current_setting('test.shared_draft')::int;
  v_seen int[];
begin
  if (select name from public.programs where id = v_program) is distinct from 'Shared archive B' then
    raise exception 'active B cannot read live name B';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'Push B') then
    raise exception 'active B cannot read live Push B';
  end if;
  if exists (select 1 from public.program_days where program_id = v_program and name = 'Push A') then
    raise exception 'live graph still has Push A for B';
  end if;
  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = v_program;
  if not (v_rev_b = any (v_seen) and v_rev_c = any (v_seen)) then
    raise exception 'active B missing active/scheduled revisions: %', v_seen;
  end if;
  if v_draft = any (v_seen) then
    raise exception 'active B SELECT unscheduled saved revision';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401950-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401950-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.shared_program')::uuid;
  v_rev_a int := current_setting('test.shared_rev_a')::int;
  v_rev_b int := current_setting('test.shared_rev_b')::int;
  v_rev_c int := current_setting('test.shared_rev_c')::int;
  v_draft int := current_setting('test.shared_draft')::int;
  n int;
begin
  if (select name from public.programs where id = v_program) is distinct from 'Shared archive B' then
    raise exception 'coach cannot read live program';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'Push B') then
    raise exception 'coach cannot read live days';
  end if;
  select count(*) into n from public.program_revisions where program_id = v_program;
  if n < 4 then
    raise exception 'coach lost full revision history, saw %', n;
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_program and revision_no in (v_rev_a, v_rev_b, v_rev_c, v_draft)
    having count(*) = 4
  ) then
    raise exception 'coach cannot see A/B/C/draft revisions';
  end if;
end $$;
reset role;

rollback;
\echo 'shared program archive: A leaves, B continues, frozen snapshot'
\echo 'shared program archive: paused A cannot read live graph or drafts'
