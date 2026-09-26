-- Audit 3: a session started from a routine or a program keeps the catalog link.
-- The P5.3 trigger already links by name; these rows carry names it cannot resolve
-- (renamed but linked), so only the carried link can keep them in the catalog.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c5270000-0000-4000-8000-000000000001','catlink-coach@example.test'),
 ('c5270000-0000-4000-8000-000000000002','catlink-client@example.test'),
 ('c5270000-0000-4000-8000-000000000003','catlink-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c5270000-0000-4000-8000-000000000001','free','coach'),
 ('c5270000-0000-4000-8000-000000000002','free','none'),
 ('c5270000-0000-4000-8000-000000000003','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('c5270000-0000-4000-8000-000000000001','coach')
on conflict do nothing;
update public.user_profiles set timezone = 'America/Toronto'
 where id in ('c5270000-0000-4000-8000-000000000001','c5270000-0000-4000-8000-000000000002');
select set_config('test.civil_today', (now() at time zone 'America/Toronto')::date::text, true);
insert into public.coach_client_links(coach_id,client_id,status) values
 ('c5270000-0000-4000-8000-000000000001','c5270000-0000-4000-8000-000000000002','active');

-- A private, unverified exercise of someone else, and a merged one.
insert into public.exercises (id, name, name_fr, verified, created_by) values
 ('c5270000-0000-4000-8000-0000000000e1','Catlink private move','Mouvement privé', false,'c5270000-0000-4000-8000-000000000003');
insert into public.exercises (id, name, name_fr, verified, merged_into_id, merged_at) values
 ('c5270000-0000-4000-8000-0000000000e2','Catlink merged plank','Gainage fusionné', true,
  (select id from public.exercises where name = 'Plank' and merged_into_id is null limit 1), now());
select set_config('test.plank', (select id::text from public.exercises where name = 'Plank' and merged_into_id is null limit 1), true);
select set_config('test.bench', (select id::text from public.exercises where name = 'Bench Press' and merged_into_id is null limit 1), true);

-- Coach program: one day, bench linked to the catalog.
set local role authenticated;
select set_config('request.jwt.claim.sub','c5270000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c5270000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare v_program uuid;
begin
  v_program := public.create_program_complete(
    'Catlink plan', '', 4,
    '[{"weekday":1,"name":"Push","exercises":[{"name":"Développé du lundi","default_sets":2,"default_reps":5},{"name":"Unlinked move","default_sets":1,"default_reps":5}]}]'::jsonb,
    'c5270000-0000-4000-8000-000000000002',
    current_setting('test.civil_today')::date
  );
  perform set_config('test.program', v_program::text, true);
end $$;
reset role;
update public.program_day_exercises e set catalog_exercise_id = current_setting('test.bench')::uuid
 from public.program_days d
 where d.id = e.program_day_id and d.program_id = current_setting('test.program')::uuid and e.name = 'Développé du lundi';

set local role authenticated;
select set_config('request.jwt.claim.sub','c5270000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c5270000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_wid uuid;
  v_day uuid;
  v_asg uuid;
begin
  -- Program day: the program row's link is carried; an unlinked row stays unlinked.
  select id into v_day from public.program_days where program_id = current_setting('test.program')::uuid;
  select id into v_asg from public.program_assignments
   where program_id = current_setting('test.program')::uuid and status = 'active';
  v_wid := public.start_workout_from_template('Push', now(), null, v_asg, v_day, '[]'::jsonb);
  if (select catalog_exercise_id from public.workout_exercises where workout_id = v_wid and name = 'Développé du lundi')
       is distinct from current_setting('test.bench')::uuid then
    raise exception 'program catalog link lost';
  end if;
  if (select catalog_exercise_id from public.workout_exercises where workout_id = v_wid and name = 'Unlinked move') is not null then
    raise exception 'unlinked program row got a link';
  end if;

  -- Routine / free template: a readable catalog id is kept, a merged one points to its target,
  -- a private row of someone else, an unknown id and garbage are dropped without failing the start.
  v_wid := public.start_workout_from_template('Free', now(), null, null, null, jsonb_build_array(
    jsonb_build_object('name','Mon gainage du soir','default_sets',1,'default_reps',1,'order_index',0,'set_type','isometric','catalog_exercise_id', current_setting('test.plank')),
    jsonb_build_object('name','Merged','default_sets',1,'default_reps',1,'order_index',1,'catalog_exercise_id','c5270000-0000-4000-8000-0000000000e2'),
    jsonb_build_object('name','Private','default_sets',1,'default_reps',1,'order_index',2,'catalog_exercise_id','c5270000-0000-4000-8000-0000000000e1'),
    jsonb_build_object('name','Unknown','default_sets',1,'default_reps',1,'order_index',3,'catalog_exercise_id','c5270000-0000-4000-8000-00000000ffff'),
    jsonb_build_object('name','Garbage','default_sets',1,'default_reps',1,'order_index',4,'catalog_exercise_id','not-a-uuid'),
    jsonb_build_object('name','None','default_sets',1,'default_reps',1,'order_index',5)
  ));
  if (select catalog_exercise_id from public.workout_exercises where workout_id = v_wid and name = 'Mon gainage du soir')
       is distinct from current_setting('test.plank')::uuid then
    raise exception 'template catalog link lost';
  end if;
  if (select catalog_exercise_id from public.workout_exercises where workout_id = v_wid and name = 'Merged')
       is distinct from current_setting('test.plank')::uuid then
    raise exception 'merged link not redirected';
  end if;
  if exists (select 1 from public.workout_exercises where workout_id = v_wid
             and name in ('Private','Unknown','Garbage','None') and catalog_exercise_id is not null) then
    raise exception 'unreadable or invalid link kept';
  end if;
  if (select count(*) from public.workout_exercises where workout_id = v_wid) <> 6 then
    raise exception 'start dropped an exercise';
  end if;
  -- The timed set type still comes through.
  if (select set_type from public.workout_sets s join public.workout_exercises e on e.id = s.exercise_id
       where e.workout_id = v_wid and e.name = 'Mon gainage du soir') <> 'isometric' then
    raise exception 'set type lost';
  end if;
end $$;
reset role;

rollback;
\echo 'start workout catalog link: program link carried, readable template link kept, merged redirected, invalid dropped'
