-- P1.2 — leftover Solo self-assignment stays writable by owner until this guard.
-- Reproduce Solo → Coaché → save_program, then prove a Coach can still edit a client plan.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a1890000-0000-4000-8000-000000000001','p12-athlete@example.test'),
 ('a1890000-0000-4000-8000-000000000002','p12-coach@example.test'),
 ('a1890000-0000-4000-8000-000000000003','p12-dual@example.test'),
 ('a1890000-0000-4000-8000-000000000004','p12-roster@example.test'),
 ('a1890000-0000-4000-8000-000000000005','p12-coach-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1890000-0000-4000-8000-000000000001','free','none'),
 ('a1890000-0000-4000-8000-000000000002','free','coach'),
 ('a1890000-0000-4000-8000-000000000003','free','none'),
 ('a1890000-0000-4000-8000-000000000004','free','none'),
 ('a1890000-0000-4000-8000-000000000005','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

insert into public.programs(id,owner_id,name,description,duration_weeks) values
 ('a1890000-0000-4000-8000-000000000010','a1890000-0000-4000-8000-000000000001','Solo leftover','',8),
 ('a1890000-0000-4000-8000-000000000011','a1890000-0000-4000-8000-000000000002','Coach plan','',8),
 ('a1890000-0000-4000-8000-000000000012','a1890000-0000-4000-8000-000000000003','Dual leftover','',8),
 ('a1890000-0000-4000-8000-000000000013','a1890000-0000-4000-8000-000000000003','Dual roster plan','',8);

-- One active assignment per client (unique index on client_id where status=active).
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('a1890000-0000-4000-8000-000000000020','a1890000-0000-4000-8000-000000000010','a1890000-0000-4000-8000-000000000001','a1890000-0000-4000-8000-000000000001',current_date,'active'),
 ('a1890000-0000-4000-8000-000000000021','a1890000-0000-4000-8000-000000000012','a1890000-0000-4000-8000-000000000003','a1890000-0000-4000-8000-000000000003',current_date,'active');

-- Solo owner can still save their self-assigned plan.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'a1890000-0000-4000-8000-000000000010',
    'Solo leftover saved',
    '',
    8,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'solo save expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

-- Activation does not pause the leftover assignment (mirrors accept_coach_invite).
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1890000-0000-4000-8000-000000000002','a1890000-0000-4000-8000-000000000001','active'),
 ('a1890000-0000-4000-8000-000000000002','a1890000-0000-4000-8000-000000000003','active'),
 ('a1890000-0000-4000-8000-000000000002','a1890000-0000-4000-8000-000000000005','active'),
 ('a1890000-0000-4000-8000-000000000003','a1890000-0000-4000-8000-000000000004','active');
update public.user_roles set coaching_role='client'
 where user_id in (
   'a1890000-0000-4000-8000-000000000001',
   'a1890000-0000-4000-8000-000000000003',
   'a1890000-0000-4000-8000-000000000004',
   'a1890000-0000-4000-8000-000000000005'
 );
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
 ('a1890000-0000-4000-8000-000000000022','a1890000-0000-4000-8000-000000000011','a1890000-0000-4000-8000-000000000005','a1890000-0000-4000-8000-000000000002',current_date,'active'),
 ('a1890000-0000-4000-8000-000000000023','a1890000-0000-4000-8000-000000000013','a1890000-0000-4000-8000-000000000004','a1890000-0000-4000-8000-000000000003',current_date,'active');

do $$ begin
  if (select status from public.program_assignments
      where id = 'a1890000-0000-4000-8000-000000000020') is distinct from 'active' then
    raise exception 'activation paused leftover assignment; fixture no longer matches prod';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'a1890000-0000-4000-8000-000000000010',
    'Hijack leftover',
    '',
    12,
    '[{"weekday":2,"name":"Pull","exercises":[{"name":"Row","default_sets":3,"default_reps":8}]}]'::jsonb,
    null
  );
  raise exception 'coached owner save_program was allowed';
exception
  when others then
    if sqlerrm not like '%Coached client cannot edit assigned program%' then
      raise;
    end if;
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000010')
     is distinct from 'Solo leftover saved' then
    raise exception 'coached owner write mutated leftover name';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'a1890000-0000-4000-8000-000000000010' and weekday = 2
  ) then
    raise exception 'coached owner write mutated leftover days';
  end if;
end $$;

-- The Coach still edits a plan they own for another client.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'a1890000-0000-4000-8000-000000000011',
    'Coach plan updated',
    '',
    8,
    '[{"weekday":3,"name":"Legs","exercises":[{"name":"Squat","default_sets":4,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'coach save expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

-- Coach who is himself Coached: leftover self-plan blocked; roster plan still writable.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
begin
  perform public.save_program(
    'a1890000-0000-4000-8000-000000000012',
    'Dual hijack',
    '',
    8,
    '[{"weekday":1,"name":"X","exercises":[{"name":"Y","default_sets":1,"default_reps":1}]}]'::jsonb,
    null
  );
  raise exception 'dual leftover save_program was allowed';
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
    'a1890000-0000-4000-8000-000000000013',
    'Dual roster updated',
    '',
    8,
    '[{"weekday":4,"name":"Upper","exercises":[{"name":"Press","default_sets":3,"default_reps":8}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'dual roster save expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000012')
     is distinct from 'Dual leftover' then
    raise exception 'dual leftover name mutated';
  end if;
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000013')
     is distinct from 'Dual roster updated' then
    raise exception 'dual roster plan not saved';
  end if;
end $$;

rollback;
\echo 'save_program coached leftover owner guard passed'
