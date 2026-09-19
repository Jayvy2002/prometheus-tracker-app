\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('b2600000-0000-4000-8000-000000000001','p2b-coach@example.test'),
 ('b2600000-0000-4000-8000-000000000002','p2b-solo@example.test'),
 ('b2600000-0000-4000-8000-000000000003','p2b-stranger@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('b2600000-0000-4000-8000-000000000001','free','coach'),
 ('b2600000-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('b2600000-0000-4000-8000-000000000001','b2600000-0000-4000-8000-000000000002','active');

do $$
declare
  v_oid oid;
  v_acl aclitem[];
  v_sig text;
  v_denied text[] := array[
    'public.upsert_athlete_signal(uuid,text,text,text,jsonb,jsonb,text,text,timestamptz)',
    'public.resolve_athlete_signal(uuid,text,text)',
    'public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)',
    'public.record_athlete_decision(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid,text,uuid)',
    'public.enqueue_athlete_decision_outbox(text,uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)',
    'public.queue_and_record_athlete_decision(text,uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid)'
  ];
begin
  foreach v_sig in array v_denied loop
    v_oid := v_sig::regprocedure;
    select proacl into v_acl from pg_proc where oid = v_oid;
    if v_acl is null then
      raise exception 'primitive % still has default PUBLIC execute', v_sig;
    end if;
    if has_function_privilege('anon', v_oid, 'execute')
       or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'primitive % still granted to anon/authenticated', v_sig;
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'primitive % missing service_role execute', v_sig;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.record_athlete_decision_replay(uuid,text,text,text,jsonb,text,jsonb,text,jsonb,text,uuid,text,uuid)',
    'execute'
  ) then
    raise exception 'decision replay exposed to clients';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.drain_athlete_decision_outbox(integer)',
    'execute'
  ) then
    raise exception 'drain revoked from clients';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.save_athlete_weekly_review(uuid,date,text,text,text,jsonb,jsonb,jsonb)',
    'execute'
  ) then
    raise exception 'weekly review métier RPC revoked';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.commit_solo_weekly_review_decision(date,text,text,jsonb,jsonb,text,text,text,jsonb,text,jsonb,jsonb,text)',
    'execute'
  ) then
    raise exception 'commit_solo métier RPC revoked';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.apply_intervention(uuid,text,text,text,jsonb,jsonb,text)',
    'execute'
  ) then
    raise exception 'apply_intervention métier RPC revoked';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.correct_athlete_watch_context(uuid,text,text,text,timestamptz,jsonb)',
    'execute'
  ) then
    raise exception 'watch correct métier RPC revoked';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.decide_athlete_watch_proposal(uuid,text,text,text,uuid,timestamptz,jsonb,jsonb)',
    'execute'
  ) then
    raise exception 'watch decide métier RPC revoked';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.upsert_athlete_signal(
      'b2600000-0000-4000-8000-000000000002','training','missed_sessions','Sessions manquantes'
    );
    raise exception 'authenticated upsert_athlete_signal allowed';
  exception when others then
    if sqlerrm !~* 'permission denied' then raise; end if;
  end;
  begin
    perform public.queue_and_record_athlete_decision(
      'p2b-denied',
      'b2600000-0000-4000-8000-000000000002',
      'training',
      'missed_sessions',
      'accepted',
      '{"action":"relance"}'::jsonb,
      'why',
      '{"workout_count":1}'::jsonb
    );
    raise exception 'authenticated queue_and_record allowed';
  exception when others then
    if sqlerrm !~* 'permission denied' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v public.athlete_signals;
begin
  v := public.upsert_athlete_signal(
    'b2600000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'Moins de seances que prevu'
  );
  if v.athlete_id <> 'b2600000-0000-4000-8000-000000000002' then
    raise exception 'service path upsert failed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  wait_row public.athlete_weekly_reviews;
  drained int;
begin
  wait_row := public.save_athlete_weekly_review(
    'b2600000-0000-4000-8000-000000000002',
    '2026-08-31',
    'adequate',
    'wait',
    'Cette semaine, aucune modification n est necessaire.',
    '{"logged_nutrition_days":10,"avg_calories":2000,"workout_count":6}'::jsonb,
    '{"nutrition":true,"workouts":true,"weight":true,"checkins":true}'::jsonb,
    '[]'::jsonb
  );
  if wait_row.decision <> 'wait' then raise exception 'coach métier save failed'; end if;
  drained := public.drain_athlete_decision_outbox(5);
  if drained is null then raise exception 'drain métier failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

rollback;
\echo 'p2 primitives: Data API execute revoked, métier RPCs and service path still work'
