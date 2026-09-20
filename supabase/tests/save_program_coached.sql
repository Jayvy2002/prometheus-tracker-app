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
-- Dual (003) is Coach + later Coached: capability is independent of coaching_role.
insert into public.user_capabilities(user_id, capability) values
 ('a1890000-0000-4000-8000-000000000003','coach')
on conflict do nothing;

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

-- Dual leftover is also a real assigned plan before coaching, so later RPC/RLS probes have rows.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_days int;
begin
  v_days := public.save_program(
    'a1890000-0000-4000-8000-000000000012',
    'Dual leftover saved',
    '',
    8,
    '[{"weekday":1,"name":"Core","exercises":[{"name":"Plank","default_sets":3,"default_reps":30}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'dual leftover solo save expected 1 day, got %', v_days;
  end if;
end $$;
reset role;

-- Solo leftover owner can still mutate assignment + tables via Data API before coaching.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_updated int;
  v_days int;
begin
  update public.program_assignments
     set start_date = current_date
   where id = 'a1890000-0000-4000-8000-000000000020';
  get diagnostics v_updated = row_count;
  if v_updated is distinct from 1 then
    raise exception 'solo leftover assignment Data API update expected 1 row, got %', v_updated;
  end if;
  v_days := public.save_program(
    'a1890000-0000-4000-8000-000000000010',
    'Solo leftover saved',
    'solo-ok',
    8,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'solo leftover RPC update expected 1 day, got %', v_days;
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
     is distinct from 'Dual leftover saved' then
    raise exception 'dual leftover name mutated';
  end if;
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000013')
     is distinct from 'Dual roster updated' then
    raise exception 'dual roster plan not saved';
  end if;
end $$;

-- Legacy RPCs + table/RLS + Data API must not rewrite a leftover Coached plan.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_day uuid;
  v_ex uuid;
  v_touched int;
begin
  select d.id into v_day
  from public.program_days d
  where d.program_id = 'a1890000-0000-4000-8000-000000000010' and d.weekday = 1
  limit 1;
  if v_day is null then
    raise exception 'leftover day missing after solo save';
  end if;
  select e.id into v_ex
  from public.program_day_exercises e
  where e.program_day_id = v_day
  limit 1;

  begin
    perform public.sync_program_days(
      'a1890000-0000-4000-8000-000000000010',
      '[{"weekday":5,"name":"Hijack sync","exercises":[{"name":"Curl","default_sets":2,"default_reps":12}]}]'::jsonb
    );
    raise exception 'coached owner sync_program_days was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%'
         and sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    perform public.save_program_day_exercises(
      v_day,
      '[{"name":"Hijack ex","default_sets":5,"default_reps":5}]'::jsonb
    );
    raise exception 'coached owner save_program_day_exercises was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%'
         and sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    update public.programs
       set name = 'Hijack table'
     where id = 'a1890000-0000-4000-8000-000000000010';
    get diagnostics v_touched = row_count;
    if v_touched <> 0 then
      raise exception 'coached owner programs UPDATE reached % rows', v_touched;
    end if;
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%coached owner programs UPDATE reached%' then
        raise;
      elsif sqlerrm not like '%permission denied%' and sqlerrm not like '%RPC-only%' then
        raise;
      end if;
  end;

  begin
    delete from public.programs
     where id = 'a1890000-0000-4000-8000-000000000010';
    get diagnostics v_touched = row_count;
    if v_touched <> 0 then
      raise exception 'coached owner programs DELETE reached % rows', v_touched;
    end if;
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%coached owner programs DELETE reached%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    update public.program_days
       set name = 'Hijack day'
     where id = v_day;
    get diagnostics v_touched = row_count;
    if v_touched <> 0 then
      raise exception 'coached owner program_days UPDATE reached % rows', v_touched;
    end if;
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%coached owner program_days UPDATE reached%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  if v_ex is not null then
    begin
      update public.program_day_exercises
         set name = 'Hijack ex row'
       where id = v_ex;
      get diagnostics v_touched = row_count;
      if v_touched <> 0 then
        raise exception 'coached owner program_day_exercises UPDATE reached % rows', v_touched;
      end if;
    exception
      when insufficient_privilege then
        null;
      when others then
        if sqlerrm like '%coached owner program_day_exercises UPDATE reached%' then
          raise;
        elsif sqlerrm not like '%permission denied%' then
          raise;
        end if;
    end;
  end if;

  begin
    insert into public.program_assignments(program_id, client_id, assigned_by, start_date, status)
    values (
      'a1890000-0000-4000-8000-000000000010',
      'a1890000-0000-4000-8000-000000000001',
      'a1890000-0000-4000-8000-000000000001',
      current_date,
      'paused'
    );
    raise exception 'coached owner self-assign INSERT was allowed';
  exception
    when others then
      if sqlerrm like '%self-assign INSERT was allowed%' then
        raise;
      end if;
  end;

  update public.program_assignments
     set start_date = current_date + 3
   where id = 'a1890000-0000-4000-8000-000000000020';
  get diagnostics v_touched = row_count;
  if v_touched <> 0 then
    raise exception 'coached owner assignment UPDATE reached % rows', v_touched;
  end if;

  delete from public.program_assignments
   where id = 'a1890000-0000-4000-8000-000000000020';
  get diagnostics v_touched = row_count;
  if v_touched <> 0 then
    raise exception 'coached owner assignment DELETE reached % rows', v_touched;
  end if;
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000010')
     is distinct from 'Solo leftover saved' then
    raise exception 'legacy/table leftover name mutated';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'a1890000-0000-4000-8000-000000000010' and weekday = 5
  ) then
    raise exception 'legacy leftover days mutated';
  end if;
  if exists (
    select 1
    from public.program_days d
    join public.program_day_exercises e on e.program_day_id = d.id
    where d.program_id = 'a1890000-0000-4000-8000-000000000010' and e.name = 'Hijack ex'
  ) then
    raise exception 'legacy leftover exercises mutated';
  end if;
  if (select status from public.program_assignments
      where id = 'a1890000-0000-4000-8000-000000000020') is distinct from 'active' then
    raise exception 'leftover assignment status mutated';
  end if;
  if exists (
    select 1 from public.program_assignments
    where client_id = 'a1890000-0000-4000-8000-000000000001' and status = 'paused'
  ) then
    raise exception 'coached leftover self-assign insert persisted';
  end if;
end $$;

-- Coach who is himself Coached: leftover RPCs/tables blocked; roster client writes still work.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1890000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1890000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_left_day uuid;
  v_roster_day uuid;
  v_days int;
  v_count int;
  v_touched int;
  v_new_program uuid := 'a1890000-0000-4000-8000-000000000014';
begin
  select d.id into v_left_day
  from public.program_days d
  where d.program_id = 'a1890000-0000-4000-8000-000000000012' and d.weekday = 1
  limit 1;
  select d.id into v_roster_day
  from public.program_days d
  where d.program_id = 'a1890000-0000-4000-8000-000000000013' and d.weekday = 4
  limit 1;
  if v_left_day is null or v_roster_day is null then
    raise exception 'dual leftover/roster days missing';
  end if;

  begin
    perform public.sync_program_days(
      'a1890000-0000-4000-8000-000000000012',
      '[{"weekday":2,"name":"Dual hijack sync","exercises":[{"name":"X","default_sets":1,"default_reps":1}]}]'::jsonb
    );
    raise exception 'dual leftover sync_program_days was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%'
         and sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    perform public.save_program_day_exercises(
      v_left_day,
      '[{"name":"Dual hijack ex","default_sets":2,"default_reps":2}]'::jsonb
    );
    raise exception 'dual leftover save_program_day_exercises was allowed';
  exception
    when others then
      if sqlerrm not like '%Coached client cannot edit assigned program%'
         and sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    update public.programs
       set name = 'Dual leftover table hijack'
     where id = 'a1890000-0000-4000-8000-000000000012';
    get diagnostics v_touched = row_count;
    if v_touched <> 0 then
      raise exception 'dual leftover programs UPDATE reached % rows', v_touched;
    end if;
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%dual leftover programs UPDATE reached%' then
        raise;
      elsif sqlerrm not like '%permission denied%' and sqlerrm not like '%RPC-only%' then
        raise;
      end if;
  end;

  begin
    insert into public.program_assignments(program_id, client_id, assigned_by, start_date, status)
    values (
      'a1890000-0000-4000-8000-000000000012',
      'a1890000-0000-4000-8000-000000000003',
      'a1890000-0000-4000-8000-000000000003',
      current_date,
      'paused'
    );
    raise exception 'dual leftover self-assign INSERT was allowed';
  exception
    when others then
      if sqlerrm like '%self-assign INSERT was allowed%' then
        raise;
      end if;
  end;

  begin
    perform public.sync_program_days(
      'a1890000-0000-4000-8000-000000000013',
      '[{"weekday":4,"name":"Upper synced","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb
    );
    raise exception 'dual roster sync_program_days still executable';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%still executable%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  begin
    perform public.save_program_day_exercises(
      v_roster_day,
      '[{"name":"Press","default_sets":5,"default_reps":5}]'::jsonb
    );
    raise exception 'dual roster save_program_day_exercises still executable';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm like '%still executable%' then
        raise;
      elsif sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;

  v_days := public.save_program(
    'a1890000-0000-4000-8000-000000000013',
    'Dual roster updated',
    'roster-ok',
    8,
    '[{"weekday":4,"name":"Upper synced","exercises":[{"name":"Press","default_sets":5,"default_reps":5}]}]'::jsonb,
    null
  );
  if v_days is distinct from 1 then
    raise exception 'dual roster description save expected 1 day, got %', v_days;
  end if;

  update public.program_assignments
     set start_date = current_date
   where id = 'a1890000-0000-4000-8000-000000000023';
  get diagnostics v_touched = row_count;
  if v_touched is distinct from 1 then
    raise exception 'dual roster assignment UPDATE expected 1 row, got %', v_touched;
  end if;

  v_new_program := public.create_program_complete(
    'Dual extra roster',
    '',
    6,
    '[{"weekday":1,"name":"Extra","exercises":[{"name":"Curl","default_sets":2,"default_reps":10}]}]'::jsonb
  );

  insert into public.program_assignments(id, program_id, client_id, assigned_by, start_date, status)
  values (
    'a1890000-0000-4000-8000-000000000024',
    v_new_program,
    'a1890000-0000-4000-8000-000000000004',
    'a1890000-0000-4000-8000-000000000003',
    current_date,
    'paused'
  );
end $$;
reset role;

do $$ begin
  if (select name from public.programs where id = 'a1890000-0000-4000-8000-000000000012')
     is distinct from 'Dual leftover saved' then
    raise exception 'dual leftover name mutated after table/RPC probes';
  end if;
  if exists (
    select 1 from public.program_days
    where program_id = 'a1890000-0000-4000-8000-000000000012' and weekday = 2
  ) then
    raise exception 'dual leftover days mutated';
  end if;
  if (select description from public.programs where id = 'a1890000-0000-4000-8000-000000000013')
     is distinct from 'roster-ok' then
    raise exception 'dual roster table update missing';
  end if;
  if not exists (
    select 1
    from public.program_days d
    join public.program_day_exercises e on e.program_day_id = d.id
    where d.program_id = 'a1890000-0000-4000-8000-000000000013'
      and e.name = 'Press' and e.default_sets = 5
  ) then
    raise exception 'dual roster exercises not saved';
  end if;
  if not exists (
    select 1 from public.program_assignments
    where id = 'a1890000-0000-4000-8000-000000000024'
      and client_id = 'a1890000-0000-4000-8000-000000000004'
      and status = 'paused'
  ) then
    raise exception 'dual roster extra assignment missing';
  end if;
end $$;

rollback;
\echo 'save_program coached leftover owner guard passed'
