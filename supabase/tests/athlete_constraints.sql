-- Vision §7.6 : douleurs et contraintes déclarées, historisées, visibles du Coach actif.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b3000000-0000-4000-8000-000000000001','pain-athlete@example.test'),
('b3000000-0000-4000-8000-000000000002','pain-coach@example.test'),
('b3000000-0000-4000-8000-000000000003','pain-other-coach@example.test');
insert into public.user_profiles(id, email, full_name) values
('b3000000-0000-4000-8000-000000000001','pain-athlete@example.test','Lucas'),
('b3000000-0000-4000-8000-000000000002','pain-coach@example.test','Coach'),
('b3000000-0000-4000-8000-000000000003','pain-other-coach@example.test','Other')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.user_roles(user_id, role, coaching_role) values
('b3000000-0000-4000-8000-000000000001','free','none'),
('b3000000-0000-4000-8000-000000000002','free','coach'),
('b3000000-0000-4000-8000-000000000003','free','coach')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;
insert into public.coach_client_links (coach_id, client_id, status)
values ('b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','active');
insert into public.workouts (id, user_id, name, date)
values ('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000001','Lower', now());

set local role authenticated;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000001',true);

do $$
declare
  v_id uuid;
  v_again uuid;
begin
  -- In session: knee pain on the squat, temporary, replayed twice by the offline queue.
  v_id := public.declare_constraint('b3000000-0000-4000-8000-000000000001', 'pain', 'knee', 'Sharp at depth', 3::smallint,
                                    'temporary', 'Squat', 'b3000000-0000-4000-8000-000000000011', 'op-pain-1');
  v_again := public.declare_constraint('b3000000-0000-4000-8000-000000000001', 'pain', 'knee', 'Sharp at depth', 3::smallint,
                                       'temporary', 'Squat', 'b3000000-0000-4000-8000-000000000011', 'op-pain-1');
  if v_again <> v_id then raise exception 'offline replay duplicated the declaration'; end if;
  if (select count(*) from public.athlete_constraints where user_id = 'b3000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'duplicate constraint';
  end if;
  if (select exercise_name from public.athlete_constraints where id = v_id) <> 'Squat'
     or (select workout_id from public.athlete_constraints where id = v_id) <> 'b3000000-0000-4000-8000-000000000011' then
    raise exception 'session context lost';
  end if;

  -- Direct writes are refused.
  begin
    update public.athlete_constraints set status = 'resolved' where id = v_id;
    raise exception 'direct update allowed';
  exception when insufficient_privilege then null;
  end;

  -- It gets worse and persists, then it is resolved: closed, never erased.
  perform public.update_constraint(v_id, 4::smallint, 'persistent', 'Still there after a week');
  perform public.set_constraint_status(v_id, 'resolved', 'Physio cleared it');
  if (select status from public.athlete_constraints where id = v_id) <> 'resolved' then raise exception 'not resolved'; end if;
  begin
    perform public.update_constraint(v_id, 2::smallint, null, '');
    raise exception 'resolved constraint edited';
  exception when others then if sqlerrm <> 'constraint_resolved' then raise; end if;
  end;
  if (select string_agg(change, ',' order by occurred_at, change) from public.athlete_constraint_events where constraint_id = v_id)
     not in ('declared,updated,resolved', 'declared,resolved,updated', 'declared,updated,resolved') then
    raise exception 'history incomplete: %', (select string_agg(change, ',') from public.athlete_constraint_events where constraint_id = v_id);
  end if;
  perform public.set_constraint_status(v_id, 'open', 'Came back');
  if (select resolved_at from public.athlete_constraints where id = v_id) is not null then raise exception 'reopen kept resolved_at'; end if;

  -- A session id that is not mine is dropped, not trusted.
  v_id := public.declare_constraint('b3000000-0000-4000-8000-000000000001', 'constraint', 'none', 'Travelling, hotel gym', null,
                                    'temporary', null, gen_random_uuid(), null);
  if (select workout_id from public.athlete_constraints where id = v_id) is not null then raise exception 'foreign workout kept'; end if;
end $$;

-- The active coach reads and can declare; another coach is blind and refused.
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.athlete_constraints where user_id = 'b3000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'active coach cannot read';
  end if;
  perform public.declare_constraint('b3000000-0000-4000-8000-000000000001', 'injury', 'shoulder', 'Old dislocation', null, 'persistent');
end $$;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists (select 1 from public.athlete_constraints where user_id = 'b3000000-0000-4000-8000-000000000001') then
    raise exception 'another coach sees constraints';
  end if;
  begin
    perform public.declare_constraint('b3000000-0000-4000-8000-000000000001', 'pain', 'knee');
    raise exception 'another coach declared';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end $$;
reset role;

-- The coach is told of what the athlete declares (grouped), not of their own notes.
do $$ begin
  if (select item_count from public.notification_outbox
       where user_id = 'b3000000-0000-4000-8000-000000000002' and kind = 'constraint_declared') <> 2 then
    raise exception 'coach not told (or told of their own note)';
  end if;
end $$;

-- Bad values are refused by the table.
do $$ begin
  begin
    insert into public.athlete_constraints (user_id, kind, persistence, severity)
    values ('b3000000-0000-4000-8000-000000000001', 'pain', 'temporary', 9);
    raise exception 'severity 9 accepted';
  exception when check_violation then null;
  end;
end $$;

rollback;
\echo 'athlete constraints: declared in session, idempotent replay, updated, resolved kept, coach scope, coach told'
