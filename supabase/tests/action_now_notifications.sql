-- Vision §21 : notifications « action maintenant », regroupées, réglables, serveur seul.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b2800000-0000-4000-8000-000000000001','notif-coach@example.test'),
('b2800000-0000-4000-8000-000000000002','notif-client@example.test'),
('b2800000-0000-4000-8000-000000000003','notif-prospect@example.test');
insert into public.user_profiles(id, email, full_name, language) values
('b2800000-0000-4000-8000-000000000001','notif-coach@example.test','Coach Marie','fr'),
('b2800000-0000-4000-8000-000000000002','notif-client@example.test','Lucas','en'),
('b2800000-0000-4000-8000-000000000003','notif-prospect@example.test','Prospect','fr')
on conflict (id) do update set full_name = excluded.full_name, language = excluded.language;
insert into public.user_roles(user_id, role, coaching_role) values
('b2800000-0000-4000-8000-000000000001','free','coach'),
('b2800000-0000-4000-8000-000000000002','free','none'),
('b2800000-0000-4000-8000-000000000003','free','none')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;
insert into public.coach_client_links (coach_id, client_id, status)
values ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','active');

-- Clients can neither read the queue nor drive it.
do $$ begin
  if has_table_privilege('authenticated', 'public.notification_outbox', 'select') then raise exception 'outbox readable by clients'; end if;
  if has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'execute') then raise exception 'claim exposed'; end if;
  if has_function_privilege('authenticated', 'public.enqueue_notification(uuid, text, text, text, jsonb, text, interval)', 'execute') then raise exception 'enqueue exposed'; end if;
end $$;

do $$
declare
  r record;
begin
  -- Three messages from the coach: one waiting notification « 3 messages », no content.
  insert into public.coach_messages (coach_id, client_id, sender_id, body) values
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000001','private body one'),
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000001','private body two'),
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000001','private body three');
  select * into r from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000002' and category = 'messages';
  if r.item_count <> 3 or r.kind <> 'coach_message' or r.url <> '/messages' then raise exception 'coach burst not grouped: %', row_to_json(r); end if;
  if r.payload->>'name' <> 'Coach Marie' then raise exception 'sender name missing: %', r.payload; end if;
  if r.payload::text like '%private body%' then raise exception 'message content leaked into the queue'; end if;
  if r.send_after <= now() then raise exception 'burst window missing'; end if;

  -- The athlete answers: the coach is told, with a link to that thread.
  insert into public.coach_messages (coach_id, client_id, sender_id, body) values
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000002','reply');
  if not exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000001'
                 and kind = 'client_message' and url = '/messages/b2800000-0000-4000-8000-000000000002') then
    raise exception 'coach not told of the reply';
  end if;

  -- Marketplace: request → coach ; coach accepts → athlete must confirm ; athlete confirms → coach.
  insert into public.coach_join_requests (id, coach_id, client_id, public_name, summary, sharing_version, client_request_id, status)
  values ('b2800000-0000-4000-8000-000000000031','b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000003',
          'Prospect P.','Wants to run a marathon',2,'b2800000-0000-4000-8000-000000000032','pending');
  if not exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000001' and kind = 'coaching_request') then
    raise exception 'coach not told of the request';
  end if;
  update public.coach_join_requests set status = 'coach_accepted' where id = 'b2800000-0000-4000-8000-000000000031';
  if not exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000003'
                 and kind = 'coach_accepted' and payload->>'name' = 'Coach Marie') then
    raise exception 'athlete not asked to confirm';
  end if;
  update public.coach_join_requests set status = 'athlete_confirmed' where id = 'b2800000-0000-4000-8000-000000000031';
  if not exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000001' and kind = 'athlete_confirmed') then
    raise exception 'coach not told of the confirmation';
  end if;

  -- Fleet proposals are grouped for the coach; the coach's own drafts are not news.
  insert into public.coach_interventions (coach_id, client_id, kind, title, rationale, status, source) values
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','other','A','why','pending','fleet'),
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000003','other','B','why','pending','fleet'),
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','other','C','why','pending','coach');
  if (select item_count from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000001' and kind = 'proposals_waiting') <> 2 then
    raise exception 'fleet proposals not grouped (or coach draft counted)';
  end if;
end $$;

-- A coach's program reaches the athlete; a plan the athlete gives themself does not notify.
do $$
declare
  v_program uuid;
begin
  insert into public.programs (owner_id, name, description, duration_weeks)
  values ('b2800000-0000-4000-8000-000000000001', 'Base block', '', 4) returning id into v_program;
  insert into public.program_assignments (program_id, client_id, assigned_by, start_date, status)
  values (v_program, 'b2800000-0000-4000-8000-000000000002', 'b2800000-0000-4000-8000-000000000001', current_date, 'active');
  if not exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000002'
                 and kind = 'program_assigned' and payload->>'program' = 'Base block') then
    raise exception 'athlete not told of the new program';
  end if;
end $$;

-- Delivery: due rows are claimed once; a muted category is closed, never sent.
update public.notification_outbox set send_after = now() - interval '1 minute';
update public.user_profiles set notification_categories = '{"messages": false}'
 where id = 'b2800000-0000-4000-8000-000000000002';

do $$
declare
  v_claimed int;
  v_again int;
  v_lang text;
begin
  select count(*) into v_claimed from public.claim_notification_batch(100);
  if exists (select 1 from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000002'
             and category = 'messages' and (outcome is distinct from 'muted' or sent_at is null)) then
    raise exception 'muted category was not closed as muted';
  end if;
  if v_claimed <> (select count(*) from public.notification_outbox where claimed_at is not null and sent_at is null) then
    raise exception 'claim count mismatch';
  end if;
  select count(*) into v_again from public.claim_notification_batch(100);
  if v_again <> 0 then raise exception 'rows claimed twice: %', v_again; end if;
  -- A new message while the previous one is being sent starts a new notification.
  insert into public.coach_messages (coach_id, client_id, sender_id, body) values
  ('b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000002','again');
  if (select count(*) from public.notification_outbox where user_id = 'b2800000-0000-4000-8000-000000000001'
      and kind = 'client_message') <> 2 then
    raise exception 'new message merged into a notification already being sent';
  end if;
end $$;

-- A notification a day late is closed as expired, never sent late.
do $$
declare
  v_old uuid;
begin
  insert into public.notification_outbox (user_id, category, kind, dedupe_key, url, send_after)
  values ('b2800000-0000-4000-8000-000000000003', 'program', 'program_assigned', 'late-one', '/programs', now() - interval '2 days')
  returning id into v_old;
  perform public.claim_notification_batch(100);
  if (select outcome from public.notification_outbox where id = v_old) is distinct from 'expired' then
    raise exception 'stale notification not expired';
  end if;
end $$;

-- Bad preference shapes are refused.
do $$ begin
  begin
    update public.user_profiles set notification_categories = '{"marketing": true}' where id = 'b2800000-0000-4000-8000-000000000002';
    raise exception 'unknown category accepted';
  exception when check_violation then null;
  end;
end $$;

rollback;
\echo 'action-now notifications: grouped, no content, marketplace and program events, muted closed, stale expired, claimed once, server only'
