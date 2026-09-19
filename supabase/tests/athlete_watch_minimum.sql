\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('d2600000-0000-4000-8000-000000000001','p26-coach@example.test'),
 ('d2600000-0000-4000-8000-000000000002','p26-coached@example.test'),
 ('d2600000-0000-4000-8000-000000000003','p26-solo@example.test'),
 ('d2600000-0000-4000-8000-000000000004','p26-meta-coach@example.test'),
 ('d2600000-0000-4000-8000-000000000005','p26-stranger@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('d2600000-0000-4000-8000-000000000001','free','coach'),
 ('d2600000-0000-4000-8000-000000000002','free','none'),
 ('d2600000-0000-4000-8000-000000000003','free','none'),
 ('d2600000-0000-4000-8000-000000000004','free','coach'),
 ('d2600000-0000-4000-8000-000000000005','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('d2600000-0000-4000-8000-000000000001','d2600000-0000-4000-8000-000000000002','active'),
 ('d2600000-0000-4000-8000-000000000004','d2600000-0000-4000-8000-000000000001','active');
update public.user_profiles set
  daily_calorie_target = 2000,
  protein_target = 150,
  carbs_target = 200,
  fat_target = 67
where id in (
  'd2600000-0000-4000-8000-000000000001',
  'd2600000-0000-4000-8000-000000000002',
  'd2600000-0000-4000-8000-000000000003'
);

do $$ begin
  if has_function_privilege('anon','public.apply_athlete_watch_minimum(uuid,uuid,jsonb,text)','execute') then
    raise exception 'anon apply allowed';
  end if;
  if has_function_privilege('authenticated','public.prometheus_is_complete_calorie_draft(jsonb)','execute') then
    raise exception 'complete draft helper exposed';
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
    p_signal_id, p_decision, p_human_reason, p_key,
    v_review.id, v_review.updated_at, v_proposal, v_evidence
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.watch_decide(uuid, text, text, text) TO authenticated;

CREATE FUNCTION pg_temp.watch_apply(p_signal_id uuid, p_key text DEFAULT NULL)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior public.athlete_decision_log;
BEGIN
  SELECT * INTO v_prior
  FROM public.athlete_decision_log
  WHERE source_id = p_signal_id
    AND source = 'prometheus_watch'
    AND COALESCE(proposal->>'kind', '') = 'watch_proposal_decision'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_prior.id IS NULL THEN
    RAISE EXCEPTION 'no_prior_accept';
  END IF;
  RETURN public.apply_athlete_watch_minimum(
    p_signal_id, v_prior.id, v_prior.proposal, p_key
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.watch_apply(uuid, text) TO authenticated;

select public.save_athlete_weekly_review(
  'd2600000-0000-4000-8000-000000000003',
  '2026-08-31',
  'adequate',
  'propose',
  'Minimum calorique pret a appliquer.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'workout_count', 1,
    'expected_workouts', 6,
    'goal', 'cut',
    'protein_target', 150,
    'carbs_target', 200,
    'fat_target', 67,
    'weight_kg', 80,
    'weight_delta_kg', 0.1
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'weight',
      'type', 'stall',
      'hypothesis', 'Coupe a l arret',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut","calorie_target":2000,"protein_target":150,"carbs_target":200,"fat_target":67,"weight_kg":80,"guarded":false,"weight_delta_kg":0.1,"avg_calories":2000}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'calorie_adjustment',
        'action', 'calorie_adjustment',
        'reason', 'cut_stall',
        'domain', 'weight',
        'type', 'stall',
        'flag', 'stall_adherent',
        'week_start', '2026-08-31',
        'draft', jsonb_build_object('calories', 1900, 'protein', 145, 'carbs', 190, 'fat', 63)
      )
    ),
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

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_cal public.athlete_signals;
  v_train public.athlete_signals;
  v_log public.athlete_decision_log;
  v_apply public.athlete_decision_log;
  v_again public.athlete_decision_log;
  v_prof public.user_profiles;
begin
  select * into v_cal from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000003'
     and domain = 'weight' and type = 'stall' and status = 'open';
  select * into v_train from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000003'
     and domain = 'training' and type = 'missed_sessions' and status = 'open';
  if v_cal.id is null or v_train.id is null then
    raise exception 'solo signals missing';
  end if;

  begin
    perform pg_temp.watch_apply(v_cal.id);
    raise exception 'apply without accept wrote targets';
  exception when others then
    if sqlerrm <> 'no_prior_accept' then raise; end if;
  end;

  v_log := pg_temp.watch_decide(v_train.id, 'accepted', '');
  begin
    perform pg_temp.watch_apply(v_train.id);
    raise exception 'relance apply wrote targets';
  exception when others then
    if sqlerrm <> 'no_applicable_minimum' then raise; end if;
  end;

  v_log := pg_temp.watch_decide(v_cal.id, 'accepted', '');
  select * into v_prof from public.user_profiles
   where id = 'd2600000-0000-4000-8000-000000000003';
  if v_prof.daily_calorie_target is distinct from 2000 then
    raise exception 'accept without apply wrote targets';
  end if;
  if v_log.applied_effect <> '{}'::jsonb then
    raise exception 'accept without apply wrote targets';
  end if;

  begin
    perform public.apply_athlete_watch_minimum(v_cal.id, v_log.id, v_log.proposal, repeat('x', 201));
    raise exception 'long idempotency key applied';
  exception when others then
    if sqlerrm <> 'invalid_idempotency_key' then raise; end if;
  end;

  v_apply := pg_temp.watch_apply(v_cal.id, 'watch-apply-solo-1');
  if v_apply.decision <> 'accepted' or v_apply.proposal->>'kind' <> 'watch_minimum_apply' then
    raise exception 'solo apply journal failed';
  end if;
  if (v_apply.applied_effect->>'daily_calorie_target') is distinct from '1900' then
    raise exception 'solo apply journal missing effect';
  end if;
  select * into v_cal from public.athlete_signals where id = v_cal.id;
  if v_cal.status <> 'open' then
    raise exception 'solo apply closed the signal';
  end if;
  select * into v_prof from public.user_profiles
   where id = 'd2600000-0000-4000-8000-000000000003';
  if v_prof.daily_calorie_target is distinct from 1900
     or v_prof.protein_target is distinct from 145
     or v_prof.carbs_target is distinct from 190
     or v_prof.fat_target is distinct from 63 then
    raise exception 'solo apply missed targets';
  end if;

  v_again := pg_temp.watch_apply(v_cal.id, 'watch-apply-solo-1');
  if v_again.id is distinct from v_apply.id then
    raise exception 'solo apply not idempotent';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Newer review of another week must stale the previous apply token.
select public.save_athlete_weekly_review(
  'd2600000-0000-4000-8000-000000000003',
  '2026-09-07',
  'adequate',
  'propose',
  'Nouvelle semaine, ancien journal.',
  jsonb_build_object(
    'window_start', '2026-08-28',
    'window_end', '2026-09-10',
    'logged_nutrition_days', 10,
    'avg_calories', 1900,
    'calorie_target', 1900,
    'workout_count', 1,
    'expected_workouts', 6,
    'goal', 'cut',
    'protein_target', 145,
    'carbs_target', 190,
    'fat_target', 63,
    'weight_kg', 80,
    'weight_delta_kg', 0.1
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'weight',
      'type', 'stall',
      'hypothesis', 'Toujours a l arret',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-28..2026-09-10'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut","calorie_target":1900,"protein_target":145,"carbs_target":190,"fat_target":63,"weight_kg":80,"guarded":false,"weight_delta_kg":0.1,"avg_calories":1900}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'medium',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'calorie_adjustment',
        'action', 'calorie_adjustment',
        'reason', 'cut_stall',
        'domain', 'weight',
        'type', 'stall',
        'flag', 'stall_adherent',
        'week_start', '2026-09-07',
        'draft', jsonb_build_object('calories', 1800, 'protein', 140, 'carbs', 180, 'fat', 60)
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_old public.athlete_decision_log;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000003'
     and type = 'stall' and status = 'open';
  select * into v_old from public.athlete_decision_log
   where athlete_id = 'd2600000-0000-4000-8000-000000000003'
     and COALESCE(proposal->>'kind','') = 'watch_proposal_decision'
     and COALESCE(proposal->>'week_start','') = '2026-08-31'
   order by created_at desc limit 1;
  begin
    perform public.apply_athlete_watch_minimum(v_sig.id, v_old.id, v_old.proposal, NULL);
    raise exception 'older journal still applied after newer review';
  exception when others then
    if sqlerrm <> 'stale_proposal' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Incomplete draft cannot apply.
select public.save_athlete_weekly_review(
  'd2600000-0000-4000-8000-000000000005',
  '2026-08-31',
  'adequate',
  'propose',
  'Draft incomplet.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'goal', 'cut',
    'protein_target', 150,
    'carbs_target', 200,
    'fat_target', 67,
    'weight_kg', 80,
    'weight_delta_kg', 0.1
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'weight',
      'type', 'stall',
      'hypothesis', 'Draft casse',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut","calorie_target":2000,"protein_target":150,"carbs_target":200,"fat_target":67,"weight_kg":80,"guarded":false,"weight_delta_kg":0.1}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'calorie_adjustment',
        'action', 'calorie_adjustment',
        'reason', 'cut_stall',
        'domain', 'weight',
        'type', 'stall',
        'flag', 'stall_adherent',
        'week_start', '2026-08-31',
        'draft', jsonb_build_object('calories', 1900, 'protein', 0, 'carbs', 190, 'fat', 63)
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000005'
     and type = 'stall' and status = 'open';
  perform pg_temp.watch_decide(v_sig.id, 'accepted', '');
  begin
    perform pg_temp.watch_apply(v_sig.id);
    raise exception 'incomplete draft applied';
  exception when others then
    if sqlerrm <> 'no_applicable_minimum' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Modified does not apply.
select public.save_athlete_weekly_review(
  'd2600000-0000-4000-8000-000000000005',
  '2026-09-07',
  'adequate',
  'propose',
  'Modified sans apply.',
  jsonb_build_object(
    'window_start', '2026-08-28',
    'window_end', '2026-09-10',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'goal', 'cut',
    'protein_target', 150,
    'carbs_target', 200,
    'fat_target', 67,
    'weight_kg', 80,
    'weight_delta_kg', 0.1
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'weight',
      'type', 'stall',
      'hypothesis', 'Encore stall',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-28..2026-09-10'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut","calorie_target":2000,"protein_target":150,"carbs_target":200,"fat_target":67,"weight_kg":80,"guarded":false,"weight_delta_kg":0.1}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'calorie_adjustment',
        'action', 'calorie_adjustment',
        'reason', 'cut_stall',
        'domain', 'weight',
        'type', 'stall',
        'flag', 'stall_adherent',
        'week_start', '2026-09-07',
        'draft', jsonb_build_object('calories', 1900, 'protein', 145, 'carbs', 190, 'fat', 63)
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000005'
     and type = 'stall' and status = 'open';
  perform pg_temp.watch_decide(v_sig.id, 'modified', 'Je veux autre chose');
  begin
    perform pg_temp.watch_apply(v_sig.id);
    raise exception 'modified apply wrote targets';
  exception when others then
    if sqlerrm <> 'no_prior_accept' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Coach applies on the coached dossier; the coached athlete cannot.
select public.save_athlete_weekly_review(
  'd2600000-0000-4000-8000-000000000002',
  '2026-08-31',
  'adequate',
  'propose',
  'Dossier coache, apply coach.',
  jsonb_build_object(
    'window_start', '2026-08-21',
    'window_end', '2026-09-03',
    'logged_nutrition_days', 10,
    'avg_calories', 2000,
    'calorie_target', 2000,
    'goal', 'cut',
    'protein_target', 150,
    'carbs_target', 200,
    'fat_target', 67,
    'weight_kg', 80,
    'weight_delta_kg', 0.1
  ),
  jsonb_build_object('nutrition', true, 'workouts', true, 'weight', true, 'checkins', true),
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert',
      'domain', 'weight',
      'type', 'stall',
      'hypothesis', 'Client stall',
      'evidence_for', jsonb_build_array(
        jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
        jsonb_build_object('kind', 'fingerprint', 'summary', '{"goal":"cut","calorie_target":2000,"protein_target":150,"carbs_target":200,"fat_target":67,"weight_kg":80,"guarded":false,"weight_delta_kg":0.1}')
      ),
      'evidence_against', '[]'::jsonb,
      'confidence', 'high',
      'status', 'open',
      'proposal', jsonb_build_object(
        'kind', 'calorie_adjustment',
        'action', 'calorie_adjustment',
        'reason', 'cut_stall',
        'domain', 'weight',
        'type', 'stall',
        'flag', 'stall_adherent',
        'week_start', '2026-08-31',
        'draft', jsonb_build_object('calories', 1900, 'protein', 145, 'carbs', 190, 'fat', 63)
      )
    )
  )
);

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000002'
     and type = 'stall' and status = 'open';
  begin
    perform pg_temp.watch_decide(v_sig.id, 'accepted', '');
    raise exception 'coached self-decide allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  begin
    perform public.apply_athlete_watch_minimum(
      v_sig.id,
      v_sig.id,
      '{}'::jsonb,
      NULL
    );
    raise exception 'coached self-apply allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- RLS hides other athletes' signals from a stranger. Capture ids as owner.
do $$
declare
  v_solo uuid;
  v_client uuid;
begin
  select id into v_solo from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000003'
     and type = 'stall' limit 1;
  select id into v_client from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000002'
     and type = 'stall' and status = 'open';
  if v_solo is null or v_client is null then
    raise exception 'signal ids missing for stranger tests';
  end if;
  perform set_config('prometheus.p26_solo_signal', v_solo::text, true);
  perform set_config('prometheus.p26_client_signal', v_client::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p26_client_signal')::uuid;
begin
  begin
    perform public.apply_athlete_watch_minimum(
      v_id,
      v_id,
      '{}'::jsonb,
      NULL
    );
    raise exception 'stranger apply allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_apply public.athlete_decision_log;
  v_prof public.user_profiles;
begin
  select * into v_sig from public.athlete_signals
   where athlete_id = 'd2600000-0000-4000-8000-000000000002'
     and type = 'stall' and status = 'open';
  perform pg_temp.watch_decide(v_sig.id, 'accepted', '');
  v_apply := pg_temp.watch_apply(v_sig.id);
  if v_apply.actor_role <> 'coach' then
    raise exception 'coach apply actor missing';
  end if;
  select * into v_prof from public.user_profiles
   where id = 'd2600000-0000-4000-8000-000000000002';
  if v_prof.daily_calorie_target is distinct from 1900 then
    raise exception 'coach apply missed client targets';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- A Coach who is themselves coached cannot apply on their own dossier.
set local role authenticated;
select set_config('request.jwt.claim.sub','d2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"d2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  -- no personal calorie signal for the coached coach; apply on a missing row
  begin
    perform public.apply_athlete_watch_minimum(
      'd2600000-0000-4000-8000-000000000001',
      'd2600000-0000-4000-8000-000000000001',
      '{}'::jsonb,
      NULL
    );
    raise exception 'coached coach self-apply allowed';
  exception when others then
    if sqlerrm not in ('not_found', 'not_authorized', 'stale_proposal') then raise; end if;
  end;
  begin
    perform public.apply_athlete_watch_minimum(
      current_setting('prometheus.p26_solo_signal')::uuid,
      current_setting('prometheus.p26_solo_signal')::uuid,
      '{}'::jsonb,
      NULL
    );
    raise exception 'unrelated coach apply allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  def text := pg_get_functiondef('public.apply_athlete_watch_minimum(uuid,uuid,jsonb,text)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in apply_athlete_watch_minimum'; end if;
  if def ~* 'commit_solo_weekly_review_decision|apply_intervention|_apply_intervention_effects' then
    raise exception 'apply_athlete_watch_minimum is a third apply engine';
  end if;
  if def ~* 'nutrition_logs|program_assignments|weight_measurements' then
    raise exception 'apply_athlete_watch_minimum rewrites source rows';
  end if;
  if def !~ 'coach_set_client_nutrition_targets' then
    raise exception 'apply_athlete_watch_minimum missing coach primitive';
  end if;
  if def !~ 'actor_is_actively_coached' then
    raise exception 'apply_athlete_watch_minimum missing coached guard';
  end if;
  if def ~ 'resolve_athlete_signal' then
    raise exception 'apply closed the signal like a correction';
  end if;
  if def !~ 'invalid_idempotency_key' then
    raise exception 'apply_athlete_watch_minimum missing idempotency length check';
  end if;
end $$;

rollback;
\echo 'athlete watch minimum: solo and coach can apply accepted calorie draft, coached cannot, no auto-apply, no program rewrite'
