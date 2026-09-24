-- Vision §11.2 / §21 : le check-in dû suit la fréquence ; une seule notification, le jour même.
\set ON_ERROR_STOP on
begin;

-- Same cases as src/features/checkins/domain/checkinSchedule.test.ts (2026-09-21 is a Monday).
do $$ begin
  if public.checkin_last_due('weekly', 1::smallint, '2026-09-17', '2026-09-20') is not null then raise exception 'weekly before first'; end if;
  if public.checkin_last_due('weekly', 1::smallint, '2026-09-17', '2026-09-23') <> '2026-09-21' then raise exception 'weekly last'; end if;
  if public.checkin_last_due('biweekly', 1::smallint, '2026-09-21', '2026-09-30') <> '2026-09-21' then raise exception 'biweekly 1'; end if;
  if public.checkin_last_due('biweekly', 1::smallint, '2026-09-21', '2026-10-05') <> '2026-10-05' then raise exception 'biweekly 2'; end if;
  if public.checkin_last_due('monthly', null, '2026-01-31', '2026-02-28') <> '2026-02-28' then raise exception 'monthly short month'; end if;
  if public.checkin_last_due('monthly', null, '2026-01-31', '2026-03-15') <> '2026-02-28' then raise exception 'monthly previous'; end if;
  if public.checkin_last_due('daily', null, '2026-09-01', '2026-09-23') <> '2026-09-23' then raise exception 'daily'; end if;
end $$;

insert into auth.users(id,email) values
('b3200000-0000-4000-8000-000000000001','due-solo@example.test'),
('b3200000-0000-4000-8000-000000000002','due-off@example.test'),
('b3200000-0000-4000-8000-000000000003','due-default@example.test');
insert into public.user_profiles(id, email, timezone, personal_modules) values
('b3200000-0000-4000-8000-000000000001','due-solo@example.test','Europe/Paris', null),
('b3200000-0000-4000-8000-000000000002','due-off@example.test','Europe/Paris', '{"checkins": false}'),
('b3200000-0000-4000-8000-000000000003','due-default@example.test','Europe/Paris', null)
on conflict (id) do update set timezone = excluded.timezone, personal_modules = excluded.personal_modules;
-- Weekly on Monday for the first two; the third has no plan (implicit daily: never chased).
insert into public.checkin_plans (user_id, frequency, weekday, anchor_date) values
('b3200000-0000-4000-8000-000000000001','weekly',1,'2026-09-01'),
('b3200000-0000-4000-8000-000000000002','weekly',1,'2026-09-01');

do $$
declare
  v_n integer;
begin
  -- Monday 2026-09-21, 07:30 in Paris: too early.
  v_n := public.enqueue_due_checkins('2026-09-21 05:30+00');
  if v_n <> 0 then raise exception 'notified before 9:00 local'; end if;
  -- 10:00 in Paris: the Solo who follows check-ins is told once; the one who turned the module off is not.
  v_n := public.enqueue_due_checkins('2026-09-21 08:00+00');
  if v_n <> 1 then raise exception 'expected one due notification, got %', v_n; end if;
  if not exists (select 1 from public.notification_outbox where user_id = 'b3200000-0000-4000-8000-000000000001' and kind = 'checkin_due' and category = 'checkins') then
    raise exception 'due notification missing';
  end if;
  -- Later the same day: not twice, even once sent.
  update public.notification_outbox set sent_at = now(), outcome = 'delivered' where kind = 'checkin_due';
  v_n := public.enqueue_due_checkins('2026-09-21 15:00+00');
  if v_n <> 0 then raise exception 'notified twice for the same due date'; end if;
  -- The day after: no chasing.
  v_n := public.enqueue_due_checkins('2026-09-22 08:00+00');
  if v_n <> 0 then raise exception 'chased the day after'; end if;
  -- Next Monday, already checked in since Sunday? Still due (Sunday is before Monday).
  insert into public.daily_checkins (user_id, checked_at) values ('b3200000-0000-4000-8000-000000000001', '2026-09-27');
  v_n := public.enqueue_due_checkins('2026-09-28 08:00+00');
  if v_n <> 1 then raise exception 'a check-in before the due date should not cancel it'; end if;
  -- Checked in on the due day before 9:00: nothing to say.
  insert into public.daily_checkins (user_id, checked_at) values ('b3200000-0000-4000-8000-000000000001', '2026-10-05');
  v_n := public.enqueue_due_checkins('2026-10-05 08:00+00');
  if v_n <> 0 then raise exception 'notified although already checked in'; end if;
end $$;

-- The category can be turned off like any other.
do $$ begin
  update public.user_profiles set notification_categories = '{"checkins": false}' where id = 'b3200000-0000-4000-8000-000000000001';
  begin
    update public.user_profiles set notification_categories = '{"streaks": false}' where id = 'b3200000-0000-4000-8000-000000000001';
    raise exception 'unknown category accepted';
  exception when check_violation then null;
  end;
end $$;
do $$ begin
  if has_function_privilege('authenticated', 'public.enqueue_due_checkins(timestamptz)', 'execute') then
    raise exception 'enqueue_due_checkins exposed';
  end if;
end $$;

rollback;
\echo 'checkin due: same schedule as the app, once on the due day from 9:00, module off or no plan never chased, category settable'
