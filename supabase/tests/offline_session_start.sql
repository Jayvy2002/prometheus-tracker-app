-- Vision §26 : une séance démarrée hors ligne se synchronise une seule fois.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b2600000-0000-4000-8000-000000000001','offline-athlete@example.test'),
('b2600000-0000-4000-8000-000000000002','offline-other@example.test');

do $$ begin
  if has_function_privilege('anon','public.start_workout_from_template_op(text, text, timestamptz, uuid, uuid, uuid, jsonb)','execute') then
    raise exception 'anonymous start allowed';
  end if;
  if has_function_privilege('authenticated','public.workout_start_shape(uuid)','execute') then
    raise exception 'internal shape helper exposed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000001',true);

do $$
declare
  first jsonb;
  again jsonb;
  tpl jsonb := '[{"name":"Squat","default_sets":3,"default_reps":5,"order_index":0},
                 {"name":"Leg curl","default_sets":2,"default_reps":10,"order_index":1}]'::jsonb;
begin
  first := public.start_workout_from_template_op('op-offline-1', 'Lower', '2026-09-20T09:00:00Z', null, null, null, tpl);
  if jsonb_array_length(first->'exercises') <> 2 then raise exception 'exercises not created: %', first; end if;
  if jsonb_array_length(first->'exercises'->0->'sets') <> 3 then raise exception 'squat sets: %', first; end if;
  if jsonb_array_length(first->'exercises'->1->'sets') <> 2 then raise exception 'curl sets: %', first; end if;
  if (first->'exercises'->0->>'order_index')::int <> 0 then raise exception 'order lost: %', first; end if;

  -- The response was lost: the queue replays the same op.
  again := public.start_workout_from_template_op('op-offline-1', 'Lower', '2026-09-20T09:00:00Z', null, null, null, tpl);
  if again is distinct from first then raise exception 'replay changed the session: % vs %', again, first; end if;
  if (select count(*) from public.workouts where client_op_id = 'op-offline-1') <> 1 then
    raise exception 'replay duplicated the workout';
  end if;
  if (select count(*) from public.workout_exercises e join public.workouts w on w.id = e.workout_id where w.client_op_id = 'op-offline-1') <> 2 then
    raise exception 'replay duplicated exercises';
  end if;
  -- The date is the offline start, not the sync time.
  if (select date from public.workouts where client_op_id = 'op-offline-1') <> '2026-09-20T09:00:00Z'::timestamptz then
    raise exception 'offline start date lost';
  end if;

  begin
    perform public.start_workout_from_template_op('', 'Lower', now(), null, null, null, tpl);
    raise exception 'empty op accepted';
  exception when others then
    if sqlerrm <> 'invalid_client_op_id' then raise; end if;
  end;
end $$;

-- Another account cannot claim or read someone else's op.
select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    perform public.start_workout_from_template_op('op-offline-1', 'Mine', now(), null, null, null, '[]'::jsonb);
    raise exception 'foreign op replayed';
  exception when others then
    if sqlerrm <> 'client_op_conflict' then raise; end if;
  end;
end $$;

-- Program provenance stays RPC-only: a direct insert with a program day is still refused.
select set_config('request.jwt.claim.sub','b2600000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    insert into public.workouts(user_id, name, date, program_day_id)
    values ('b2600000-0000-4000-8000-000000000001', 'forged', now(), gen_random_uuid());
    raise exception 'direct program provenance accepted';
  exception when others then
    if sqlerrm not like '%program provenance is RPC-only%' and sqlerrm not like '%foreign key%' then raise; end if;
  end;
end $$;
reset role;

rollback;
\echo 'offline session start: idempotent replay, offline date kept, foreign op refused, provenance RPC-only'
