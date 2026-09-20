-- Coach A → Client C → Coach B: paused live graph and later drafts stay
-- in A's library. B reads the frozen archive and adopts that snapshot only.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401960-0000-4000-8000-000000000001','p3sw-coach-a@example.test'),
 ('c3401960-0000-4000-8000-000000000002','p3sw-client@example.test'),
 ('c3401960-0000-4000-8000-000000000003','p3sw-coach-b@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401960-0000-4000-8000-000000000001','free','coach'),
 ('c3401960-0000-4000-8000-000000000002','free','none'),
 ('c3401960-0000-4000-8000-000000000003','free','coach')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401960-0000-4000-8000-000000000001','coach'),
 ('c3401960-0000-4000-8000-000000000003','coach')
on conflict do nothing;
update public.user_profiles
   set timezone = 'America/Toronto'
 where id in (
   'c3401960-0000-4000-8000-000000000001',
   'c3401960-0000-4000-8000-000000000002',
   'c3401960-0000-4000-8000-000000000003'
 );

insert into public.coach_client_links(coach_id,client_id,status) values
 ('c3401960-0000-4000-8000-000000000001','c3401960-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid;
  v_asg uuid;
  v_rev int;
begin
  v_program := public.create_program_complete(
    'Coach A plan',
    'version A',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb
  );
  perform public.assign_program_secure(
    v_program,
    'c3401960-0000-4000-8000-000000000002',
    current_date
  );
  select pa.id, p.active_revision_no
    into v_asg, v_rev
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  where pa.program_id = v_program
    and pa.client_id = 'c3401960-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_asg is null or v_rev is null then
    raise exception 'expected active assignment with active revision';
  end if;
  perform set_config('test.switch_program', v_program::text, true);
  perform set_config('test.switch_asg', v_asg::text, true);
  perform set_config('test.switch_rev_a', v_rev::text, true);
end $$;
reset role;

-- C leaves A: pause + freeze version A.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_out jsonb;
begin
  v_out := public.client_end_coach_link();
  if v_out->>'ok' is distinct from 'true' then
    raise exception 'client leave failed: %', v_out;
  end if;
end $$;
reset role;

do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_asg uuid := current_setting('test.switch_asg')::uuid;
  v_rev_a int := current_setting('test.switch_rev_a')::int;
  v_frozen int;
  v_status text;
begin
  select status, frozen_revision_no into v_status, v_frozen
  from public.program_assignments
  where id = v_asg;
  if v_status is distinct from 'paused' then
    raise exception 'assignment not paused after leave: %', v_status;
  end if;
  if v_frozen is distinct from v_rev_a then
    raise exception 'frozen_revision_no % expected A %', v_frozen, v_rev_a;
  end if;
  if not exists (
    select 1 from public.program_days
    where program_id = v_program and name = 'Push A'
  ) then
    raise exception 'live graph lost Push A before owner mutation';
  end if;
end $$;

-- Owner A mutates live to B and saves draft C after the client left.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_rev int;
begin
  perform public.save_program(
    v_program,
    'Coach A plan B',
    'version B',
    8,
    '[{"weekday":1,"name":"Push B","exercises":[{"name":"Overhead","default_sets":3,"default_reps":8}]},{"weekday":3,"name":"New Day B","exercises":[{"name":"Row","default_sets":3,"default_reps":10}]}]'::jsonb,
    null,
    'fixed_days'
  );
  perform set_config('test.switch_rev_b', (
    select active_revision_no::text from public.programs where id = v_program
  ), true);
  v_rev := public.save_program_version(
    v_program,
    'Private saved draft',
    'coach A only',
    8,
    '[{"weekday":1,"name":"Secret","exercises":[{"name":"Curl","default_sets":3,"default_reps":10}]}]'::jsonb,
    null
  );
  perform set_config('test.switch_draft', v_rev::text, true);
end $$;
reset role;

do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_asg uuid := current_setting('test.switch_asg')::uuid;
  v_rev_a int := current_setting('test.switch_rev_a')::int;
  v_draft int := current_setting('test.switch_draft')::int;
begin
  if (select name from public.programs where id = v_program) is distinct from 'Coach A plan B' then
    raise exception 'owner live name was not mutated to B';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'Push B') then
    raise exception 'owner live missing Push B';
  end if;
  if exists (select 1 from public.program_days where program_id = v_program and name = 'Push A') then
    raise exception 'owner live still has Push A after mutation';
  end if;
  if (select frozen_revision_no from public.program_assignments where id = v_asg)
     is distinct from v_rev_a then
    raise exception 'owner mutation rewrote frozen_revision_no';
  end if;
  -- Ambiguous historical row: older paused assignment pinning the later draft.
  -- Pick rule must prefer the more recent paused row (frozen A), not this one.
  insert into public.program_assignments (
    program_id, client_id, assigned_by, start_date, status, frozen_revision_no, updated_at
  ) values (
    v_program,
    'c3401960-0000-4000-8000-000000000002',
    'c3401960-0000-4000-8000-000000000001',
    current_date - 30,
    'paused',
    v_draft,
    now() - interval '2 days'
  );
  insert into public.programs (id, owner_id, name, description, duration_weeks)
  values (
    'c3401960-0000-4000-8000-000000000010',
    'c3401960-0000-4000-8000-000000000001',
    'Unfrozen leftover',
    '',
    8
  );
  insert into public.program_assignments (
    id, program_id, client_id, assigned_by, start_date, status, frozen_revision_no
  ) values (
    'c3401960-0000-4000-8000-000000000011',
    'c3401960-0000-4000-8000-000000000010',
    'c3401960-0000-4000-8000-000000000002',
    'c3401960-0000-4000-8000-000000000001',
    current_date,
    'paused',
    null
  );
end $$;

insert into public.coach_client_links(coach_id,client_id,status) values
 ('c3401960-0000-4000-8000-000000000003','c3401960-0000-4000-8000-000000000002','active');

-- JWT Coach B: no live B/C, no drafts; frozen A archive; adopt copies A.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_asg uuid := current_setting('test.switch_asg')::uuid;
  v_rev_a int := current_setting('test.switch_rev_a')::int;
  v_rev_b int := current_setting('test.switch_rev_b')::int;
  v_draft int := current_setting('test.switch_draft')::int;
  v_seen int[];
  v_arch jsonb;
  v_new uuid;
  v_new_active int;
  v_day_names text[];
begin
  if exists (select 1 from public.programs where id = v_program) then
    raise exception 'coach B still reads paused live programs';
  end if;
  if exists (select 1 from public.program_days where program_id = v_program) then
    raise exception 'coach B still reads paused live program_days';
  end if;
  if exists (
    select 1
    from public.program_day_exercises e
    join public.program_days d on d.id = e.program_day_id
    where d.program_id = v_program
  ) then
    raise exception 'coach B still reads paused live program_day_exercises';
  end if;
  if exists (select 1 from public.program_phases where program_id = v_program) then
    raise exception 'coach B still reads paused live program_phases';
  end if;
  if public.actor_can_read_program(v_program) then
    raise exception 'actor_can_read_program leaked paused program to coach B';
  end if;

  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = v_program;
  if v_seen is distinct from array[v_rev_a] then
    raise exception 'coach B revision set %, expected only frozen A %', v_seen, v_rev_a;
  end if;
  if v_rev_b = any (v_seen) or v_draft = any (v_seen) then
    raise exception 'coach B SELECT post-departure live/draft revision';
  end if;

  v_arch := public.get_frozen_program_archive(v_asg);
  if (v_arch->>'frozen_revision_no')::int is distinct from v_rev_a then
    raise exception 'coach B archive RPC did not return frozen A';
  end if;
  if coalesce(v_arch->'snapshot'->>'description', '') is distinct from 'version A' then
    raise exception 'coach B archive leaked live B metadata';
  end if;
  if coalesce(v_arch->'snapshot'->'days'->0->>'name', '') is distinct from 'Push A' then
    raise exception 'coach B archive missing Push A';
  end if;

  begin
    perform public.adopt_client_assignment(
      'c3401960-0000-4000-8000-000000000011'
    );
    raise exception 'paused adopt without frozen_revision_no was allowed';
  exception
    when others then
      if sqlerrm like '%paused adopt without frozen_revision_no was allowed%' then
        raise;
      elsif sqlerrm not like '%archive_not_frozen%' then
        raise;
      end if;
  end;

  begin
    perform public.adopt_client_assignment(
      'c3401960-0000-4000-8000-000000000099'
    );
    raise exception 'missing assignment adopt was allowed';
  exception
    when others then
      if sqlerrm like '%missing assignment adopt was allowed%' then
        raise;
      elsif sqlerrm not like '%not_found%' then
        raise;
      end if;
  end;

  v_new := public.adopt_client_assignment(v_asg);
  if v_new is null or v_new = v_program then
    raise exception 'adopt did not create a new program';
  end if;
  perform set_config('test.switch_adopted', v_new::text, true);

  if (select owner_id from public.programs where id = v_new)
     is distinct from 'c3401960-0000-4000-8000-000000000003' then
    raise exception 'adopted program not owned by coach B';
  end if;
  select active_revision_no into v_new_active from public.programs where id = v_new;
  if v_new_active is null then
    raise exception 'adopted program missing active_revision_no';
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_new and revision_no = v_new_active
  ) then
    raise exception 'adopted active_revision_no has no program_revisions row';
  end if;

  select coalesce(array_agg(name order by order_index), '{}')
    into v_day_names
  from public.program_days
  where program_id = v_new;
  if not ('Push A' = any (v_day_names)) then
    raise exception 'adopted program missing frozen Push A, got %', v_day_names;
  end if;
  if 'Push B' = any (v_day_names) or 'New Day B' = any (v_day_names) or 'Secret' = any (v_day_names) then
    raise exception 'adopt_client_assignment copied live/draft graph: %', v_day_names;
  end if;
  if exists (
    select 1 from public.program_revisions
    where program_id = v_new
      and (
        snapshot::text like '%Push B%'
        or snapshot::text like '%New Day B%'
        or snapshot::text like '%Secret%'
      )
  ) then
    raise exception 'adopted revision snapshot contains live B or draft C';
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_new
      and revision_no = v_new_active
      and snapshot::text like '%Push A%'
  ) then
    raise exception 'adopted revision snapshot missing frozen Push A';
  end if;
end $$;
reset role;

-- Cas 1: same program/client, paused frozen rev 1 + active rev 2.
-- Adopt is keyed by assignment_id: paused copies 1, active copies 2.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_program uuid;
  v_asg uuid;
  v_rev int;
begin
  v_program := public.create_program_complete(
    'Coach B dup',
    'frozen one',
    8,
    '[{"weekday":1,"name":"Dup Frozen 1","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb
  );
  perform public.assign_program_secure(
    v_program,
    'c3401960-0000-4000-8000-000000000002',
    current_date
  );
  select pa.id, p.active_revision_no
    into v_asg, v_rev
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  where pa.program_id = v_program
    and pa.client_id = 'c3401960-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_asg is null or v_rev is null then
    raise exception 'cas 1 expected active assignment with active revision';
  end if;
  perform set_config('test.dup_program', v_program::text, true);
  perform set_config('test.dup_paused', v_asg::text, true);
  perform set_config('test.dup_rev1', v_rev::text, true);
end $$;
reset role;

do $$
declare
  v_asg uuid := current_setting('test.dup_paused')::uuid;
  v_rev1 int := current_setting('test.dup_rev1')::int;
  v_frozen int;
  v_status text;
begin
  update public.program_assignments
     set status = 'paused', updated_at = now()
   where id = v_asg
     and status = 'active';
  select status, frozen_revision_no into v_status, v_frozen
  from public.program_assignments
  where id = v_asg;
  if v_status is distinct from 'paused' then
    raise exception 'cas 1 assignment not paused: %', v_status;
  end if;
  if v_frozen is distinct from v_rev1 then
    raise exception 'cas 1 frozen_revision_no % expected %', v_frozen, v_rev1;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.dup_program')::uuid;
  v_paused uuid := current_setting('test.dup_paused')::uuid;
  v_active uuid;
  v_rev2 int;
  v_new_paused uuid;
  v_new_active uuid;
  v_names text[];
begin
  perform public.save_program(
    v_program,
    'Coach B dup live',
    'live two',
    8,
    '[{"weekday":1,"name":"Dup Live 2","exercises":[{"name":"Deadlift","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days'
  );
  v_rev2 := (select active_revision_no from public.programs where id = v_program);
  if v_rev2 is null or v_rev2 is not distinct from current_setting('test.dup_rev1')::int then
    raise exception 'cas 1 live revision did not advance, got %', v_rev2;
  end if;
  perform set_config('test.dup_rev2', v_rev2::text, true);

  perform public.assign_program_secure(
    v_program,
    'c3401960-0000-4000-8000-000000000002',
    current_date
  );
  select pa.id into v_active
  from public.program_assignments pa
  where pa.program_id = v_program
    and pa.client_id = 'c3401960-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_active is null or v_active = v_paused then
    raise exception 'cas 1 expected a distinct active assignment';
  end if;
  perform set_config('test.dup_active', v_active::text, true);

  v_new_paused := public.adopt_client_assignment(v_paused);
  select coalesce(array_agg(name order by order_index), '{}')
    into v_names
  from public.program_days
  where program_id = v_new_paused;
  if not ('Dup Frozen 1' = any (v_names)) then
    raise exception 'cas 1 adopt paused missing Dup Frozen 1, got %', v_names;
  end if;
  if 'Dup Live 2' = any (v_names) then
    raise exception 'cas 1 adopt paused copied active revision 2: %', v_names;
  end if;

  v_new_active := public.adopt_client_assignment(v_active);
  select coalesce(array_agg(name order by order_index), '{}')
    into v_names
  from public.program_days
  where program_id = v_new_active;
  if not ('Dup Live 2' = any (v_names)) then
    raise exception 'cas 1 adopt active missing Dup Live 2, got %', v_names;
  end if;
  if 'Dup Frozen 1' = any (v_names) then
    raise exception 'cas 1 adopt active copied paused revision 1: %', v_names;
  end if;
end $$;
reset role;

-- Cas 2: two paused rows of the same program; explicit assignment_id wins
-- over updated_at DESC / active-first.
do $$
declare
  v_active uuid := current_setting('test.dup_active')::uuid;
  v_rev2 int := current_setting('test.dup_rev2')::int;
  v_frozen int;
begin
  update public.program_assignments
     set status = 'paused', updated_at = now()
   where id = v_active
     and status = 'active';
  select frozen_revision_no into v_frozen
  from public.program_assignments
  where id = v_active;
  if v_frozen is distinct from v_rev2 then
    raise exception 'cas 2 frozen_revision_no % expected %', v_frozen, v_rev2;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_paused uuid := current_setting('test.dup_paused')::uuid;
  v_later uuid := current_setting('test.dup_active')::uuid;
  v_new uuid;
  v_names text[];
begin
  v_new := public.adopt_client_assignment(v_paused);
  select coalesce(array_agg(name order by order_index), '{}')
    into v_names
  from public.program_days
  where program_id = v_new;
  if not ('Dup Frozen 1' = any (v_names)) then
    raise exception 'cas 2 adopt older paused missing Dup Frozen 1, got %', v_names;
  end if;
  if 'Dup Live 2' = any (v_names) then
    raise exception 'cas 2 adopt older paused followed updated_at DESC: %', v_names;
  end if;

  v_new := public.adopt_client_assignment(v_later);
  select coalesce(array_agg(name order by order_index), '{}')
    into v_names
  from public.program_days
  where program_id = v_new;
  if not ('Dup Live 2' = any (v_names)) then
    raise exception 'cas 2 adopt later paused missing Dup Live 2, got %', v_names;
  end if;
  if 'Dup Frozen 1' = any (v_names) then
    raise exception 'cas 2 adopt later paused copied the other frozen row: %', v_names;
  end if;
end $$;
reset role;

-- Cas 3: former Coach without active relation, and other Coach on B's
-- assignment, both refused. Missing / unfrozen already covered as Coach B.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_asg uuid := current_setting('test.switch_asg')::uuid;
  v_paused uuid := current_setting('test.dup_paused')::uuid;
begin
  begin
    perform public.adopt_client_assignment(v_asg);
    raise exception 'former coach adopt was allowed';
  exception
    when others then
      if sqlerrm like '%former coach adopt was allowed%' then
        raise;
      elsif sqlerrm not like '%Not your client%' then
        raise;
      end if;
  end;
  begin
    perform public.adopt_client_assignment(v_paused);
    raise exception 'other coach adopt was allowed';
  exception
    when others then
      if sqlerrm like '%other coach adopt was allowed%' then
        raise;
      elsif sqlerrm not like '%Not your client%' then
        raise;
      end if;
  end;
end $$;
reset role;

-- JWT Client C: same frozen A; no live B/C; no draft.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_asg uuid := current_setting('test.switch_asg')::uuid;
  v_rev_a int := current_setting('test.switch_rev_a')::int;
  v_rev_b int := current_setting('test.switch_rev_b')::int;
  v_draft int := current_setting('test.switch_draft')::int;
  v_seen int[];
  v_arch jsonb;
begin
  if exists (select 1 from public.programs where id = v_program) then
    raise exception 'client still reads paused live programs';
  end if;
  if exists (select 1 from public.program_days where program_id = v_program) then
    raise exception 'client still reads paused live program_days';
  end if;
  if exists (select 1 from public.program_phases where program_id = v_program) then
    raise exception 'client still reads paused live program_phases';
  end if;
  select coalesce(array_agg(revision_no order by revision_no), '{}')
    into v_seen
  from public.program_revisions
  where program_id = v_program;
  if v_seen is distinct from array[v_rev_a] then
    raise exception 'client revision set %, expected only frozen A %', v_seen, v_rev_a;
  end if;
  if v_rev_b = any (v_seen) or v_draft = any (v_seen) then
    raise exception 'client SELECT post-departure live/draft revision';
  end if;
  v_arch := public.get_frozen_program_archive(v_asg);
  if (v_arch->>'frozen_revision_no')::int is distinct from v_rev_a then
    raise exception 'client archive RPC did not return frozen A';
  end if;
  if coalesce(v_arch->'snapshot'->'days'->0->>'name', '') is distinct from 'Push A' then
    raise exception 'client archive missing Push A';
  end if;
end $$;
reset role;

-- JWT Coach A owner: live B/C and full history remain visible.
set local role authenticated;
select set_config('request.jwt.claim.sub','c3401960-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401960-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_program uuid := current_setting('test.switch_program')::uuid;
  v_rev_a int := current_setting('test.switch_rev_a')::int;
  v_rev_b int := current_setting('test.switch_rev_b')::int;
  v_draft int := current_setting('test.switch_draft')::int;
  n int;
begin
  if (select name from public.programs where id = v_program) is distinct from 'Coach A plan B' then
    raise exception 'owner lost live program B';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'Push B') then
    raise exception 'owner lost live Push B';
  end if;
  if not exists (select 1 from public.program_days where program_id = v_program and name = 'New Day B') then
    raise exception 'owner lost live New Day B';
  end if;
  select count(*) into n from public.program_revisions where program_id = v_program;
  if n < 3 then
    raise exception 'owner lost revision history, saw %', n;
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_program and revision_no in (v_rev_a, v_rev_b, v_draft)
    having count(*) = 3
  ) then
    raise exception 'owner cannot see A/B/draft revisions';
  end if;
end $$;
reset role;

rollback;
\echo 'coach switch archive: B cannot read paused live or drafts; adopt copies frozen A'
\echo 'coach switch archive: adopt paused copies Push A not live Push B'
\echo 'coach switch archive: adopt exact assignment active+paused copies own revision'
\echo 'coach switch archive: adopt exact assignment two paused copies own frozen revision'
\echo 'coach switch archive: adopt refuses other coach, former coach, missing, unfrozen'
