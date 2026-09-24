-- Vision §6 : un objectif est un cycle vivant, jamais un champ écrasé.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b2900000-0000-4000-8000-000000000001','goal-athlete@example.test'),
('b2900000-0000-4000-8000-000000000002','goal-coach@example.test'),
('b2900000-0000-4000-8000-000000000003','goal-other-coach@example.test');
insert into public.user_profiles(id, email, onboarding_completed, goal) values
('b2900000-0000-4000-8000-000000000001','goal-athlete@example.test', false, 'maintain'),
('b2900000-0000-4000-8000-000000000002','goal-coach@example.test', true, 'maintain'),
('b2900000-0000-4000-8000-000000000003','goal-other-coach@example.test', true, 'maintain')
on conflict (id) do update set onboarding_completed = excluded.onboarding_completed, goal = excluded.goal;
insert into public.user_roles(user_id, role, coaching_role) values
('b2900000-0000-4000-8000-000000000001','free','none'),
('b2900000-0000-4000-8000-000000000002','free','coach'),
('b2900000-0000-4000-8000-000000000003','free','coach')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;
insert into public.coach_client_links (coach_id, client_id, status)
values ('b2900000-0000-4000-8000-000000000002','b2900000-0000-4000-8000-000000000001','active');

-- Onboarding completes with « cut »: the first goal is recorded; the default before it was not a choice.
update public.user_profiles set onboarding_completed = true, goal = 'cut' where id = 'b2900000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001') <> 1
     or (select kind from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001') <> 'cut' then
    raise exception 'onboarding goal not recorded once';
  end if;
end $$;
insert into public.weight_measurements (user_id, weight_kg, measured_at)
values ('b2900000-0000-4000-8000-000000000001', 82.4, current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub','b2900000-0000-4000-8000-000000000001',true);

do $$
declare
  v_first uuid;
  v_second uuid;
  v_ev record;
begin
  select id into v_first from public.athlete_goals where status = 'active';
  -- Nobody writes the tables directly.
  begin
    update public.athlete_goals set status = 'reached' where id = v_first;
    if found then raise exception 'direct update allowed'; end if;
  exception when insufficient_privilege then null;
  end;

  -- A new goal replaces the current one, keeps the link, the reason and the weight of the moment.
  v_second := public.start_goal('b2900000-0000-4000-8000-000000000001', 'performance', 'Semi-marathon', null, '2027-04-01', 'Ready for a race');
  if (select status from public.athlete_goals where id = v_first) <> 'replaced' then raise exception 'previous goal not replaced'; end if;
  if (select predecessor_id from public.athlete_goals where id = v_second) <> v_first then raise exception 'successor link lost'; end if;
  select * into v_ev from public.athlete_goal_events where goal_id = v_first and to_status = 'replaced';
  if v_ev.reason <> 'Ready for a race' or (v_ev.metrics->>'weight_kg')::numeric <> 82.4 then
    raise exception 'transition context lost: %', row_to_json(v_ev);
  end if;
  -- performance is not a nutrition goal: the calculators keep the last body goal.
  if (select goal from public.user_profiles where id = 'b2900000-0000-4000-8000-000000000001') <> 'cut' then
    raise exception 'profile goal overwritten by a non-body goal';
  end if;

  -- Paused is a goal state; resuming works; a closed goal stays closed.
  perform public.transition_goal(v_second, 'paused', 'Knee pain');
  perform public.transition_goal(v_second, 'active', 'Back on track');
  perform public.transition_goal(v_second, 'reached', 'Race done');
  begin
    perform public.transition_goal(v_second, 'active', '');
    raise exception 'reached goal reopened as active';
  exception when others then if sqlerrm <> 'invalid_transition' then raise; end if;
  end;
  begin
    perform public.transition_goal(v_first, 'active', '');
    raise exception 'replaced goal reopened';
  exception when others then if sqlerrm <> 'invalid_transition' then raise; end if;
  end;
  if (select count(*) from public.athlete_goal_events where goal_id = v_second) <> 4 then
    raise exception 'transitions not all recorded';
  end if;

  -- Reached then maintained: body goal becomes « maintain ».
  perform public.transition_goal(v_second, 'maintenance', 'Keep it');
  if (select goal from public.user_profiles where id = 'b2900000-0000-4000-8000-000000000001') <> 'maintain' then
    raise exception 'maintenance not reflected on the profile';
  end if;

  -- The past reads as it was.
  if (select kind from public.goal_at('b2900000-0000-4000-8000-000000000001', now() - interval '1 day')) is not null
     and (select kind from public.goal_at('b2900000-0000-4000-8000-000000000001', now() - interval '1 day')) <> 'cut' then
    raise exception 'goal_at wrong in the past';
  end if;
  if (select kind from public.goal_at('b2900000-0000-4000-8000-000000000001', now() + interval '1 second')) <> 'performance' then
    raise exception 'goal_at wrong now';
  end if;
end $$;

-- The active coach can read and set; another coach cannot even see.
select set_config('request.jwt.claim.sub','b2900000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'active coach cannot read goals';
  end if;
  perform public.start_goal('b2900000-0000-4000-8000-000000000001', 'bulk', '', 85, null, 'Off-season');
  if (select created_by from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001' and status = 'active')
     <> 'b2900000-0000-4000-8000-000000000002' then
    raise exception 'coach authorship lost';
  end if;
end $$;
select set_config('request.jwt.claim.sub','b2900000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists (select 1 from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001') then
    raise exception 'another coach sees the goals';
  end if;
  begin
    perform public.start_goal('b2900000-0000-4000-8000-000000000001', 'cut');
    raise exception 'another coach set a goal';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end $$;
reset role;

-- A change made on the profile elsewhere (coach sheet) is recorded, once.
update public.user_profiles set goal = 'cut' where id = 'b2900000-0000-4000-8000-000000000001';
update public.user_profiles set goal = 'cut' where id = 'b2900000-0000-4000-8000-000000000001';
do $$ begin
  if (select kind from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001' and status = 'active') <> 'cut' then
    raise exception 'profile change not recorded';
  end if;
  if (select count(*) from public.athlete_goals where user_id = 'b2900000-0000-4000-8000-000000000001') <> 4 then
    raise exception 'same goal recorded twice';
  end if;
end $$;

rollback;
\echo 'goal lifecycle: replace keeps context, pause/resume/reach/maintain, closed stays closed, goal_at, coach scope, profile changes recorded once'
