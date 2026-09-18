\set ON_ERROR_STOP on
begin;

do $$ begin
  if public.solo_trial_interval() is distinct from interval '14 days' then
    raise exception 'solo trial interval is not 14 days';
  end if;
  if public.coach_grace_interval() is distinct from interval '7 days' then
    raise exception 'coach grace interval is not 7 days';
  end if;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.transition_client_to_solo(uuid,uuid)'::regprocedure);
begin
  if def not like '%solo_trial_interval%' then
    raise exception 'live transition_client_to_solo does not use solo_trial_interval';
  end if;
  if def like '%30 days%' then
    raise exception 'live transition still mentions 30 days';
  end if;
  if def not like '%COALESCE(solo_trial_ends_at%' then
    raise exception 'COALESCE never-shorten missing';
  end if;
  if def ~* 'stripe' then
    raise exception 'stripe mentioned in live transition_client_to_solo';
  end if;
end $$;

do $$ begin
  if has_function_privilege('anon','public.solo_trial_interval()','execute')
     or has_function_privilege('authenticated','public.solo_trial_interval()','execute') then
    raise exception 'solo_trial_interval exposed';
  end if;
  if has_function_privilege('anon','public.coach_grace_interval()','execute')
     or has_function_privilege('authenticated','public.coach_grace_interval()','execute') then
    raise exception 'coach_grace_interval exposed';
  end if;
  if has_function_privilege('authenticated','public.transition_client_to_solo(uuid,uuid)','execute') then
    raise exception 'private helper exposed';
  end if;
  if not has_function_privilege('service_role','public.solo_trial_interval()','execute') then
    raise exception 'service_role cannot execute solo_trial_interval';
  end if;
  if not has_function_privilege('service_role','public.coach_grace_interval()','execute') then
    raise exception 'service_role cannot execute coach_grace_interval';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'coach_grace_ends_at'
  ) then
    raise exception 'coach_grace_ends_at must wait for P6';
  end if;
end $$;

insert into auth.users(id,email) values
 ('a1950000-0000-4000-8000-000000000001','p15-coach@example.test'),
 ('a1950000-0000-4000-8000-000000000002','p15-athlete@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1950000-0000-4000-8000-000000000001','free','coach'),
 ('a1950000-0000-4000-8000-000000000002','free','client')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1950000-0000-4000-8000-000000000001','a1950000-0000-4000-8000-000000000002','active');

update public.user_profiles
set solo_trial_ends_at = timestamptz '2026-01-01 00:00:00+00'
where id = 'a1950000-0000-4000-8000-000000000002';

do $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  select solo_trial_ends_at into v_before
  from public.user_profiles
  where id = 'a1950000-0000-4000-8000-000000000002';
  if v_before is distinct from timestamptz '2026-01-01 00:00:00+00' then
    raise exception 'expired trial fixture missing';
  end if;
  perform public.transition_client_to_solo(
    'a1950000-0000-4000-8000-000000000001',
    'a1950000-0000-4000-8000-000000000002'
  );
  select solo_trial_ends_at into v_after
  from public.user_profiles
  where id = 'a1950000-0000-4000-8000-000000000002';
  if v_after is distinct from v_before then
    raise exception 'second coach departure rewrote expired solo trial';
  end if;
end $$;

rollback;
\echo 'commercial durations: solo trial 14 days and coach grace 7 days'
