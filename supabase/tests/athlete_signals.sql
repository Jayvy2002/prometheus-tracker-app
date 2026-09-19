\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1910000-0000-4000-8000-000000000001','p21-coach@example.test'),
 ('a1910000-0000-4000-8000-000000000002','p21-athlete@example.test'),
 ('a1910000-0000-4000-8000-000000000003','p21-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1910000-0000-4000-8000-000000000001','free','coach'),
 ('a1910000-0000-4000-8000-000000000002','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1910000-0000-4000-8000-000000000001','a1910000-0000-4000-8000-000000000002','active');

do $$ begin
  if has_function_privilege('anon','public.upsert_athlete_signal(uuid,text,text,text,jsonb,jsonb,text,text,timestamptz)','execute') then
    raise exception 'anon upsert allowed';
  end if;
  if has_function_privilege('authenticated','public.upsert_athlete_signal(uuid,text,text,text,jsonb,jsonb,text,text,timestamptz)','execute')
     or has_function_privilege('authenticated','public.resolve_athlete_signal(uuid,text,text)','execute') then
    raise exception 'authenticated primitive execute allowed';
  end if;
  if has_table_privilege('authenticated','public.athlete_signals','insert')
     or has_table_privilege('authenticated','public.athlete_signals','update')
     or has_table_privilege('authenticated','public.athlete_signals','delete') then
    raise exception 'direct signal writes allowed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','training','missed_sessions','Sessions manquantes'
    );
    raise exception 'stranger upsert allowed';
  exception when others then
    if sqlerrm !~* 'permission denied' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','training','missed_sessions','Sessions manquantes'
    );
    raise exception 'stranger upsert allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_signals;
  v2 public.athlete_signals;
begin
  v := public.upsert_athlete_signal(
    'a1910000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'Moins de séances que prévu',
    '[{"kind":"workouts","summary":"1 séance / 7 jours"}]'::jsonb,
    '[]'::jsonb,
    'medium',
    'open'
  );
  if v.athlete_id <> 'a1910000-0000-4000-8000-000000000002' or v.status <> 'open' or v.confidence <> 'medium' then
    raise exception 'solo upsert failed';
  end if;
  v2 := public.upsert_athlete_signal(
    'a1910000-0000-4000-8000-000000000002',
    'training',
    'missed_sessions',
    'Toujours trop peu de séances',
    '[{"kind":"workouts","summary":"1 séance / 14 jours"}]'::jsonb,
    '[{"kind":"workouts","summary":"une séance loggée"}]'::jsonb,
    'high',
    'waiting'
  );
  if v2.id <> v.id then raise exception 'open signal duplicated'; end if;
  if v2.status <> 'waiting' or v2.confidence <> 'high' then raise exception 'open signal not refreshed'; end if;
  if v2.first_seen_at <> v.first_seen_at then raise exception 'first_seen rewritten'; end if;
  if v2.last_seen_at <= v.last_seen_at then raise exception 'last_seen not advanced'; end if;
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','sleep','missed_sessions','Hors domaine'
    );
    raise exception 'invalid domain accepted';
  exception when others then
    if sqlerrm <> 'invalid_domain' then raise; end if;
  end;
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','training','missed_sessions','x','[]'::jsonb,'[]'::jsonb,'0.87'
    );
    raise exception 'numeric confidence accepted';
  exception when others then
    if sqlerrm <> 'invalid_confidence' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_signals) then raise exception 'stranger reads signals'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.athlete_signals) <> 1 then raise exception 'coach cannot read client signal'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v public.athlete_signals;
begin
  v := public.upsert_athlete_signal(
    'a1910000-0000-4000-8000-000000000002',
    'nutrition',
    'low_protein',
    'Protéines souvent sous la cible',
    '[{"kind":"nutrition","summary":"moyenne 80 g"}]'::jsonb,
    '[]'::jsonb,
    'low',
    'open'
  );
  if v.domain <> 'nutrition' then raise exception 'coach upsert failed'; end if;
  v := public.resolve_athlete_signal(v.id, 'not_relevant', 'module nutrition désactivé plus tard');
  if v.status <> 'not_relevant' or v.resolved_at is null then raise exception 'coach resolve failed'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare
  v public.athlete_signals;
  closed_id uuid;
begin
  select id into closed_id from public.athlete_signals
    where athlete_id='a1910000-0000-4000-8000-000000000002' and type='low_protein';
  v := public.upsert_athlete_signal(
    'a1910000-0000-4000-8000-000000000002',
    'nutrition',
    'low_protein',
    'Nouveau cycle, protéines à revoir'
  );
  if v.id = closed_id then raise exception 'closed history overwritten'; end if;
  if v.status <> 'open' then raise exception 'reopen insert failed'; end if;
  if (select count(*) from public.athlete_signals where athlete_id='a1910000-0000-4000-8000-000000000002' and type='low_protein') <> 2 then
    raise exception 'history not kept';
  end if;
  v := public.resolve_athlete_signal(
    (select id from public.athlete_signals where type='missed_sessions' and status='waiting'),
    'resolved',
    'plan repris'
  );
  if v.status <> 'resolved' then raise exception 'athlete resolve failed'; end if;
end $$;
reset role;

update public.coach_client_links set status='ended'
  where coach_id='a1910000-0000-4000-8000-000000000001'
    and client_id='a1910000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.athlete_signals) then raise exception 'former coach reads signals'; end if;
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','goal','stall','Objectif à revoir'
    );
    raise exception 'former coach upsert allowed';
  exception when others then
    if sqlerrm !~* 'permission denied' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a1910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.upsert_athlete_signal(
      'a1910000-0000-4000-8000-000000000002','goal','stall','Objectif à revoir'
    );
    raise exception 'former coach upsert allowed';
  exception when others then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.upsert_athlete_signal(uuid,text,text,text,jsonb,jsonb,text,text,timestamptz)'::regprocedure);
begin
  if def ~* 'stripe' then raise exception 'stripe in upsert_athlete_signal'; end if;
  if def ~* 'program_assignments|nutrition_logs|daily_calorie_target|workouts' then
    raise exception 'upsert_athlete_signal mutates tracker data';
  end if;
end $$;

rollback;
\echo 'athlete signals: persistence, isolation, no auto-apply'
