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
  if has_function_privilege('anon','public.decide_athlete_watch_proposal(uuid,text,text,text,uuid,timestamptz,jsonb,jsonb)','execute') then
    raise exception 'anon decide allowed';
  end if;
end $$;

CREATE FUNCTION pg_temp.watch_decide(
  p_signal_id uuid,
  p_decision text,
  p_human_reason text,
  p_key text DEFAULT NULL
) RETURNS public.athlete_decision_log
LANGUAGE plpgsql
AS $$
DECLARE
  v_sig public.athlete_signals;
  v_review public.athlete_weekly_reviews;
  v_action jsonb;
  v_fp jsonb;
  v_proposal jsonb := '{}'::jsonb;
  v_evidence jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_sig FROM public.athlete_signals WHERE id = p_signal_id;
  SELECT * INTO v_review FROM public.athlete_weekly_reviews
   WHERE athlete_id = v_sig.athlete_id
   ORDER BY week_start DESC, created_at DESC
   LIMIT 1;
  IF v_review.id IS NOT NULL THEN
    FOR v_action IN SELECT value FROM jsonb_array_elements(COALESCE(v_review.signal_actions, '[]'::jsonb))
    LOOP
      IF v_action->>'domain' = v_sig.domain AND v_action->>'type' = v_sig.type THEN
        v_proposal := COALESCE(v_action->'proposal', '{}'::jsonb);
        FOR v_fp IN SELECT value FROM jsonb_array_elements(COALESCE(v_action->'evidence_for', '[]'::jsonb))
        LOOP
          IF v_fp->>'kind' = 'fingerprint' THEN
            BEGIN
              v_evidence := (v_fp->>'summary')::jsonb;
            EXCEPTION WHEN OTHERS THEN
              v_evidence := '{}'::jsonb;
            END;
          END IF;
        END LOOP;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN public.decide_athlete_watch_proposal(
    p_signal_id,
    p_decision,
    p_human_reason,
    p_key,
    v_review.id,
    v_review.updated_at,
    v_proposal,
    v_evidence
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.watch_decide(uuid, text, text, text) TO authenticated;

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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-08-31'
      )
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

  v_log := pg_temp.watch_decide(v_sig.id, 'accepted', '', 'watch-decide-solo-1');
  if v_log.decision <> 'accepted' or v_log.actor_role <> 'athlete' then
    raise exception 'solo accept journal failed';
  end if;
  if v_log.applied_effect <> '{}'::jsonb then
    raise exception 'solo accept applied an effect';
  end if;
  if v_log.proposal->>'kind' <> 'watch_proposal_decision' then
    raise exception 'solo proposal kind missing';
  end if;
  if v_log.proposal->>'action' <> 'relance' or v_log.proposal->>'flag' <> 'adherence_training' then
    raise exception 'solo journal missing concrete proposal';
  end if;
  if (v_log.data_used->>'workout_count') is null then
    raise exception 'solo data_used missing fingerprint';
  end if;
  select * into v_open from public.athlete_signals where id = v_sig.id;
  if v_open.status <> 'open' then
    raise exception 'solo accept closed the signal';
  end if;

  v_again := pg_temp.watch_decide(v_sig.id, 'accepted', '', 'watch-decide-solo-1');
  if v_again.id <> v_log.id then raise exception 'solo accept not idempotent'; end if;

  begin
    perform pg_temp.watch_decide(
      v_sig.id, 'accepted', 'Je voyage cette semaine', 'watch-decide-solo-reason-b'
    );
    raise exception 'same decision different reason allowed';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;

  begin
    perform pg_temp.watch_decide(v_sig.id, 'refused', 'Pas maintenant');
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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-09-07'
      )
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
  v_week2 := pg_temp.watch_decide(v_sig.id, 'accepted', '');
  if v_week2.id = v_first then raise exception 'week 2 reused week 1 idempotency key'; end if;
  if v_week2.proposal->>'week_start' <> '2026-09-07' then
    raise exception 'week 2 journal missing week_start';
  end if;
  if not exists(select 1 from public.athlete_signals where id = v_sig.id and status = 'open') then
    raise exception 'week 2 accept closed the signal';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_nutrition',
        'action', 'relance',
        'reason', 'not_following',
        'domain', 'nutrition',
        'type', 'not_following',
        'flag', 'adherence_nutrition',
        'week_start', '2026-08-31'
      )
    )
  )
);
-- Coached JWT cannot save a strategic review, nor decide it.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  begin
    perform public.save_athlete_weekly_review(
      'c2500000-0000-4000-8000-000000000002',
      '2026-08-31',
      'adequate',
      'propose',
      'Je forge le contexte du Coach.',
      jsonb_build_object('calorie_target', 9999, 'goal', 'cut'),
      jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
      '[]'::jsonb
    );
    raise exception 'coached self-save weekly review allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
  v_log := pg_temp.watch_decide(
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
  if v_log.proposal->>'action' <> 'relance' or v_log.proposal->>'reason' <> 'not_following' then
    raise exception 'coach refuse missing concrete proposal';
  end if;
  if not exists(select 1 from public.athlete_signals where id = v_sig.id and status = 'open') then
    raise exception 'coach refuse closed the signal';
  end if;
  begin
    perform pg_temp.watch_decide(
      v_sig.id, 'refused', 'Je suis blessé.'
    );
    raise exception 'same refuse different reason allowed';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  v_solo uuid;
  v_client uuid;
begin
  select id into v_solo from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'missed_sessions' and status = 'open';
  select id into v_client from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000002'
     and type = 'not_following' and status = 'open';
  if v_solo is null or v_client is null then
    raise exception 'signal ids missing for stranger tests';
  end if;
  perform set_config('prometheus.p25_solo_signal', v_solo::text, true);
  perform set_config('prometheus.p25_client_signal', v_client::text, true);
end $$;

-- Stranger cannot decide.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p25_solo_signal')::uuid;
begin
  begin
    perform public.decide_athlete_watch_proposal(v_id, 'refused', 'Pas pour moi');
    raise exception 'stranger decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Unrelated coach (meta-coach of 001, not of 003) cannot decide on Solo.
-- Coach-of-coach is not transitive onto the client of 001.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_solo uuid := current_setting('prometheus.p25_solo_signal')::uuid;
  v_client uuid := current_setting('prometheus.p25_client_signal')::uuid;
begin
  begin
    perform public.decide_athlete_watch_proposal(v_solo, 'modified', 'Je change autre chose');
    raise exception 'unrelated coach decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  begin
    perform public.decide_athlete_watch_proposal(v_client, 'modified', 'Pas mon client direct');
    raise exception 'transitive coach decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-08-31'
      )
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
  v_log := pg_temp.watch_decide(
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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

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
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- A propose review without a concrete proposal object is not decidable.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000005',
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
      'confidence', 'medium',
      'status', 'open'
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000005'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(v_sig.id, 'accepted', '');
    raise exception 'generic proposal without object allowed';
  exception when others then
    if sqlerrm <> 'no_current_proposal' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Decision is locked to the review action evidence, not the live signal.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000005',
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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-08-31',
        'draft', jsonb_build_object('calories', 1900)
      )
    )
  )
);

select public.upsert_athlete_signal(
  'c2500000-0000-4000-8000-000000000005',
  'training',
  'missed_sessions',
  'Moins de seances',
  jsonb_build_array(
    jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":6,"expected_workouts":6}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000005'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform pg_temp.watch_decide(v_sig.id, 'accepted', '');
    raise exception 'stale fingerprint still accepted';
  exception when others then
    if sqlerrm <> 'stale_proposal' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

select public.upsert_athlete_signal(
  'c2500000-0000-4000-8000-000000000005',
  'training',
  'missed_sessions',
  'Moins de seances',
  jsonb_build_array(
    jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000005'
     and type = 'missed_sessions' and status = 'open';
  v_log := pg_temp.watch_decide(v_sig.id, 'accepted', '');
  if v_log.proposal->>'action' <> 'relance' then
    raise exception 'restored fingerprint missing concrete proposal';
  end if;
  if (v_log.proposal->'draft'->>'calories') is distinct from '1900' then
    raise exception 'journal missing judged draft';
  end if;
  if (v_log.data_used->>'workout_count') is distinct from '1' then
    raise exception 'journal used live signal instead of review evidence';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Decision is locked to the review the human saw, not the latest at click time.
select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000003',
  '2026-09-21',
  'adequate',
  'propose',
  'Proposition A vue a l ecran.',
  jsonb_build_object(
    'window_start', '2026-09-11',
    'window_end', '2026-09-24',
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
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-09-21'
      )
    )
  )
);

do $$
declare
  v_review public.athlete_weekly_reviews;
begin
  select * into v_review
  from public.athlete_weekly_reviews
  where athlete_id = 'c2500000-0000-4000-8000-000000000003'
    and week_start = '2026-09-21';
  if v_review.id is null then raise exception 'review A missing'; end if;
  perform set_config('prometheus.p25_review_a', v_review.id::text, true);
  perform set_config('prometheus.p25_review_a_at', v_review.updated_at::text, true);
end $$;

select public.save_athlete_weekly_review(
  'c2500000-0000-4000-8000-000000000003',
  '2026-09-28',
  'adequate',
  'propose',
  'Proposition B arrivee pendant que le modal A etait ouvert.',
  jsonb_build_object(
    'window_start', '2026-09-18',
    'window_end', '2026-10-01',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 0,
    'expected_workouts', 6
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'training',
      'type', 'missed_sessions',
      'hypothesis', 'Toujours trop peu',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":0,"expected_workouts":6}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-09-28'
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2500000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
  v_a uuid := current_setting('prometheus.p25_review_a')::uuid;
  v_at timestamptz := current_setting('prometheus.p25_review_a_at')::timestamptz;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'c2500000-0000-4000-8000-000000000003'
     and type = 'missed_sessions' and status = 'open';
  begin
    perform public.decide_athlete_watch_proposal(
      v_sig.id,
      'accepted',
      '',
      NULL,
      v_a,
      v_at,
      jsonb_build_object(
        'kind', 'adherence_training',
        'action', 'relance',
        'domain', 'training',
        'type', 'missed_sessions',
        'flag', 'adherence_training',
        'week_start', '2026-09-21'
      ),
      '{"workout_count":1,"expected_workouts":6}'::jsonb
    );
    raise exception 'older review A still accepted after B arrived';
  exception when others then
    if sqlerrm <> 'stale_proposal' then raise; end if;
  end;
  v_log := pg_temp.watch_decide(v_sig.id, 'accepted', '');
  if v_log.proposal->>'week_start' is distinct from '2026-09-28' then
    raise exception 'current review B not journaled';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Source lock: the RPC must not rewrite tracker rows or call apply engines.
do $$
declare
  def text := pg_get_functiondef('public.decide_athlete_watch_proposal(uuid,text,text,text,uuid,timestamptz,jsonb,jsonb)'::regprocedure);
  save_def text := pg_get_functiondef('public.save_athlete_weekly_review(uuid,date,text,text,text,jsonb,jsonb,jsonb)'::regprocedure);
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
  if def !~ 'stale_proposal' then
    raise exception 'decide missing stale fingerprint guard';
  end if;
  if def !~ 'p_review_id' or def !~ 'p_seen_proposal' then
    raise exception 'decide missing seen review token';
  end if;
  if def !~ 'idempotency_conflict' then
    raise exception 'decide missing payload immutability';
  end if;
  if def !~ 'v_action->''proposal''' or def !~ 'v_action->''evidence_for''' then
    raise exception 'decide not bound to the review action';
  end if;
  if save_def !~ 'actor_is_actively_coached' then
    raise exception 'save_athlete_weekly_review missing coached guard';
  end if;
end $$;

rollback;
\echo 'athlete watch proposal: solo and coach can decide, coached cannot, refuse keeps signal open, custom B does not inherit A'
