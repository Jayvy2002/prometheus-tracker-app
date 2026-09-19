\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1940000-0000-4000-8000-000000000001','p22fix-coach@example.test'),
 ('a1940000-0000-4000-8000-000000000002','p22fix-a@example.test'),
 ('a1940000-0000-4000-8000-000000000003','p22fix-b@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1940000-0000-4000-8000-000000000001','free','coach'),
 ('a1940000-0000-4000-8000-000000000002','free','none'),
 ('a1940000-0000-4000-8000-000000000003','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1940000-0000-4000-8000-000000000001','a1940000-0000-4000-8000-000000000002','active'),
 ('a1940000-0000-4000-8000-000000000001','a1940000-0000-4000-8000-000000000003','active');

do $$
declare
  def text := pg_get_functiondef('public.upsert_athlete_signal(uuid,text,text,text,jsonb,jsonb,text,text,timestamptz)'::regprocedure);
begin
  if def not like '%ON CONFLICT (athlete_id, domain, type) WHERE status IN (''open'', ''waiting'')%' then
    raise exception 'atomic upsert missing';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1940000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1940000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_signals;
  v2 public.athlete_signals;
  latest public.athlete_decision_log;
  n int;
begin
  v := public.upsert_athlete_signal(
    'a1940000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'Moins de seances',
    '[{"kind":"workouts","summary":"1/6"}]'::jsonb
  );
  v2 := public.upsert_athlete_signal(
    'a1940000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'Toujours trop peu',
    '[{"kind":"fingerprint","summary":"w2"},{"kind":"workouts","summary":"1/6"}]'::jsonb
  );
  if v2.id <> v.id then raise exception 'open signal duplicated'; end if;

  begin
    perform public.save_athlete_weekly_review(
      'a1940000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'wait',
      'Cette semaine, aucune modification n est necessaire.',
      '{"logged_nutrition_days":10,"avg_calories":2000,"workout_count":6}'::jsonb,
      '{"nutrition":true,"workouts":true,"weight":true,"checkins":true}'::jsonb,
      '[]'::jsonb
    );
    raise exception 'coached self-save weekly review allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;

  perform public.record_athlete_decision(
    'a1940000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'refused',
    '{"action":"relance"}'::jsonb,
    'Pas maintenant',
    '{"workout_count":1}'::jsonb
  );
  perform public.record_athlete_decision(
    'a1940000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'refused',
    '{"action":"relance"}'::jsonb,
    'Toujours non',
    '{"workout_count":0}'::jsonb
  );
  perform public.record_athlete_decision(
    'a1940000-0000-4000-8000-000000000002',
    'nutrition',
    'not_following',
    'accepted',
    '{"action":"calorie_adjustment"}'::jsonb,
    'ok',
    '{"avg_calories":2000}'::jsonb
  );
  select count(*) into n from public.list_latest_athlete_decisions('a1940000-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'latest decisions not distinct on key'; end if;
  select * into latest from public.list_latest_athlete_decisions('a1940000-0000-4000-8000-000000000002')
    where domain='training' and type='missed_sessions';
  if latest.why <> 'Toujours non' then raise exception 'latest training decision is not the newest'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  wait_row public.athlete_weekly_reviews;
begin
  wait_row := public.save_athlete_weekly_review(
    'a1940000-0000-4000-8000-000000000002',
    '2026-08-31',
    'adequate',
    'wait',
    'Cette semaine, aucune modification n est necessaire.',
    '{"logged_nutrition_days":10,"avg_calories":2000,"workout_count":6}'::jsonb,
    '{"nutrition":true,"workouts":true,"weight":true,"checkins":true}'::jsonb,
    '[]'::jsonb
  );
  if wait_row.decision <> 'wait' then raise exception 'wait week not persisted'; end if;
  if wait_row.authority <> 'coach' then raise exception 'coached review authority is not coach'; end if;

  begin
    perform public.save_athlete_weekly_review(
      'a1940000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'wait',
      'ok',
      '{"payload":{"nutrition_logs":[{"calories":1}]}}'::jsonb
    );
    raise exception 'nested raw logs accepted';
  exception when others then
    if sqlerrm not in ('raw_logs_forbidden', 'invalid_aggregates') then raise; end if;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1940000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1940000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  sig_b public.athlete_signals;
begin
  sig_b := public.upsert_athlete_signal(
    'a1940000-0000-4000-8000-000000000003',
    'nutrition',
    'not_following',
    'Apports hors cible'
  );
  begin
    perform public.save_athlete_weekly_review(
      'a1940000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'close',
      'Cloture hors dossier.',
      '{"workout_count":6}'::jsonb,
      '{"workouts":true}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'op', 'resolve',
        'id', sig_b.id,
        'status', 'resolved',
        'reason', 'wrong athlete'
      ))
    );
    raise exception 'cross-athlete resolve accepted';
  exception when others then
    if sqlerrm <> 'signal_athlete_mismatch' then raise; end if;
  end;
  if (select status from public.athlete_signals where id = sig_b.id) <> 'open' then
    raise exception 'signal of other dossier was closed';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1940000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1940000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_decision_log;
begin
  v := public.commit_solo_weekly_review_decision(
    '2026-08-31',
    'keep',
    'on_track',
    '{}'::jsonb,
    '{"logged_days":10}'::jsonb,
    'dismissed',
    'nutrition',
    'keep',
    '{"action":"keep","reason":"on_track","week_start":"2026-08-31"}'::jsonb,
    'on_track',
    '{"avg_calories":2000}'::jsonb,
    '{}'::jsonb
  );
  if v.decision <> 'refused' then raise exception 'solo composite did not journal refusal'; end if;
  if not exists (
    select 1 from public.solo_weekly_reviews
    where user_id='a1940000-0000-4000-8000-000000000002'
      and week_start='2026-08-31'
      and decision='dismissed'
  ) then raise exception 'solo weekly row missing from composite'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$ begin
  if has_table_privilege('authenticated','public.athlete_decision_outbox','insert') then
    raise exception 'direct outbox writes allowed';
  end if;
  if has_function_privilege('anon','public.commit_solo_weekly_review_decision(date,text,text,jsonb,jsonb,text,text,text,jsonb,text,jsonb,jsonb)','execute') then
    raise exception 'anon commit allowed';
  end if;
end $$;

rollback;
\echo 'review integrity: atomic upsert, wait persisted, mismatch blocked, latest per key'
