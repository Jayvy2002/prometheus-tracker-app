\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1930000-0000-4000-8000-000000000001','p23-coach@example.test'),
 ('a1930000-0000-4000-8000-000000000002','p23-athlete@example.test'),
 ('a1930000-0000-4000-8000-000000000003','p23-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1930000-0000-4000-8000-000000000001','free','coach'),
 ('a1930000-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

do $$ begin
  if has_function_privilege('anon','public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)','execute') then
    raise exception 'anon record allowed';
  end if;
  if has_table_privilege('authenticated','public.athlete_decision_log','insert')
     or has_table_privilege('authenticated','public.athlete_decision_log','update')
     or has_table_privilege('authenticated','public.athlete_decision_log','delete') then
    raise exception 'direct decision log writes allowed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1930000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1930000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.record_athlete_decision(
      'a1930000-0000-4000-8000-000000000002',
      'nutrition',
      'not_following',
      'refused',
      '{}'::jsonb,
      'Apports au-dessus de la cible'
    );
    raise exception 'stranger record allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1930000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1930000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_decision_log;
  v2 public.athlete_decision_log;
begin
  begin
    perform public.record_athlete_decision(
      'a1930000-0000-4000-8000-000000000002',
      'nutrition',
      'not_following',
      'refused',
      '{}'::jsonb,
      'ok',
      '{"nutrition_logs":[{"calories":1}]}'::jsonb
    );
    raise exception 'raw logs accepted';
  exception when others then
    if sqlerrm <> 'raw_logs_forbidden' then raise; end if;
  end;

  begin
    perform public.record_athlete_decision(
      'a1930000-0000-4000-8000-000000000002',
      'nutrition',
      'not_following',
      'refused',
      '{}'::jsonb,
      'ok',
      '{}'::jsonb,
      null,
      '{"daily_calorie_target":1800}'::jsonb
    );
    raise exception 'refused with effect accepted';
  exception when others then
    if sqlerrm <> 'applied_effect_forbidden' then raise; end if;
  end;

  begin
    perform public.record_athlete_decision(
      'a1930000-0000-4000-8000-000000000002',
      'nutrition',
      'not_following',
      'kept',
      '{}'::jsonb,
      'ok'
    );
    raise exception 'legacy kept decision accepted';
  exception when others then
    if sqlerrm <> 'invalid_decision' then raise; end if;
  end;

  v := public.record_athlete_decision(
    'a1930000-0000-4000-8000-000000000002',
    'nutrition',
    'not_following',
    'refused',
    '{"action":"calorie_adjustment"}'::jsonb,
    'Apports souvent au-dessus de la cible',
    '{"avg_calories":2800,"calorie_target":2000,"workout_count":1}'::jsonb,
    'Je veux attendre',
    '{}'::jsonb,
    'solo_weekly_reviews'
  );
  if v.athlete_id <> 'a1930000-0000-4000-8000-000000000002' then raise exception 'solo record failed'; end if;
  if v.actor_id <> 'a1930000-0000-4000-8000-000000000002' then raise exception 'solo actor mismatch'; end if;
  if v.actor_role <> 'athlete' then raise exception 'solo actor_role is not athlete'; end if;
  if v.decision <> 'refused' then raise exception 'refused is not stored'; end if;
  if v.human_reason <> 'Je veux attendre' then raise exception 'human reason not stored'; end if;
  if v.applied_effect <> '{}'::jsonb then raise exception 'refused effect not empty'; end if;

  v2 := public.record_athlete_decision(
    'a1930000-0000-4000-8000-000000000002',
    'nutrition',
    'not_following',
    'accepted',
    '{"action":"calorie_adjustment"}'::jsonb,
    'Apports souvent au-dessus de la cible',
    '{"avg_calories":2800}'::jsonb,
    null,
    '{"daily_calorie_target":1800}'::jsonb,
    'solo_weekly_reviews'
  );
  if v2.id = v.id then raise exception 'decision log overwritten'; end if;
  if v2.decision <> 'accepted' then raise exception 'accepted is not stored'; end if;
  if (v2.applied_effect->>'daily_calorie_target') <> '1800' then raise exception 'applied effect missing'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1930000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1930000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_decision_log) then raise exception 'stranger reads decision log'; end if;
end $$;
reset role;

insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1930000-0000-4000-8000-000000000001','a1930000-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1930000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1930000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v public.athlete_decision_log;
begin
  if (select count(*) from public.athlete_decision_log) <> 2 then
    raise exception 'coach cannot read client decision log';
  end if;
  v := public.record_athlete_decision(
    'a1930000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'modified',
    '{"kind":"program_adjustment"}'::jsonb,
    'Moins de seances que prevu',
    '{"workout_count":1}'::jsonb,
    null,
    '{"assign_program_id":"prog-1"}'::jsonb,
    'coach_interventions'
  );
  if v.actor_role <> 'coach' then raise exception 'coach actor_role is not coach'; end if;
  if v.decision <> 'modified' then raise exception 'modified is not stored'; end if;
end $$;
reset role;

update public.coach_client_links set status='ended'
  where coach_id='a1930000-0000-4000-8000-000000000001'
    and client_id='a1930000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1930000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1930000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_decision_log) then raise exception 'former coach reads decision log'; end if;
  begin
    perform public.record_athlete_decision(
      'a1930000-0000-4000-8000-000000000002',
      'nutrition',
      'not_following',
      'ignored',
      '{}'::jsonb,
      'non'
    );
    raise exception 'former coach records decision';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

do $$
declare
  def text := pg_get_functiondef('public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in record_athlete_decision'; end if;
  if def ~* 'update public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles)' then
    raise exception 'record mutates tracker data';
  end if;
  if def ~* 'create or replace function public\.update_athlete_decision' then
    raise exception 'decision log is not append-only';
  end if;
end $$;

rollback;
\echo 'decision log: human refusal shapes the next review, no auto-apply'
