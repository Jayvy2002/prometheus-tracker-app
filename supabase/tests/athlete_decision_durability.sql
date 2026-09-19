\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1950000-0000-4000-8000-000000000001','p23d-coach@example.test'),
 ('a1950000-0000-4000-8000-000000000002','p23d-solo-a@example.test'),
 ('a1950000-0000-4000-8000-000000000003','p23d-solo-b@example.test'),
 ('a1950000-0000-4000-8000-000000000004','p23d-coached@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1950000-0000-4000-8000-000000000001','free','coach'),
 ('a1950000-0000-4000-8000-000000000002','free','none'),
 ('a1950000-0000-4000-8000-000000000003','free','none'),
 ('a1950000-0000-4000-8000-000000000004','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1950000-0000-4000-8000-000000000001','a1950000-0000-4000-8000-000000000004','active');

do $$
begin
  if public.prometheus_effects_are_material('{"assign_client_id":"x"}'::jsonb) then
    raise exception 'routing counted as effect';
  end if;
  if public.prometheus_effects_are_material('{"program":{"assign_client_id":"x"}}'::jsonb) then
    raise exception 'nested routing counted as effect';
  end if;
  if not public.prometheus_effects_are_material('{"note":{"body":"ok"}}'::jsonb) then
    raise exception 'note not material';
  end if;
  if not public.prometheus_proposal_materially_edited(
    '{"calories":2000}'::jsonb,
    '{"calories":2000,"patch":{"sets":3}}'::jsonb
  ) then
    raise exception 'patch not detected';
  end if;
  if public.prometheus_proposal_materially_edited(
    '{"calories":2000,"assign_client_id":"a"}'::jsonb,
    '{"calories":2000,"assign_client_id":"b"}'::jsonb
  ) then
    raise exception 'routing id counted as edit';
  end if;
  if public.prometheus_map_intervention_decision('kept', false, false) <> 'ignored' then
    raise exception 'kept without effect is not ignored';
  end if;
  if public.prometheus_map_intervention_decision('sent', true, true) <> 'modified' then
    raise exception 'edited send is not modified';
  end if;
  if public.prometheus_map_intervention_decision('kept', false, true) <> 'accepted' then
    raise exception 'kept with effect is not accepted';
  end if;
  if public.prometheus_proposal_materially_edited(
    '{"program":{"name":"Force","days":[{"weekday":1}],"title":"ctx"},"avg_calories":2200}'::jsonb,
    '{"program":{"name":"Force","days":[{"weekday":1}],"assign_client_id":"x"}}'::jsonb
  ) then
    raise exception 'program context counted as edit';
  end if;
  if not public.prometheus_proposal_materially_edited(
    '{"program":{"name":"Force","days":[{"weekday":1}]}}'::jsonb,
    '{"program":{"name":"Force","days":[{"weekday":2}]}}'::jsonb
  ) then
    raise exception 'program day change not detected';
  end if;
  if not public.prometheus_intake_has_medical_flags('{"cardiaqueHtaPoitrine":"Oui"}'::jsonb) then
    raise exception 'PAR-Q Oui not medical';
  end if;
  if public.prometheus_intake_has_medical_flags('{"objectif":"forme","cardiaqueHtaPoitrine":"Non"}'::jsonb) then
    raise exception 'filled questionnaire without flag counted medical';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  a public.athlete_decision_outbox;
begin
  a := public.enqueue_athlete_decision_outbox(
    'shared-collision-key',
    'a1950000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'accepted',
    '{"action":"relance"}'::jsonb,
    'from-a',
    '{"workout_count":1}'::jsonb
  );
  if a.athlete_id <> 'a1950000-0000-4000-8000-000000000002' then
    raise exception 'solo A outbox athlete mismatch';
  end if;
  if a.payload->>'why' <> 'from-a' then
    raise exception 'solo A outbox payload replaced';
  end if;
  if position('a1950000-0000-4000-8000-000000000002' in a.idempotency_key) <> 1 then
    raise exception 'outbox key not scoped to athlete A';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare
  b public.athlete_decision_outbox;
begin
  begin
    perform public.enqueue_athlete_decision_outbox(
      'shared-collision-key',
      'a1950000-0000-4000-8000-000000000002',
      'training',
      'missed_sessions',
      'accepted',
      '{"action":"relance"}'::jsonb,
      'from-b-as-a',
      '{"workout_count":1}'::jsonb
    );
    raise exception 'cross-account outbox enqueue allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;

  b := public.enqueue_athlete_decision_outbox(
    'shared-collision-key',
    'a1950000-0000-4000-8000-000000000003',
    'nutrition',
    'not_following',
    'refused',
    '{"action":"keep"}'::jsonb,
    'from-b',
    '{"avg_calories":2000}'::jsonb
  );
  if b.athlete_id <> 'a1950000-0000-4000-8000-000000000003' then
    raise exception 'outbox collision returned another dossier';
  end if;
  if b.payload->>'why' <> 'from-b' then
    raise exception 'outbox collision leaked payload';
  end if;
end $$;
reset role;

do $$
declare
  a_id uuid;
  b_id uuid;
  a_why text;
  b_why text;
begin
  select id, payload->>'why' into a_id, a_why
    from public.athlete_decision_outbox
    where athlete_id='a1950000-0000-4000-8000-000000000002'
    order by created_at desc limit 1;
  select id, payload->>'why' into b_id, b_why
    from public.athlete_decision_outbox
    where athlete_id='a1950000-0000-4000-8000-000000000003'
    order by created_at desc limit 1;
  if a_id is null or b_id is null then
    raise exception 'outbox rows missing after collision enqueue';
  end if;
  if a_id = b_id then
    raise exception 'outbox collision reused foreign row';
  end if;
  if a_why <> 'from-a' then
    raise exception 'solo A outbox payload replaced';
  end if;
  if b_why <> 'from-b' then
    raise exception 'outbox collision leaked payload';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  boxed public.athlete_decision_outbox;
begin
  boxed := public.enqueue_athlete_decision_outbox(
    'drain-replay',
    'a1950000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'accepted',
    '{"action":"relance"}'::jsonb,
    'drain recovery',
    '{"workout_count":1}'::jsonb,
    null,
    '{}'::jsonb,
    'coach_interventions',
    null
  );
  if boxed.athlete_id <> 'a1950000-0000-4000-8000-000000000002' then
    raise exception 'drain enqueue athlete mismatch';
  end if;
  if boxed.idempotency_key <> 'a1950000-0000-4000-8000-000000000002:drain-replay' then
    raise exception 'drain enqueue key not derived';
  end if;
  if boxed.processed_at is not null then
    raise exception 'enqueue recorded journal instead of queuing';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  n int;
  drained int;
  actor uuid;
begin
  select count(*) into n from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000002'
      and idempotency_key='a1950000-0000-4000-8000-000000000002:drain-replay';
  if n <> 0 then raise exception 'journal already present before drain'; end if;

  drained := public.drain_athlete_decision_outbox(25);
  if drained < 1 then raise exception 'drain did not recover journal'; end if;

  select count(*) into n from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000002'
      and idempotency_key='a1950000-0000-4000-8000-000000000002:drain-replay';
  if n <> 1 then raise exception 'drain replay duplicated'; end if;
  select actor_id into actor from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000002'
      and idempotency_key='a1950000-0000-4000-8000-000000000002:drain-replay'
    limit 1;
  if actor <> 'a1950000-0000-4000-8000-000000000002' then
    raise exception 'drain lost author';
  end if;

  drained := public.drain_athlete_decision_outbox(25);
  select count(*) into n from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000002'
      and idempotency_key='a1950000-0000-4000-8000-000000000002:drain-replay';
  if n <> 1 then raise exception 'second drain duplicated journal'; end if;
  if not exists (
    select 1 from public.athlete_decision_outbox
    where idempotency_key='a1950000-0000-4000-8000-000000000002:drain-replay'
      and processed_at is not null
  ) then
    raise exception 'outbox not marked processed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_decision_log;
  v2 public.athlete_decision_log;
  n int;
  kcal int;
begin
  v := public.commit_solo_weekly_review_decision(
    '2026-08-31',
    'calorie_adjustment',
    'not_following',
    '{"calories":1800,"protein":140,"carbs":180,"fat":60}'::jsonb,
    '{"logged_days":10}'::jsonb,
    'accepted',
    'nutrition',
    'not_following',
    '{"action":"calorie_adjustment","reason":"not_following","week_start":"2026-08-31"}'::jsonb,
    'not_following',
    '{"avg_calories":2200}'::jsonb,
    '{"daily_calorie_target":1800}'::jsonb,
    'solo_weekly_reviews:a1950000-0000-4000-8000-000000000002:2026-08-31'
  );
  if v.decision <> 'accepted' then raise exception 'solo accept not journaled'; end if;
  select daily_calorie_target into kcal from public.user_profiles
    where id='a1950000-0000-4000-8000-000000000002';
  if kcal <> 1800 then raise exception 'solo accept did not write targets in the same tx'; end if;

  v2 := public.commit_solo_weekly_review_decision(
    '2026-08-31',
    'calorie_adjustment',
    'not_following',
    '{"calories":1800,"protein":140,"carbs":180,"fat":60}'::jsonb,
    '{"logged_days":10}'::jsonb,
    'accepted',
    'nutrition',
    'not_following',
    '{"action":"calorie_adjustment","reason":"not_following","week_start":"2026-08-31"}'::jsonb,
    'not_following',
    '{"avg_calories":2200}'::jsonb,
    '{"daily_calorie_target":1800}'::jsonb,
    'solo_weekly_reviews:a1950000-0000-4000-8000-000000000002:2026-08-31'
  );
  select count(*) into n from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000002'
      and source='solo_weekly_reviews'
      and type='not_following';
  if n <> 1 then raise exception 'solo replay duplicated journal'; end if;
  if v2.id <> v.id then raise exception 'solo replay did not reuse journal row'; end if;

  update public.user_profiles
    set daily_calorie_target = 2000
    where id = 'a1950000-0000-4000-8000-000000000002';
  v2 := public.commit_solo_weekly_review_decision(
    '2026-08-31',
    'calorie_adjustment',
    'not_following',
    '{"calories":1800,"protein":140,"carbs":180,"fat":60}'::jsonb,
    '{"logged_days":10}'::jsonb,
    'accepted',
    'nutrition',
    'not_following',
    '{"action":"calorie_adjustment","reason":"not_following","week_start":"2026-08-31"}'::jsonb,
    'not_following',
    '{"avg_calories":2200}'::jsonb,
    '{"daily_calorie_target":1800}'::jsonb,
    'solo_weekly_reviews:a1950000-0000-4000-8000-000000000002:2026-08-31'
  );
  select daily_calorie_target into kcal from public.user_profiles
    where id='a1950000-0000-4000-8000-000000000002';
  if kcal <> 2000 then raise exception 'solo replay rewrote calorie targets'; end if;
  if v2.id <> v.id then raise exception 'solo replay after profile edit did not reuse journal'; end if;

  begin
    perform public.commit_solo_weekly_review_decision(
      '2026-08-31',
      'calorie_adjustment',
      'not_following',
      '{"calories":1600}'::jsonb,
      '{}'::jsonb,
      'dismissed',
      'nutrition',
      'not_following',
      '{"action":"calorie_adjustment","reason":"not_following","week_start":"2026-08-31"}'::jsonb,
      'not_following',
      '{"avg_calories":2200}'::jsonb,
      '{}'::jsonb,
      'solo_weekly_reviews:a1950000-0000-4000-8000-000000000002:2026-08-31'
    );
    raise exception 'solo replay with different decision accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;

  begin
    perform public.triage_eligible_solo_weekly('a1950000-0000-4000-8000-000000000003');
    raise exception 'solo triage other athlete allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  n int;
  has_coached boolean;
begin
  select count(*) into n from public.triage_eligible_solo_weekly();
  if n < 2 then raise exception 'eligible solos missing from server loop'; end if;
  select exists (
    select 1 from public.triage_eligible_solo_weekly()
    where athlete_id='a1950000-0000-4000-8000-000000000004'
  ) into has_coached;
  if has_coached then raise exception 'coached athlete in solo weekly loop'; end if;
  if not exists (
    select 1 from public.triage_eligible_solo_weekly()
    where athlete_id='a1950000-0000-4000-8000-000000000002'
  ) then
    raise exception 'solo A missing from server loop';
  end if;
end $$;

do $$
declare
  rec_defaults int;
  commit_defaults int;
begin
  select pronargdefaults into rec_defaults
    from pg_proc
    where oid = 'public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid,text,uuid)'::regprocedure;
  if rec_defaults <> 0 then
    raise exception 'record_athlete_decision 13-arg must not use DEFAULT (42P13)';
  end if;
  select pronargdefaults into commit_defaults
    from pg_proc
    where oid = 'public.commit_solo_weekly_review_decision(date,text,text,jsonb,jsonb,text,text,text,jsonb,text,jsonb,jsonb,text)'::regprocedure;
  if commit_defaults <> 0 then
    raise exception 'commit_solo 13-arg must not use DEFAULT (42P13)';
  end if;
  perform 'public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)'::regprocedure;
  perform 'public.commit_solo_weekly_review_decision(date,text,text,jsonb,jsonb,text,text,text,jsonb,text,jsonb,jsonb)'::regprocedure;
  if has_function_privilege(
    'authenticated',
    'public.record_athlete_decision_replay(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid,text,uuid)',
    'execute'
  ) then
    raise exception 'decision replay exposed to clients';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.prometheus_write_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid,text,uuid)',
    'execute'
  ) then
    raise exception 'write helper exposed to clients';
  end if;
end $$;

insert into public.coach_interventions (
  id, coach_id, client_id, kind, title, rationale, payload, status
) values (
  'a1950000-0000-4000-8000-000000000010',
  'a1950000-0000-4000-8000-000000000001',
  'a1950000-0000-4000-8000-000000000004',
  'adherence_training',
  'Seances manquees',
  'Moins de seances que prevu',
  '{"flag":"missed_sessions","workout_count":1,"expected_workouts":6,"evidence":{"workout_count":1}}'::jsonb,
  'pending'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  applied jsonb;
  proofs jsonb;
  n int;
begin
  applied := public.apply_intervention(
    'a1950000-0000-4000-8000-000000000010',
    'coach-ref-1',
    null,
    'dismissed',
    '{"flag":"missed_sessions","workout_count":1,"expected_workouts":6,"evidence":{"workout_count":1}}'::jsonb,
    '{}'::jsonb,
    null
  );
  if applied->>'ok' is distinct from 'true' then
    raise exception 'coach refuse apply failed: %', applied;
  end if;
  select data_used into proofs
    from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000004'
      and source_id='a1950000-0000-4000-8000-000000000010'
      and decision='refused';
  if proofs is null then raise exception 'coach refuse not journaled'; end if;
  if proofs = '{}'::jsonb then raise exception 'empty coach evidence still blocking'; end if;
  if coalesce((proofs->>'workout_count')::int, 0) <> 1 then
    raise exception 'coach refuse lost workout proof: %', proofs;
  end if;

  begin
    perform public.queue_and_record_athlete_decision(
      'coach_interventions:a1950000-0000-4000-8000-000000000010:dismissed',
      'a1950000-0000-4000-8000-000000000004',
      'training',
      'missed_sessions',
      'refused',
      '{"kind":"adherence_training","action":"adherence_training","flag":"missed_sessions"}'::jsonb,
      'Moins de seances que prevu',
      '{"workout_count":9}'::jsonb,
      null,
      '{}'::jsonb,
      'coach_interventions',
      'a1950000-0000-4000-8000-000000000010'
    );
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  select count(*) into n from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000004'
      and source_id='a1950000-0000-4000-8000-000000000010';
  if n <> 1 then raise exception 'coach refuse duplicated after frontend retry'; end if;
  select data_used into proofs
    from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000004'
      and source_id='a1950000-0000-4000-8000-000000000010';
  if coalesce((proofs->>'workout_count')::int, 0) <> 1 then
    raise exception 'frontend retry replaced stored proofs';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

insert into public.workouts(id,user_id,name,date,completed) values
 ('a1950000-0000-4000-8000-000000000021','a1950000-0000-4000-8000-000000000004','kept-1', current_date, true),
 ('a1950000-0000-4000-8000-000000000022','a1950000-0000-4000-8000-000000000004','kept-2', current_date, true),
 ('a1950000-0000-4000-8000-000000000023','a1950000-0000-4000-8000-000000000004','kept-3', current_date, true);

do $$
declare
  stored int;
  fresh int;
begin
  select coalesce((data_used->>'workout_count')::int, 0) into stored
    from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000004'
      and source_id='a1950000-0000-4000-8000-000000000010';
  select coalesce((public.prometheus_athlete_evidence_snapshot('a1950000-0000-4000-8000-000000000004')->>'workout_count')::int, 0)
    into fresh;
  if abs(fresh - stored) < 2 then
    raise exception 'new evidence should lift refusal stored=% fresh=%', stored, fresh;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$
declare
  boxed public.athlete_decision_outbox;
begin
  boxed := public.enqueue_athlete_decision_outbox(
    'coach-drain-author',
    'a1950000-0000-4000-8000-000000000004',
    'training',
    'missed_sessions',
    'accepted',
    '{"action":"relance"}'::jsonb,
    'athlete queued',
    '{"workout_count":3}'::jsonb
  );
  if boxed.actor_id <> 'a1950000-0000-4000-8000-000000000004' then
    raise exception 'outbox actor not the athlete';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  drained int;
  actor uuid;
begin
  drained := public.drain_athlete_decision_outbox(25);
  if drained < 1 then raise exception 'coach drain did not recover athlete journal'; end if;
  select actor_id into actor
    from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000004'
      and idempotency_key='a1950000-0000-4000-8000-000000000004:coach-drain-author';
  if actor <> 'a1950000-0000-4000-8000-000000000004' then
    raise exception 'coach drain attributed the decision to the coach';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

-- Poison fixtures run as postgres (clients cannot insert into the outbox).
insert into public.athlete_decision_outbox (
  idempotency_key, athlete_id, actor_id, payload, created_at, next_attempt_at, attempts
) values (
  'a1950000-0000-4000-8000-000000000003:poison-old',
  'a1950000-0000-4000-8000-000000000003',
  'a1950000-0000-4000-8000-000000000003',
  '{"why":"bad"}'::jsonb,
  clock_timestamp() - interval '2 hours',
  clock_timestamp() - interval '1 minute',
  0
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1950000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1950000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.enqueue_athlete_decision_outbox(
      'invalid-domain',
      'a1950000-0000-4000-8000-000000000003',
      'nope',
      'missed_sessions',
      'accepted',
      '{"action":"relance"}'::jsonb,
      'should not queue',
      '{}'::jsonb
    );
    raise exception 'invalid payload was queued';
  exception when others then
    if sqlerrm <> 'invalid_domain' then raise; end if;
  end;

  perform public.enqueue_athlete_decision_outbox(
    'later-valid',
    'a1950000-0000-4000-8000-000000000003',
    'training',
    'missed_sessions',
    'accepted',
    '{"action":"relance"}'::jsonb,
    'later valid',
    '{"workout_count":1}'::jsonb
  );
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

do $$
declare
  drained int;
  poison_next timestamptz;
  poison_fail timestamptz;
  later_done timestamptz;
begin
  drained := public.drain_athlete_decision_outbox(1);
  if drained <> 0 then raise exception 'poison drain should not journal'; end if;
  select next_attempt_at, failed_at into poison_next, poison_fail
    from public.athlete_decision_outbox
    where idempotency_key='a1950000-0000-4000-8000-000000000003:poison-old';
  if poison_fail is not null then raise exception 'first poison failure marked permanent'; end if;
  if poison_next <= clock_timestamp() then
    raise exception 'poison outbox must not starve later rows';
  end if;

  drained := public.drain_athlete_decision_outbox(1);
  if drained <> 1 then raise exception 'valid row behind poison not drained'; end if;
  select processed_at into later_done
    from public.athlete_decision_outbox
    where idempotency_key='a1950000-0000-4000-8000-000000000003:later-valid';
  if later_done is null then raise exception 'later valid row still pending'; end if;
  if not exists (
    select 1 from public.athlete_decision_log
    where athlete_id='a1950000-0000-4000-8000-000000000003'
      and idempotency_key='a1950000-0000-4000-8000-000000000003:later-valid'
  ) then
    raise exception 'later valid journal missing';
  end if;
end $$;

update public.user_profiles
  set date_of_birth = (current_date - interval '18 years' + interval '1 day')::date,
      kinesiology_intake = '{"objectif":"forme","cardiaqueHtaPoitrine":"Non"}'::jsonb
  where id='a1950000-0000-4000-8000-000000000003';

insert into public.workouts(id,user_id,name,date,completed) values
 ('a1950000-0000-4000-8000-000000000031','a1950000-0000-4000-8000-000000000003','future', current_date + 7, true),
 ('a1950000-0000-4000-8000-000000000032','a1950000-0000-4000-8000-000000000003','old', current_date - 20, true),
 ('a1950000-0000-4000-8000-000000000033','a1950000-0000-4000-8000-000000000003','in-window', current_date, true);

do $$
declare
  d jsonb;
begin
  select dossier into d
    from public.triage_eligible_solo_weekly('a1950000-0000-4000-8000-000000000003');
  if d is null then raise exception 'solo B missing from triage'; end if;
  if coalesce((d->>'workout_count')::int, 0) <> 1 then
    raise exception 'triage window included out-of-range sessions: %', d->>'workout_count';
  end if;
  if coalesce((d->>'is_minor')::boolean, false) is not true then
    raise exception 'calendar age 17 not flagged minor';
  end if;
  if coalesce((d->>'has_medical_flags')::boolean, true) is not false then
    raise exception 'questionnaire without PAR-Q flag counted medical';
  end if;

  update public.user_profiles
    set date_of_birth = (current_date - interval '18 years')::date,
        kinesiology_intake = '{"cardiaqueHtaPoitrine":"Oui"}'::jsonb
    where id='a1950000-0000-4000-8000-000000000003';
  select dossier into d
    from public.triage_eligible_solo_weekly('a1950000-0000-4000-8000-000000000003');
  if coalesce((d->>'is_minor')::boolean, true) is not false then
    raise exception 'calendar age 18 still flagged minor';
  end if;
  if coalesce((d->>'has_medical_flags')::boolean, false) is not true then
    raise exception 'PAR-Q Oui not flagged medical';
  end if;
end $$;

rollback;
\echo 'decision durability: outbox isolation, drain replay, solo without dashboard'
