-- P3 close_coach_account: snapshot engine, exact assignment revisions,
-- workout provenance, archive RPC, retry.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401970-0000-4000-8000-000000000001','p3h-close-coach@example.test'),
 ('c3401970-0000-4000-8000-000000000002','p3h-close-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401970-0000-4000-8000-000000000001','free','coach'),
 ('c3401970-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401970-0000-4000-8000-000000000001','coach')
on conflict do nothing;
update public.user_profiles
   set timezone = 'America/Toronto'
 where id in (
   'c3401970-0000-4000-8000-000000000001',
   'c3401970-0000-4000-8000-000000000002'
 );
-- Assignments that the logger will open must use the actor civil date, not
-- Postgres current_date (UTC can already be tomorrow in Toronto).
select set_config(
  'test.civil_today',
  (now() at time zone 'America/Toronto')::date::text,
  true
);

insert into public.coach_client_links(coach_id,client_id,status) values
 ('c3401970-0000-4000-8000-000000000001','c3401970-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401970-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401970-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid;
  v_asg uuid;
  v_rev int;
begin
  v_program := public.create_program_complete(
    'Coach close plan',
    'version 1',
    8,
    '[{"weekday":1,"name":"Push V1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    'c3401970-0000-4000-8000-000000000002',
    current_setting('test.civil_today')::date
  );
  select pa.id, p.active_revision_no
    into v_asg, v_rev
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  where pa.program_id = v_program
    and pa.client_id = 'c3401970-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_asg is null or v_rev is null then
    raise exception 'expected active V1 assignment';
  end if;
  perform set_config('test.close_program', v_program::text, true);
  perform set_config('test.close_asg_v1', v_asg::text, true);
  perform set_config('test.close_rev_v1', v_rev::text, true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401970-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401970-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $$
declare
  v_day uuid;
  v_wid uuid;
begin
  select id into v_day
  from public.program_days
  where program_id = current_setting('test.close_program')::uuid
    and name = 'Push V1';
  v_wid := public.start_workout_from_template(
    'Push V1',
    now(),
    null,
    current_setting('test.close_asg_v1')::uuid,
    v_day,
    '[]'::jsonb
  );
  if (select program_id from public.workouts where id = v_wid)
       is distinct from current_setting('test.close_program')::uuid then
    raise exception 'V1 workout missing program_id stamp';
  end if;
  if (select program_revision_no from public.workouts where id = v_wid)
       is distinct from current_setting('test.close_rev_v1')::int then
    raise exception 'V1 workout missing revision stamp';
  end if;
  perform set_config('test.close_workout', v_wid::text, true);
end $$;
reset role;

-- Freeze V1 as postgres (simulates the previous assignment becoming paused).
update public.program_assignments
   set status = 'paused', updated_at = now()
 where id = current_setting('test.close_asg_v1')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401970-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401970-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid := current_setting('test.close_program')::uuid;
  v_asg uuid;
  v_rev int;
  v_draft int;
begin
  perform public.save_program(
    v_program,
    'Coach close plan V2',
    'version 2 live',
    8,
    '[
      {"name":"Push V2","phase_id":"c3401970-0000-4000-8000-0000000000a1","order_index":0,"exercises":[{
        "name":"Bench",
        "default_sets":4,
        "default_reps":6,
        "default_reps_min":4,
        "default_rir":2,
        "default_rest_seconds":120,
        "default_weight_kg":80,
        "set_type":"cluster",
        "superset_group":"A",
        "drop_count":2,
        "tempo":"31X1",
        "isometric_seconds":30,
        "cluster_rest_seconds":15,
        "cluster_reps_per_burst":3,
        "myo_activation":true
      }]},
      {"name":"Pull V2","phase_id":"c3401970-0000-4000-8000-0000000000a2","order_index":1,"exercises":[{
        "name":"Row","default_sets":3,"default_reps":8,"tempo":"2010"
      }]}
    ]'::jsonb,
    null,
    'in_order',
    '[
      {"id":"c3401970-0000-4000-8000-0000000000a1","name":"Accumulation","duration_weeks":4},
      {"id":"c3401970-0000-4000-8000-0000000000a2","name":"Intensification","duration_weeks":4}
    ]'::jsonb
  );
  v_draft := public.save_program_version(
    v_program,
    'Secret unused draft',
    'must not transfer',
    8,
    '[{"weekday":1,"name":"Secret Day","exercises":[{"name":"Secret Lift","default_sets":3,"default_reps":5}]}]'::jsonb,
    null,
    'fixed_days',
    '[]'::jsonb
  );
  perform public.assign_program_secure(
    v_program,
    'c3401970-0000-4000-8000-000000000002',
    current_setting('test.civil_today')::date
  );
  select pa.id, p.active_revision_no
    into v_asg, v_rev
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  where pa.program_id = v_program
    and pa.client_id = 'c3401970-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_asg is null or v_rev is null then
    raise exception 'expected active V2 assignment';
  end if;
  if v_rev <= current_setting('test.close_rev_v1')::int then
    raise exception 'V2 did not advance the live revision';
  end if;
  perform set_config('test.close_asg_v2', v_asg::text, true);
  perform set_config('test.close_rev_v2', v_rev::text, true);
  perform set_config('test.close_draft', v_draft::text, true);
end $$;
reset role;
-- Production delete-account calls close as service_role with no user JWT.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','',true);

do $$
declare
  v_out jsonb;
  v_coach uuid := 'c3401970-0000-4000-8000-000000000001';
  v_client uuid := 'c3401970-0000-4000-8000-000000000002';
  v_origin uuid := current_setting('test.close_program')::uuid;
  v_asg1 uuid := current_setting('test.close_asg_v1')::uuid;
  v_asg2 uuid := current_setting('test.close_asg_v2')::uuid;
  v_wid uuid := current_setting('test.close_workout')::uuid;
  v_rev1 int := current_setting('test.close_rev_v1')::int;
  v_rev2 int := current_setting('test.close_rev_v2')::int;
  v_draft int := current_setting('test.close_draft')::int;
  v_fork1 uuid;
  v_fork2 uuid;
  v_arch jsonb;
  n int;
begin
  if auth.uid() is not null then
    raise exception 'close_coach_account must run without a user JWT (service_role/delete-account shape)';
  end if;
  v_out := public.close_coach_account(v_coach);
  if v_out->>'ok' is distinct from 'true'
     or (v_out->>'forked')::int is distinct from 2
     or (v_out->>'transitioned')::int is distinct from 1 then
    raise exception 'close_coach_account first call: %', v_out;
  end if;

  select program_id into v_fork1 from public.program_assignments where id = v_asg1;
  select program_id into v_fork2 from public.program_assignments where id = v_asg2;
  if v_fork1 is null or v_fork2 is null or v_fork1 = v_origin or v_fork2 = v_origin then
    raise exception 'assignments were not retargeted to client-owned forks';
  end if;
  if v_fork1 = v_fork2 then
    raise exception 'distinct assignments shared one fork';
  end if;
  if (select owner_id from public.programs where id = v_fork1) is distinct from v_client
     or (select owner_id from public.programs where id = v_fork2) is distinct from v_client then
    raise exception 'fork owner is not the client';
  end if;

  if (select status from public.program_assignments where id = v_asg1) is distinct from 'paused'
     or (select status from public.program_assignments where id = v_asg2) is distinct from 'paused' then
    raise exception 'transferred assignments were not paused';
  end if;
  if (select frozen_revision_no from public.program_assignments where id = v_asg1)
       is distinct from v_rev1 then
    raise exception 'paused V1 lost its own frozen revision';
  end if;
  if (select frozen_revision_no from public.program_assignments where id = v_asg2)
       is distinct from v_rev2
     or (select frozen_revision_no from public.program_assignments where id = v_asg2) is null then
    raise exception 'active V2 freeze pin is null or not V2';
  end if;

  if (select session_organization from public.programs where id = v_fork2)
       is distinct from 'in_order' then
    raise exception 'V2 session_organization was not copied';
  end if;
  if not exists (
    select 1 from public.program_phases
    where program_id = v_fork2 and name = 'Accumulation'
  ) or not exists (
    select 1 from public.program_phases
    where program_id = v_fork2 and name = 'Intensification'
  ) then
    raise exception 'V2 phases were not copied';
  end if;
  if not exists (
    select 1 from public.program_day_exercises e
    join public.program_days d on d.id = e.program_day_id
    where d.program_id = v_fork2
      and e.name = 'Bench'
      and e.set_type = 'cluster'
      and e.tempo = '31X1'
      and e.myo_activation is true
      and e.cluster_rest_seconds = 15
      and e.cluster_reps_per_burst = 3
      and e.default_rir = 2
      and e.drop_count = 2
  ) then
    raise exception 'V2 advanced prescriptions were not copied';
  end if;

  if exists (
    select 1
    from public.program_revisions r
    join public.programs p on p.id = r.program_id
    where p.owner_id = v_client
      and (
        r.snapshot->>'name' = 'Secret unused draft'
        or r.snapshot->'days' @> '[{"name":"Secret Day"}]'
      )
  ) then
    raise exception 'unused private draft was transferred';
  end if;
  if exists (
    select 1 from public.program_revisions
    where program_id in (v_fork1, v_fork2) and revision_no = v_draft
  ) then
    raise exception 'unused draft revision_no was copied';
  end if;

  -- Simulate coach program/account deletion after Auth delete.
  delete from public.programs where id = v_origin and owner_id = v_coach;
  if exists (select 1 from public.programs where id = v_origin) then
    raise exception 'coach source program still present after simulated delete';
  end if;

  if (select program_id from public.workouts where id = v_wid) is distinct from v_fork1 then
    raise exception 'historical workout lost program_id after coach program delete';
  end if;
  if (select program_revision_no from public.workouts where id = v_wid) is distinct from v_rev1 then
    raise exception 'historical workout revision was rewritten';
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_fork1 and revision_no = v_rev1
  ) then
    raise exception 'workout revision_no does not resolve on the client-owned program';
  end if;
  if not exists (
    select 1 from public.program_revisions
    where program_id = v_fork2 and revision_no = v_rev2
  ) then
    raise exception 'V2 frozen revision missing on client-owned program';
  end if;

  if exists (
    select 1 from public.coach_client_links
    where coach_id = v_coach and client_id = v_client and status = 'active'
  ) then
    raise exception 'coach-client relation still active';
  end if;

  select count(*) into n from public.programs where owner_id = v_client;
  perform set_config('test.close_client_programs', n::text, true);
  perform set_config('test.close_fork1', v_fork1::text, true);
  perform set_config('test.close_fork2', v_fork2::text, true);

  v_out := public.close_coach_account(v_coach);
  if v_out->>'ok' is distinct from 'true'
     or (v_out->>'forked')::int is distinct from 0
     or (v_out->>'transitioned')::int is distinct from 0 then
    raise exception 'retry close_coach_account: %', v_out;
  end if;
  if (select count(*) from public.programs where owner_id = v_client) is distinct from n then
    raise exception 'retry duplicated client-owned programs';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401970-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401970-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $$
declare
  v_arch jsonb;
  v_asg1 uuid := current_setting('test.close_asg_v1')::uuid;
  v_asg2 uuid := current_setting('test.close_asg_v2')::uuid;
  v_rev1 int := current_setting('test.close_rev_v1')::int;
  v_rev2 int := current_setting('test.close_rev_v2')::int;
begin
  v_arch := public.get_frozen_program_archive(v_asg1);
  if (v_arch->>'frozen_revision_no')::int is distinct from v_rev1
     or v_arch->'snapshot'->'days'->0->>'name' is distinct from 'Push V1' then
    raise exception 'V1 archive RPC failed: %', v_arch;
  end if;
  v_arch := public.get_frozen_program_archive(v_asg2);
  if (v_arch->>'frozen_revision_no')::int is distinct from v_rev2
     or v_arch->'snapshot'->>'session_organization' is distinct from 'in_order'
     or jsonb_array_length(v_arch->'snapshot'->'phases') is distinct from 2 then
    raise exception 'V2 archive RPC failed: %', v_arch;
  end if;
end $$;
reset role;

rollback;
\echo 'close_coach_account P3: snapshots, phases, org, prescriptions, freeze pin, workout provenance, retry'
