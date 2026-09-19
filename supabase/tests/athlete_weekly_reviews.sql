\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1920000-0000-4000-8000-000000000001','p22-coach@example.test'),
 ('a1920000-0000-4000-8000-000000000002','p22-athlete@example.test'),
 ('a1920000-0000-4000-8000-000000000003','p22-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1920000-0000-4000-8000-000000000001','free','coach'),
 ('a1920000-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

do $$ begin
  if has_function_privilege('anon','public.save_athlete_weekly_review(uuid,date,text,text,text,jsonb,jsonb,jsonb)','execute') then
    raise exception 'anon save allowed';
  end if;
  if has_table_privilege('authenticated','public.athlete_weekly_reviews','insert')
     or has_table_privilege('authenticated','public.athlete_weekly_reviews','update')
     or has_table_privilege('authenticated','public.athlete_weekly_reviews','delete') then
    raise exception 'direct weekly review writes allowed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1920000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1920000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.save_athlete_weekly_review(
      'a1920000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'wait',
      'Aucun changement.'
    );
    raise exception 'stranger save allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1920000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1920000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_weekly_reviews;
  v2 public.athlete_weekly_reviews;
  sig public.athlete_signals;
begin
  begin
    perform public.save_athlete_weekly_review(
      'a1920000-0000-4000-8000-000000000002',
      '2026-09-01',
      'adequate',
      'wait',
      'Mardi n est pas un lundi ISO.'
    );
    raise exception 'non-monday week accepted';
  exception when others then
    if sqlerrm <> 'invalid_week_start' then raise; end if;
  end;

  begin
    perform public.save_athlete_weekly_review(
      'a1920000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'wait',
      'ok',
      '{"nutrition_logs":[{"calories":1}]}'::jsonb
    );
    raise exception 'raw logs accepted';
  exception when others then
    if sqlerrm <> 'raw_logs_forbidden' then raise; end if;
  end;

  v := public.save_athlete_weekly_review(
    'a1920000-0000-4000-8000-000000000002',
    '2026-08-31',
    'adequate',
    'wait',
    'Cette semaine, aucune modification n est nécessaire.',
    '{"logged_nutrition_days":10,"avg_calories":2000,"workout_count":6}'::jsonb,
    '{"nutrition":true,"workouts":true,"weight":true,"checkins":true}'::jsonb,
    '[]'::jsonb
  );
  if v.athlete_id <> 'a1920000-0000-4000-8000-000000000002' then raise exception 'solo save failed'; end if;
  if v.authority <> 'athlete' then raise exception 'solo authority is not athlete'; end if;
  if v.decision <> 'wait' then raise exception 'wait is not stored'; end if;
  if v.week_start <> '2026-08-31' then raise exception 'week start mismatch'; end if;

  v2 := public.save_athlete_weekly_review(
    'a1920000-0000-4000-8000-000000000002',
    '2026-08-31',
    'adequate',
    'wait',
    'Toujours aucune modification.',
    '{"logged_nutrition_days":11}'::jsonb,
    '{"nutrition":true}'::jsonb,
    '[{"op":"upsert","domain":"training","type":"missed_sessions","hypothesis":"Moins de seances que prevu","evidence_for":[{"kind":"workouts","summary":"1/6"}],"evidence_against":[],"confidence":"low","status":"open"}]'::jsonb
  );
  if v2.id <> v.id then raise exception 'week row duplicated'; end if;
  if v2.updated_at <= v.updated_at then raise exception 'week row not refreshed'; end if;
  select * into sig from public.athlete_signals
    where athlete_id='a1920000-0000-4000-8000-000000000002' and type='missed_sessions';
  if sig.id is null or sig.confidence <> 'low' then raise exception 'signal action not applied'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1920000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1920000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_weekly_reviews) then raise exception 'stranger reads weekly reviews'; end if;
end $$;
reset role;

insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1920000-0000-4000-8000-000000000001','a1920000-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1920000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1920000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v public.athlete_weekly_reviews;
begin
  if (select count(*) from public.athlete_weekly_reviews) <> 1 then
    raise exception 'coach cannot read client weekly review';
  end if;
  v := public.save_athlete_weekly_review(
    'a1920000-0000-4000-8000-000000000002',
    '2026-08-31',
    'adequate',
    'propose',
    'Une proposition est prete a valider. Rien n a ete applique.',
    '{"workout_count":1}'::jsonb,
    '{"workouts":true}'::jsonb,
    '[]'::jsonb
  );
  if v.authority <> 'coach' then raise exception 'coached authority is not coach'; end if;
  if v.decision <> 'propose' then raise exception 'coach propose not stored'; end if;
end $$;
reset role;

update public.coach_client_links set status='ended'
  where coach_id='a1920000-0000-4000-8000-000000000001'
    and client_id='a1920000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1920000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1920000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_weekly_reviews) then raise exception 'former coach reads weekly reviews'; end if;
  begin
    perform public.save_athlete_weekly_review(
      'a1920000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'wait',
      'non'
    );
    raise exception 'former coach saves weekly review';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

do $$
declare
  def text := pg_get_functiondef('public.save_athlete_weekly_review(uuid,date,text,text,text,jsonb,jsonb,jsonb)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in save_athlete_weekly_review'; end if;
  if def ~* 'update public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles)' then
    raise exception 'save mutates tracker data';
  end if;
end $$;

rollback;
\echo 'weekly review: universal engine, wait is valid, no auto-apply'
