\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('c2400000-0000-4000-8000-000000000001','p24-coach@example.test'),
 ('c2400000-0000-4000-8000-000000000002','p24-coached@example.test'),
 ('c2400000-0000-4000-8000-000000000003','p24-solo@example.test'),
 ('c2400000-0000-4000-8000-000000000004','p24-meta-coach@example.test'),
 ('c2400000-0000-4000-8000-000000000005','p24-stranger@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c2400000-0000-4000-8000-000000000001','free','coach'),
 ('c2400000-0000-4000-8000-000000000002','free','none'),
 ('c2400000-0000-4000-8000-000000000003','free','none'),
 ('c2400000-0000-4000-8000-000000000004','free','coach'),
 ('c2400000-0000-4000-8000-000000000005','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('c2400000-0000-4000-8000-000000000001','c2400000-0000-4000-8000-000000000002','active'),
 ('c2400000-0000-4000-8000-000000000004','c2400000-0000-4000-8000-000000000001','active');

do $$ begin
  if has_function_privilege('anon','public.correct_athlete_watch_context(uuid,text,text,text,timestamptz,jsonb)','execute') then
    raise exception 'anon correct allowed';
  end if;
end $$;

CREATE FUNCTION pg_temp.watch_correct(
  p_signal_id uuid,
  p_action text,
  p_human_reason text,
  p_key text DEFAULT NULL
) RETURNS public.athlete_decision_log
LANGUAGE plpgsql
AS $$
DECLARE
  v_sig public.athlete_signals;
  v_fp jsonb;
  v_evidence jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_sig FROM public.athlete_signals WHERE id = p_signal_id;
  FOR v_fp IN SELECT value FROM jsonb_array_elements(COALESCE(v_sig.evidence_for, '[]'::jsonb))
  LOOP
    IF v_fp->>'kind' = 'fingerprint' THEN
      BEGIN
        v_evidence := (v_fp->>'summary')::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_evidence := '{}'::jsonb;
      END;
    END IF;
  END LOOP;
  RETURN public.correct_athlete_watch_context(
    p_signal_id,
    p_action,
    p_human_reason,
    p_key,
    v_sig.updated_at,
    v_evidence
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.watch_correct(uuid, text, text, text) TO authenticated;

-- Solo athlete can correct own open signal.
select public.upsert_athlete_signal(
  'c2400000-0000-4000-8000-000000000003',
  'training',
  'missed_sessions',
  'Moins de séances que prévu',
  jsonb_build_array(
    jsonb_build_object('kind', 'window', 'summary', '2026-08-21..2026-09-03'),
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"workout_count":1,"expected_workouts":6}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
  v_log public.athlete_decision_log;
  v_again public.athlete_decision_log;
  v_closed public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
    where athlete_id = 'c2400000-0000-4000-8000-000000000003'
      and type = 'missed_sessions' and status = 'open';
  if v_sig.id is null then raise exception 'solo signal missing'; end if;
  v_log := pg_temp.watch_correct(
    v_sig.id,
    'not_relevant',
    'Ce n''est pas un écart de plan, c''est une semaine de déplacement.',
    'watch-correct-solo-1'
  );
  if v_log.decision <> 'corrected' or v_log.actor_role <> 'athlete' then
    raise exception 'solo journal failed';
  end if;
  if v_log.human_reason is null or v_log.applied_effect <> '{}'::jsonb then
    raise exception 'solo journal missing reason';
  end if;
  if v_log.proposal->>'kind' <> 'watch_context_correction' then
    raise exception 'solo proposal kind missing';
  end if;
  if (v_log.data_used->>'workout_count') is null then
    raise exception 'solo data_used missing fingerprint';
  end if;
  select * into v_closed from public.athlete_signals where id = v_sig.id;
  if v_closed.status <> 'not_relevant' or v_closed.resolved_at is null then
    raise exception 'solo signal not closed';
  end if;
  if exists(select 1 from public.athlete_signals where id = v_sig.id and status in ('open','waiting')) then
    raise exception 'solo open signal remains';
  end if;
  v_again := public.correct_athlete_watch_context(
    v_sig.id,
    'not_relevant',
    'Ce n''est pas un écart de plan, c''est une semaine de déplacement.',
    'watch-correct-solo-1'
  );
  if v_again.id <> v_log.id then raise exception 'solo correction not idempotent'; end if;
  -- Same payload with another client key still returns the original journal.
  v_again := public.correct_athlete_watch_context(
    v_sig.id,
    'not_relevant',
    'Ce n''est pas un écart de plan, c''est une semaine de déplacement.',
    'watch-correct-solo-other-key'
  );
  if v_again.id <> v_log.id then raise exception 'solo correction replay lost the original journal'; end if;
  begin
    perform public.correct_athlete_watch_context(
      v_sig.id,
      'not_relevant',
      'Je suis blessé, pas en déplacement.',
      'watch-correct-solo-reason-b'
    );
    raise exception 'different reason replay allowed';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  begin
    perform public.correct_athlete_watch_context(
      v_sig.id,
      'corrected',
      'Ce n''est pas un écart de plan, c''est une semaine de déplacement.',
      'watch-correct-solo-action-b'
    );
    raise exception 'different action replay allowed';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- A journal write failure must roll back the resolve (signal stays open).
do $$
declare
  v_sig public.athlete_signals;
  v_key text;
begin
  v_sig := public.upsert_athlete_signal(
    'c2400000-0000-4000-8000-000000000003',
    'recovery',
    'fatigue',
    'Fatigue déclarée',
    jsonb_build_array(
      jsonb_build_object('kind', 'fingerprint', 'summary', '{"avg_fatigue":8,"avg_energy":2}')
    ),
    '[]'::jsonb,
    'medium',
    'open'
  );
  v_key := public.prometheus_decision_idempotency_key(
    v_sig.athlete_id,
    'watch-correct-fail-journal',
    'prometheus_watch',
    v_sig.id,
    'corrected',
    v_sig.domain,
    v_sig.type
  );
  insert into public.athlete_decision_log (
    athlete_id, actor_id, actor_role, domain, type, decision,
    proposal, why, data_used, human_reason, applied_effect,
    source, source_id, idempotency_key
  ) values (
    v_sig.athlete_id,
    v_sig.athlete_id,
    'athlete',
    v_sig.domain,
    v_sig.type,
    'corrected',
    jsonb_build_object('kind', 'watch_context_correction', 'action', 'not_relevant'),
    'Journal injecté pour forcer un conflit de persistance.',
    '{}'::jsonb,
    'payload différent de la RPC',
    '{}'::jsonb,
    'prometheus_watch',
    v_sig.id,
    v_key
  );
  perform set_config('prometheus.p24_fail_signal', v_sig.id::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p24_fail_signal')::uuid;
  v_open public.athlete_signals;
begin
  begin
    perform pg_temp.watch_correct(
      v_id,
      'not_relevant',
      'Semaine de déplacement, à ne pas garder.',
      'watch-correct-fail-journal'
    );
    raise exception 'journal failure still persisted';
  exception when others then
    if sqlerrm <> 'not_persisted' then raise; end if;
  end;
  select * into v_open from public.athlete_signals where id = v_id;
  if v_open.status <> 'open' or v_open.resolved_at is not null then
    raise exception 'journal failure closed the signal';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Coached athlete cannot correct own coaching interpretation.
select public.upsert_athlete_signal(
  'c2400000-0000-4000-8000-000000000002',
  'nutrition',
  'not_following',
  'Apports loin de la cible',
  jsonb_build_array(
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"avg_calories":2800,"calorie_target":2000}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v_sig public.athlete_signals;
begin
  select * into v_sig from public.athlete_signals
    where athlete_id = 'c2400000-0000-4000-8000-000000000002'
      and type = 'not_following' and status = 'open';
  begin
    perform public.correct_athlete_watch_context(
      v_sig.id, 'corrected', 'Je corrige moi-même le coaching'
    );
    raise exception 'coached self-correct allowed';
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

-- Active Coach of the athlete can correct. A Coach who is themselves coached
-- cannot correct their own personal dossier.
select public.upsert_athlete_signal(
  'c2400000-0000-4000-8000-000000000001',
  'training',
  'missed_sessions',
  'Moins de séances perso',
  '[]'::jsonb,
  '[]'::jsonb,
  'low',
  'open'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_client public.athlete_signals;
  v_own public.athlete_signals;
  v_log public.athlete_decision_log;
begin
  select * into v_client
  from public.athlete_signals
  where athlete_id = 'c2400000-0000-4000-8000-000000000002'
    and status = 'open'
  limit 1;
  v_log := pg_temp.watch_correct(
    v_client.id,
    'corrected',
    'Les cibles ont changé : l''écart n''est plus le bon contexte.',
    'watch-correct-coach-client'
  );
  if v_log.actor_role <> 'coach' or v_log.decision <> 'corrected' then
    raise exception 'coach journal failed';
  end if;
  if exists(
    select 1 from public.athlete_signals
    where id = v_client.id and status in ('open','waiting')
  ) then
    raise exception 'coach left client signal open';
  end if;

  select * into v_own from public.athlete_signals
    where athlete_id = 'c2400000-0000-4000-8000-000000000001'
      and type = 'missed_sessions' and status = 'open';
  begin
    perform public.correct_athlete_watch_context(
      v_own.id, 'not_relevant', 'Je corrige mon propre dossier coaché'
    );
    raise exception 'coached coach self-correct allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Capture signal ids as postgres before unauthorized JWTs. A stranger SELECT
-- under RLS sees zero rows, so looking up the id after set role would pass
-- NULL and raise signal_required instead of not_authorized.
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.athlete_signals
  where athlete_id = 'c2400000-0000-4000-8000-000000000003'
    and type = 'missed_sessions'
  limit 1;
  if v_id is null then raise exception 'solo signal id missing for stranger tests'; end if;
  perform set_config('prometheus.p24_solo_signal', v_id::text, true);
end $$;

-- Stranger cannot correct a Solo signal that is already closed (or any other).
set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p24_solo_signal')::uuid;
begin
  begin
    perform public.correct_athlete_watch_context(v_id, 'not_relevant', 'pas mon dossier');
    raise exception 'stranger correct allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Coach of 001 cannot correct 003 (no relationship). Active meta-coach of 001
-- still cannot invent a write on 003.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p24_solo_signal')::uuid;
begin
  begin
    perform public.correct_athlete_watch_context(v_id, 'not_relevant', 'pas mon client');
    raise exception 'unrelated coach correct allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Token is locked to the signal version the human saw.
select public.upsert_athlete_signal(
  'c2400000-0000-4000-8000-000000000003',
  'weight',
  'stall',
  'Trajectoire de poids',
  jsonb_build_array(
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"weigh_ins":4,"weight_delta_kg":0.1}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);

do $$
declare
  v_id uuid;
  v_at timestamptz;
begin
  select id, updated_at into v_id, v_at
  from public.athlete_signals
  where athlete_id = 'c2400000-0000-4000-8000-000000000003'
    and type = 'stall' and status = 'open';
  if v_id is null then raise exception 'stall signal missing for stale context'; end if;
  perform set_config('prometheus.p24_stall_id', v_id::text, true);
  perform set_config('prometheus.p24_stall_at', v_at::text, true);
end $$;

select public.upsert_athlete_signal(
  'c2400000-0000-4000-8000-000000000003',
  'weight',
  'stall',
  'Trajectoire mise a jour',
  jsonb_build_array(
    jsonb_build_object('kind', 'fingerprint', 'summary', '{"weigh_ins":5,"weight_delta_kg":0.8}')
  ),
  '[]'::jsonb,
  'medium',
  'open'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','c2400000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c2400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  v_id uuid := current_setting('prometheus.p24_stall_id')::uuid;
  v_at timestamptz := current_setting('prometheus.p24_stall_at')::timestamptz;
  v_open public.athlete_signals;
begin
  begin
    perform public.correct_athlete_watch_context(
      v_id,
      'not_relevant',
      'Ancienne interpretation a l ecran',
      'watch-correct-stale',
      v_at,
      '{"weigh_ins":4,"weight_delta_kg":0.1}'::jsonb
    );
    raise exception 'stale context still closed';
  exception when others then
    if sqlerrm <> 'stale_context' then raise; end if;
  end;
  select * into v_open from public.athlete_signals where id = v_id;
  if v_open.status <> 'open' or v_open.resolved_at is not null then
    raise exception 'stale context closed the new interpretation';
  end if;
  perform pg_temp.watch_correct(
    v_id,
    'not_relevant',
    'Nouvelle interpretation vue',
    'watch-correct-stale-current'
  );
  if exists(select 1 from public.athlete_signals where id = v_id and status in ('open','waiting')) then
    raise exception 'current token did not close the new interpretation';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  def text := pg_get_functiondef('public.correct_athlete_watch_context(uuid,text,text,text,timestamptz,jsonb)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in correct_athlete_watch_context'; end if;
  if def ~* 'nutrition_logs|daily_calorie_target|program_assignments|workouts' then
    raise exception 'correct_athlete_watch_context mutates tracker data';
  end if;
  if def !~ 'actor_is_actively_coached' then
    raise exception 'correct_athlete_watch_context missing coached guard';
  end if;
  if def !~ 'not_persisted' then
    raise exception 'correct_athlete_watch_context missing journal rollback';
  end if;
  if def !~ 'idempotency_conflict' then
    raise exception 'correct_athlete_watch_context missing replay conflict';
  end if;
  if def !~ 'stale_context' or def !~ 'p_seen_updated_at' then
    raise exception 'correct_athlete_watch_context missing seen token';
  end if;
end $$;

rollback;
\echo 'athlete watch context: solo and coach can correct, coached cannot, no source rewrite'
