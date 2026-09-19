\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('c2500000-0000-4000-8000-000000000001','p25-coach@example.test'),
 ('c2500000-0000-4000-8000-000000000002','p25-coached@example.test'),
 ('c2500000-0000-4000-8000-000000000003','p25-solo@example.test'),
 ('c2500000-0000-4000-8000-000000000004','p25-meta-coach@example.test'),
 ('c2500000-0000-4000-8000-000000000005','p25-stranger@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c2500000-0000-4000-8000-000000000001','free','coach'),
 ('c2500000-0000-4000-8000-000000000002','free','none'),
 ('c2500000-0000-4000-8000-000000000003','free','none'),
 ('c2500000-0000-4000-8000-000000000004','free','coach'),
 ('c2500000-0000-4000-8000-000000000005','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('c2500000-0000-4000-8000-000000000001','c2500000-0000-4000-8000-000000000002','active'),
 ('c2500000-0000-4000-8000-000000000004','c2500000-0000-4000-8000-000000000001','active');

do $$ begin
  if has_function_privilege('anon','public.decide_athlete_watch_proposal(uuid,text,text,text)','execute') then
    raise exception 'anon decide allowed';
  end if;
end $$;

-- Seed a proposing review + open engine signal for Solo (no JWT).
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000003',
  '2026-08-31',
  'adequate',
  'propose',
  'Une piste est prete a examiner.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open'
    )
  )
);

-- Custom B: open high-confidence signal the review did not propose.
select public.upsert_athlete_signal(
  'c2500000-0000-4000-8000-000000000003',
  'goal',
  'custom_habit',
  'Habitude hors moteur',
  jsonb_build_array(jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut"}')),
  '[]'::jsonb,
  'high',
  'open'
);

-- Solo can accept own current proposal; signal stays open; retry is idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_custom public.athlete_signals;
  v_log public.athlete_decision_log;
  v_again public.athlete_decision_log;
  v_open public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and domain = 'training' and type = 'missed_sessions' and status = 'open';
  if v_sig.id is null then raise exception 'solo engine signal missing'; end if;
  select * into v_custom from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'custom_habit' and status = 'open';
  if v_custom.id is null then raise exception 'custom signal missing'; end if;

  begin
    perform public.decide_athlete_watch_proposal(v_custom.id, 'accepted', '');
    raise exception 'custom B inherited proposal A';
  exception when others then
    if sqlerrm <> 'no_current_proposal' then raise; end if;
  end;

  v_log := public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '', 'watch-decide-solo-1');
  if v_log.decision <> 'accepted' or v_log.actor_role <> 'athlete' then
    raise exception 'solo accept journal failed';
  end if;
  if v_log.applied_effect <> '{}'::jsonb then
    raise exception 'solo accept applied an effect';
  end if;
  if v_log.proposal->>'kind' <> 'watch_proposal_decision' then
    raise exception 'solo proposal kind missing';
  end if;
  if (v_log.data_used->>'workout_count') is null then
    raise exception 'solo data_used missing fingerprint';
  end if;
  select * into v_open from public.athlete_signals where id = v_sig.id;
  if v_open.status <> 'open' then
    raise exception 'solo accept closed the signal';
  end if;

  v_again := public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '', 'watch-decide-solo-1');
  if v_again.id <> v_log.id then raise exception 'solo accept not idempotent'; end if;

  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'refused', 'Pas maintenant');
    raise exception 'solo accept then refuse allowed';
  exception when others then
    if sqlerrm <> 'already_decided' then raise; end if;
  end;

  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'ignored', '');
    raise exception 'ignored decision allowed';
  exception when others then
    if sqlerrm <> 'invalid_decision' then raise; end if;
  end;
end $$;
reset role;

-- A later proposing week on the same open signal must journal again (week-scoped key).
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000003',
  '2026-09-07',
  'adequate',
  'propose',
  'Une piste est prete a examiner.',
  jsonb_build_object(
    'window_start', '2026-08-28',
    'window_end', '2026-09-10',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-28..2026-09-10'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_first uuid;
  v_week2 public.athlete_decision_log;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and domain = 'training' and type = 'missed_sessions' and status = 'open';
  select id into v_first from public.athlete_decision_log
   where athlete_id = v_sig.athlete_id
     and source = 'prometheus_watch'
     and source_id = v_sig.id
     and proposal->>'week_start' = '2026-08-31'
   order by created_at desc limit 1;
  if v_first is null then raise exception 'week 1 journal missing'; end if;
  v_week2 := public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '');
  if v_week2.id = v_first then raise exception 'week 2 reused week 1 idempotency key'; end if;
  if v_week2.proposal->>'week_start' <> '2026-09-07' then
    raise exception 'week 2 journal missing week_start';
  end if;
  if not exists(select 1 from public.athlete_signals where id = v_sig.id and status = 'open') then
    raise exception 'week 2 accept closed the signal';
  end if;
end $$;
reset role;

-- Latest review wait is not a current proposal.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000003',
  '2026-09-14',
  'adequate',
  'wait',
  'Rien de nouveau a proposer cette semaine.',
  jsonb_build_object(
    'window_start', '2026-09-04',
    'window_end', '2026-09-17',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '');
    raise exception 'wait review inherited current proposal';
  exception when others then
    if sqlerrm <> 'no_current_proposal' then raise; end if;
  end;
end $$;
reset role;

-- Coached athlete cannot decide a coaching proposal on their own dossier.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000002',
  '2026-08-31',
  'adequate',
  'propose',
  'Une proposition est prete a valider.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2800,
    'calorie_target', 2000,
    'workout_count', 6,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'nutrition',
      'type', 'not_following',
      'hypothesis', 'Apports loin de la cible',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"avg_calories":2800,"calorie_target":2000}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000002'
     and type = 'not_following' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'refused', 'Je decide tout seul');
    raise exception 'coached self-decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  if not exists(
    select 1 from public.athlete_signals
    where id = v_sig.id and status = 'open'
  ) then
    raise exception 'coached signal closed without authority';
  end if;
end $$;
reset role;

-- Active Coach can refuse the client proposal; signal stays open.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000002'
     and type = 'not_following' and status = 'open';
  v_log := public.decide_athlete_watch_proposal(
    v_sig.id,
    'refused',
    'Pas le bon moment pour changer les cibles.'
  );
  if v_log.decision <> 'refused' or v_log.actor_role <> 'coach' then
    raise exception 'coach refuse journal failed';
  end if;
  if v_log.human_reason is null or v_log.applied_effect <> '{}'::jsonb then
    raise exception 'coach refuse missing reason';
  end if;
  if not exists(select 1 from public.athlete_signals where id = v_sig.id and status = 'open') then
    raise exception 'coach refuse closed the signal';
  end if;
end $$;
reset role;

-- A Coach who is himself coached cannot decide on his own coached dossier.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000001',
  '2026-08-31',
  'adequate',
  'propose',
  'Une proposition est prete a valider.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000001'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '');
    raise exception 'coached coach self-decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

-- Stranger cannot decide.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'refused', 'Pas pour moi');
    raise exception 'stranger decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

-- Unrelated coach (meta-coach of 001, not of 003) cannot decide on Solo.
-- Coach-of-coach is not transitive onto the client of 001.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'modified', 'Je change autre chose');
    raise exception 'unrelated coach decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000002'
     and type = 'not_following' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'modified', 'Pas mon client direct');
    raise exception 'transitive coach decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;

-- Low confidence is not a current proposal; modified requires a reason; closed signal cannot be decided.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000004',
  '2026-08-31',
  'adequate',
  'propose',
  'Une piste est prete a examiner.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'low',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000004'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '');
    raise exception 'low confidence inherited current proposal';
  exception when others then
    if sqlerrm <> 'no_current_proposal' then raise; end if;
  end;
end $$;
reset role;

select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000004',
  '2026-08-31',
  'adequate',
  'propose',
  'Une piste est prete a examiner.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Moins de seances',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
  v_too_long text := repeat('x', 501);
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000004'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'modified', '');
    raise exception 'empty modified reason allowed';
  exception when others then
    if sqlerrm <> 'invalid_reason' then raise; end if;
  end;
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'accepted', v_too_long);
    raise exception 'overlong accept reason allowed';
  exception when others then
    if sqlerrm <> 'invalid_reason' then raise; end if;
  end;
  v_log := public.decide_athlete_watch_proposal(
    v_sig.id,
    'modified',
    'Je garderais le plan, mais je changerais le volume plus tard.'
  );
  if v_log.decision <> 'modified' or v_log.applied_effect <> '{}'::jsonb then
    raise exception 'solo modify journal failed';
  end if;
  if not exists(select 1 from public.athlete_signals where id = v_sig.id and status = 'open') then
    raise exception 'solo modify closed the signal';
  end if;
end $$;
reset role;

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000004'
     and type = 'missed_sessions';
  perform public.resolve_athlete_signal(v_id, 'resolved', 'closed for decide test');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000004'
     and type = 'missed_sessions';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'refused', 'Trop tard');
    raise exception 'closed signal decide allowed';
  exception when others then
    if sqlerrm <> 'no_current_proposal' then raise; end if;
  end;
end $$;
reset role;

-- Source lock: the RPC must not rewrite tracker rows or call apply engines.
do $$
declare
  def text := pg_get_functiondef('public.decide_athlete_watch_proposal(uuid,text,text,text)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in decide_athlete_watch_proposal'; end if;
  if def ~* 'nutrition_logs|daily_calorie_target|program_assignments|workouts' then
    raise exception 'decide_athlete_watch_proposal mutates tracker data';
  end if;
  if def ~* 'commit_solo_weekly_review_decision|apply_intervention|_apply_intervention_effects' then
    raise exception 'decide_athlete_watch_proposal is a third apply engine';
  end if;
  if def !~ 'actor_is_actively_coached' then
    raise exception 'decide_athlete_watch_proposal missing coached guard';
  end if;
  if def ~ 'resolve_athlete_signal' then
    raise exception 'decide closed the signal like a correction';
  end if;
  if def !~ 'watch-decide:' or def !~ 'v_review.week_start' then
    raise exception 'decide idempotency key is not week-scoped';
  end if;
end $$;

rollback;
\echo 'athlete watch proposal: solo and coach can decide, coached cannot, refuse keeps signal open, custom B does not inherit A'
