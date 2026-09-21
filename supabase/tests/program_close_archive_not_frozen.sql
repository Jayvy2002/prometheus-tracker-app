-- P3 close_coach_account fail-closed: a paused historical assignment whose
-- frozen_revision_no is missing must never be reconstructed from the live
-- V2 graph. One transaction — no partial fork/transfer.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c3401980-0000-4000-8000-000000000001','p3h-close-unfrozen-coach@example.test'),
 ('c3401980-0000-4000-8000-000000000002','p3h-close-unfrozen-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c3401980-0000-4000-8000-000000000001','free','coach'),
 ('c3401980-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c3401980-0000-4000-8000-000000000001','coach')
on conflict do nothing;
update public.user_profiles
   set timezone = 'America/Toronto'
 where id in (
   'c3401980-0000-4000-8000-000000000001',
   'c3401980-0000-4000-8000-000000000002'
 );

insert into public.coach_client_links(coach_id,client_id,status) values
 ('c3401980-0000-4000-8000-000000000001','c3401980-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401980-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401980-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid;
  v_asg uuid;
  v_rev int;
begin
  v_program := public.create_program_complete(
    'Unfrozen archive plan',
    'version 1',
    8,
    '[{"weekday":1,"name":"Push V1","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    'c3401980-0000-4000-8000-000000000002',
    current_date
  );
  select pa.id, p.active_revision_no
    into v_asg, v_rev
  from public.program_assignments pa
  join public.programs p on p.id = pa.program_id
  where pa.program_id = v_program
    and pa.client_id = 'c3401980-0000-4000-8000-000000000002'
    and pa.status = 'active';
  if v_asg is null or v_rev is null then
    raise exception 'expected active V1 assignment';
  end if;
  perform set_config('test.unfrozen_program', v_program::text, true);
  perform set_config('test.unfrozen_asg_v1', v_asg::text, true);
  perform set_config('test.unfrozen_rev_v1', v_rev::text, true);
end $$;
reset role;

-- Historical paused row with no provable pin. Replica skips the freeze
-- trigger so we can represent a leftover that close must refuse.
set session_replication_role = replica;
update public.program_assignments
   set status = 'paused',
       frozen_revision_no = null,
       updated_at = now()
 where id = current_setting('test.unfrozen_asg_v1')::uuid;
set session_replication_role = origin;

do $$
begin
  if (select status from public.program_assignments where id = current_setting('test.unfrozen_asg_v1')::uuid)
       is distinct from 'paused'
     or (select frozen_revision_no from public.program_assignments where id = current_setting('test.unfrozen_asg_v1')::uuid)
       is not null then
    raise exception 'failed to seed paused historical assignment with frozen_revision_no NULL';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c3401980-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"c3401980-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare
  v_program uuid := current_setting('test.unfrozen_program')::uuid;
  v_rev int;
begin
  perform public.save_program(
    v_program,
    'Unfrozen archive plan V2',
    'version 2 live',
    8,
    '[{"weekday":1,"name":"Push V2","exercises":[{"name":"Squat","default_sets":4,"default_reps":6}]}]'::jsonb,
    null
  );
  perform public.activate_program_version(
    v_program,
    public.save_program_version(
      v_program,
      'Unfrozen archive plan V2',
      'version 2 live',
      8,
      '[{"weekday":1,"name":"Push V2","exercises":[{"name":"Squat","default_sets":4,"default_reps":6}]}]'::jsonb,
      null
    )
  );
  select p.active_revision_no into v_rev
    from public.programs p
   where p.id = v_program;
  if v_rev is null or v_rev <= current_setting('test.unfrozen_rev_v1')::int then
    raise exception 'V2 did not advance the live revision';
  end if;
  if not exists (
    select 1 from public.program_days
     where program_id = v_program and name = 'Push V2'
  ) then
    raise exception 'live graph is not V2';
  end if;
  perform set_config('test.unfrozen_rev_v2', v_rev::text, true);
end $$;
reset role;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','',true);

do $$
declare
  v_coach uuid := 'c3401980-0000-4000-8000-000000000001';
  v_client uuid := 'c3401980-0000-4000-8000-000000000002';
  v_origin uuid := current_setting('test.unfrozen_program')::uuid;
  v_asg1 uuid := current_setting('test.unfrozen_asg_v1')::uuid;
  v_rev1 int := current_setting('test.unfrozen_rev_v1')::int;
  v_rev2 int := current_setting('test.unfrozen_rev_v2')::int;
  v_out jsonb;
  n_client_programs int;
  n_forks int;
begin
  select count(*) into n_client_programs from public.programs where owner_id = v_client;

  begin
    v_out := public.close_coach_account(v_coach);
    raise exception 'close_coach_account should fail-closed on unfrozen paused archive: %', v_out;
  exception
    when others then
      if sqlerrm like '%close_coach_account should fail-closed%' then
        raise;
      elsif sqlerrm not like '%archive_not_frozen%' then
        raise;
      end if;
  end;

  if (select count(*) from public.programs where owner_id = v_client)
       is distinct from n_client_programs then
    raise exception 'fail-closed close forked a client-owned program';
  end if;
  select count(*) into n_forks
    from public.program_assignments pa
    join public.programs p on p.id = pa.program_id
   where pa.client_id = v_client
     and p.owner_id = v_client;
  if n_forks <> 0 then
    raise exception 'fail-closed close left a client-owned assignment fork';
  end if;
  if (select program_id from public.program_assignments where id = v_asg1)
       is distinct from v_origin then
    raise exception 'unfrozen assignment was retargeted';
  end if;
  if (select status from public.program_assignments where id = v_asg1)
       is distinct from 'paused'
     or (select frozen_revision_no from public.program_assignments where id = v_asg1)
       is not null then
    raise exception 'unfrozen paused assignment was rewritten';
  end if;
  if exists (
    select 1 from public.program_revisions r
    join public.programs p on p.id = r.program_id
    where p.owner_id = v_client
      and r.revision_no = v_rev2
  ) then
    raise exception 'live V2 was silently substituted as the V1 archive';
  end if;
  if not exists (
    select 1 from public.coach_client_links
     where coach_id = v_coach and client_id = v_client and status = 'active'
  ) then
    raise exception 'fail-closed close ended the relation (partial transfer)';
  end if;
  if exists (
    select 1 from public.coach_account_closures where coach_id = v_coach
  ) then
    raise exception 'fail-closed close stamped a durable closure';
  end if;
  if (select name from public.programs where id = v_origin)
       is distinct from 'Unfrozen archive plan V2' then
    raise exception 'source program was mutated by the failed close';
  end if;
  if v_rev1 is null or v_rev2 <= v_rev1 then
    raise exception 'revision markers lost after fail-closed close';
  end if;
end $$;

rollback;
\echo 'close_coach_account fail-closed: paused NULL frozen_revision_no refuses live V2, atomic'
