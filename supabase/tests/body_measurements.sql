-- Vision §14.4 : mensurations de l'athlète, lues par son Coach actif, jamais écrites par lui.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b3300000-0000-4000-8000-000000000001','meas-athlete@example.test'),
('b3300000-0000-4000-8000-000000000002','meas-coach@example.test'),
('b3300000-0000-4000-8000-000000000003','meas-other@example.test');
insert into public.user_roles(user_id, role, coaching_role) values
('b3300000-0000-4000-8000-000000000001','free','none'),
('b3300000-0000-4000-8000-000000000002','free','coach'),
('b3300000-0000-4000-8000-000000000003','free','coach')
on conflict (user_id) do update set coaching_role = excluded.coaching_role;
insert into public.coach_client_links (coach_id, client_id, status)
values ('b3300000-0000-4000-8000-000000000002','b3300000-0000-4000-8000-000000000001','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','b3300000-0000-4000-8000-000000000001',true);
insert into public.body_measurements (user_id, measured_at, site, value_cm) values
('b3300000-0000-4000-8000-000000000001', '2026-09-01', 'waist', 84.5),
('b3300000-0000-4000-8000-000000000001', '2026-09-22', 'waist', 82.0);
do $$ begin
  -- One value per site per day: a correction is an update, not a second row.
  begin
    insert into public.body_measurements (user_id, measured_at, site, value_cm)
    values ('b3300000-0000-4000-8000-000000000001', '2026-09-22', 'waist', 81.0);
    raise exception 'duplicate site/day accepted';
  exception when unique_violation then null;
  end;
  update public.body_measurements set value_cm = 81.5 where measured_at = '2026-09-22' and site = 'waist';
  begin
    insert into public.body_measurements (user_id, measured_at, site, value_cm)
    values ('b3300000-0000-4000-8000-000000000001', '2026-09-22', 'beauty', 50);
    raise exception 'unknown site accepted';
  exception when check_violation then null;
  end;
end $$;

-- The active coach reads, cannot write; another coach sees nothing.
select set_config('request.jwt.claim.sub','b3300000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.body_measurements where user_id = 'b3300000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'coach cannot read';
  end if;
  begin
    insert into public.body_measurements (user_id, measured_at, site, value_cm)
    values ('b3300000-0000-4000-8000-000000000001', '2026-09-23', 'hips', 95);
    raise exception 'coach wrote athlete data';
  exception when insufficient_privilege then null;
  end;
  update public.body_measurements set value_cm = 70 where user_id = 'b3300000-0000-4000-8000-000000000001';
  if (select min(value_cm) from public.body_measurements where user_id = 'b3300000-0000-4000-8000-000000000001') <> 81.5 then
    raise exception 'coach changed athlete data';
  end if;
end $$;
select set_config('request.jwt.claim.sub','b3300000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists (select 1 from public.body_measurements where user_id = 'b3300000-0000-4000-8000-000000000001') then
    raise exception 'another coach sees measurements';
  end if;
end $$;
reset role;

rollback;
\echo 'body measurements: athlete writes and corrects, one value per site and day, active coach reads only, others blind'
