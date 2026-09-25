-- Audit 3 : un objectif performance choisi à l'accueil n'est pas remplacé par
-- « maintenir », la base énergétique écrite dans le profil.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b2a00000-0000-4000-8000-000000000001','perf-athlete@example.test'),
('b2a00000-0000-4000-8000-000000000002','body-athlete@example.test');
insert into public.user_profiles(id, email, onboarding_completed, goal) values
('b2a00000-0000-4000-8000-000000000001','perf-athlete@example.test', false, 'maintain'),
('b2a00000-0000-4000-8000-000000000002','body-athlete@example.test', true, 'cut')
on conflict (id) do update set onboarding_completed = excluded.onboarding_completed, goal = excluded.goal;
insert into public.user_roles(user_id, role, coaching_role) values
('b2a00000-0000-4000-8000-000000000001','free','none'),
('b2a00000-0000-4000-8000-000000000002','free','none')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b2a00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims', json_build_object('sub','b2a00000-0000-4000-8000-000000000001','role','authenticated')::text, true);

do $$
declare
  v_goal uuid;
begin
  -- Onboarding: the performance goal first, then the profile with its energy basis.
  v_goal := public.start_goal('b2a00000-0000-4000-8000-000000000001', 'performance', '', null, null, 'onboarding');
  update public.user_profiles set onboarding_completed = true, goal = 'maintain'
   where id = 'b2a00000-0000-4000-8000-000000000001';
  if (select count(*) from public.athlete_goals where user_id = 'b2a00000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'energy basis created a second goal';
  end if;
  if (select kind || '/' || status from public.athlete_goals where id = v_goal) <> 'performance/active' then
    raise exception 'performance goal replaced by the energy basis';
  end if;
  -- Saving the profile again (same basis) changes nothing.
  update public.user_profiles set goal = 'maintain', full_name = 'Perf' where id = 'b2a00000-0000-4000-8000-000000000001';
  if (select count(*) from public.athlete_goals where user_id = 'b2a00000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'profile save recorded a goal';
  end if;
  -- A real body goal chosen later is still recorded and replaces performance.
  update public.user_profiles set goal = 'cut' where id = 'b2a00000-0000-4000-8000-000000000001';
  if (select kind from public.athlete_goals where user_id = 'b2a00000-0000-4000-8000-000000000001' and status = 'active') <> 'cut'
     or (select status from public.athlete_goals where id = v_goal) <> 'replaced' then
    raise exception 'body goal after performance not recorded';
  end if;
end $$;

-- Unchanged for body goals: cut → maintain in the profile is a new goal.
reset role;
update public.user_profiles set goal = 'maintain' where id = 'b2a00000-0000-4000-8000-000000000002';
do $$ begin
  if (select kind from public.athlete_goals where user_id = 'b2a00000-0000-4000-8000-000000000002' and status = 'active') <> 'maintain' then
    raise exception 'maintain after cut not recorded';
  end if;
end $$;

rollback;
\echo 'performance goal energy basis: onboarding performance kept, profile basis not a goal, later body goals still recorded'
