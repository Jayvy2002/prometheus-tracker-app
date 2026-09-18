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

rollback;
\echo 'commercial durations: solo trial 14 days and coach grace 7 days'
