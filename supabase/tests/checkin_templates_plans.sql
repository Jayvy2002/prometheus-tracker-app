-- Vision §10–11 : modèles de check-in, fréquence choisie, historique conservé.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b3100000-0000-4000-8000-000000000001','ci-coach@example.test'),
('b3100000-0000-4000-8000-000000000002','ci-client@example.test'),
('b3100000-0000-4000-8000-000000000003','ci-solo@example.test'),
('b3100000-0000-4000-8000-000000000004','ci-other-coach@example.test');
insert into public.user_profiles(id, email) values
('b3100000-0000-4000-8000-000000000001','ci-coach@example.test'),
('b3100000-0000-4000-8000-000000000002','ci-client@example.test'),
('b3100000-0000-4000-8000-000000000003','ci-solo@example.test'),
('b3100000-0000-4000-8000-000000000004','ci-other-coach@example.test')
on conflict (id) do nothing;
insert into public.user_roles(user_id, role, coaching_role) values
('b3100000-0000-4000-8000-000000000001','free','coach'),
('b3100000-0000-4000-8000-000000000002','free','none'),
('b3100000-0000-4000-8000-000000000003','free','none'),
('b3100000-0000-4000-8000-000000000004','free','coach')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;
insert into public.coach_client_links (coach_id, client_id, status)
values ('b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','b3100000-0000-4000-8000-000000000001',true);

do $$
declare
  v_tpl uuid;
begin
  -- The coach builds a reusable template: typed questions, a condition, a « why ».
  insert into public.checkin_templates (id, owner_id, name, questions) values (
    'b3100000-0000-4000-8000-000000000021', 'b3100000-0000-4000-8000-000000000001', 'Hebdo', '[
      {"id":"q1","type":"yes_no","label":{"fr":"As-tu voyagé ?","en":"Did you travel?"}},
      {"id":"q2","type":"text","label":{"fr":"Comment ça s''est passé ?"},"show_if":{"question":"q1","equals":true},
       "why":{"fr":"Pour adapter ton plan quand tu bouges."}},
      {"id":"q3","type":"choice","label":{"fr":"Humeur"},"options":[{"id":"a","label":{"fr":"Bien"}},{"id":"b","label":{"fr":"Moyen"}}]}
    ]'::jsonb) returning id into v_tpl;

  begin
    insert into public.checkin_templates (owner_id, name, questions)
    values ('b3100000-0000-4000-8000-000000000001', 'Bad', '[{"id":"x","type":"horoscope","label":{"fr":"?"}}]');
    raise exception 'unknown question type accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.checkin_templates (owner_id, name, questions)
    values ('b3100000-0000-4000-8000-000000000004', 'Not mine', '[]');
    raise exception 'template created for someone else';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- The coach chooses template + weekly rhythm + why a habit is asked.
  perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000002', v_tpl, 'weekly', 1::smallint,
                                  '{"sleep_hours": "Ton sommeil guide la charge de la semaine."}');
  if (select frequency from public.checkin_plans where user_id = 'b3100000-0000-4000-8000-000000000002') <> 'weekly' then
    raise exception 'plan not saved';
  end if;
  begin
    perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000002', null, 'weekly', null, '{}');
    raise exception 'weekly without weekday accepted';
  exception when others then if sqlerrm <> 'invalid_weekday' then raise; end if;
  end;
end $$;

-- The coached athlete reads plan and template, but the coach decides.
select set_config('request.jwt.claim.sub','b3100000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select name from public.checkin_templates t join public.checkin_plans p on p.template_id = t.id
       where p.user_id = 'b3100000-0000-4000-8000-000000000002') <> 'Hebdo' then
    raise exception 'athlete cannot read the assigned template';
  end if;
  begin
    perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000002', null, 'daily', null, '{}');
    raise exception 'coached athlete changed the plan';
  exception when others then if sqlerrm <> 'coach_decides' then raise; end if;
  end;
  -- Answers keep the label of the moment.
  insert into public.daily_checkins (user_id, checked_at, custom_answers)
  values ('b3100000-0000-4000-8000-000000000002', current_date,
          '[{"id":"q1","type":"yes_no","label":"As-tu voyagé ?","value":true}]');
end $$;

-- A coach whose template is edited later does not rewrite that answer.
select set_config('request.jwt.claim.sub','b3100000-0000-4000-8000-000000000001',true);
update public.checkin_templates set questions = '[{"id":"q1","type":"yes_no","label":{"fr":"Déplacement ?"}}]'
 where owner_id = 'b3100000-0000-4000-8000-000000000001';
do $$ begin
  if (select custom_answers->0->>'label' from public.daily_checkins where user_id = 'b3100000-0000-4000-8000-000000000002') <> 'As-tu voyagé ?' then
    raise exception 'past answer rewritten';
  end if;
end $$;

-- Another coach sees neither plan nor template, and cannot assign.
select set_config('request.jwt.claim.sub','b3100000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists (select 1 from public.checkin_plans where user_id = 'b3100000-0000-4000-8000-000000000002')
     or exists (select 1 from public.checkin_templates where owner_id = 'b3100000-0000-4000-8000-000000000001') then
    raise exception 'another coach sees the plan or templates';
  end if;
  begin
    perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000002', null, 'daily', null, '{}');
    raise exception 'another coach assigned a plan';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end $$;

-- A Solo sets their own rhythm with their own template; history is kept.
select set_config('request.jwt.claim.sub','b3100000-0000-4000-8000-000000000003',true);
do $$
declare
  v_tpl uuid;
begin
  insert into public.checkin_templates (owner_id, name, questions)
  values ('b3100000-0000-4000-8000-000000000003', 'Moi', '[{"id":"h1","type":"number","label":{"fr":"Verres d''eau"}}]')
  returning id into v_tpl;
  perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000003', v_tpl, 'daily', null, '{}');
  perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000003', v_tpl, 'monthly', null, '{}');
  perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000003', v_tpl, 'monthly', null, '{"stress": "Parce que."}');
  if (select count(*) from public.checkin_plan_events where user_id = 'b3100000-0000-4000-8000-000000000003') <> 2 then
    raise exception 'plan history wrong';
  end if;
  begin
    perform public.set_checkin_plan('b3100000-0000-4000-8000-000000000003',
      'b3100000-0000-4000-8000-000000000021', 'daily', null, '{}');
    raise exception 'foreign template assigned';
  exception when others then if sqlerrm not in ('template_not_found') then raise; end if;
  end;
end $$;
reset role;

rollback;
\echo 'checkin templates and plans: typed questions, coach decides, solo decides alone, answers keep labels, other coach blind, history kept'
