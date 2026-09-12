-- Candidate for isolated replay. Promote with `supabase migration new client_end_coach_link` only after CI.
-- Lets the authenticated athlete end their active coaching relationship atomically.
create or replace function public.client_end_coach_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coach_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coach_id into v_coach_id
  from public.coach_client_links
  where client_id = v_uid and status = 'active'
  for update;

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  if v_coach_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'cannot_end_self');
  end if;

  update public.program_assignments
  set status = 'paused', updated_at = now()
  where client_id = v_uid
    and assigned_by = v_coach_id
    and status = 'active';

  update public.coach_client_links
  set status = 'ended', updated_at = now()
  where coach_id = v_coach_id
    and client_id = v_uid
    and status = 'active';

  update public.user_roles
  set coaching_role = 'none', updated_at = now()
  where user_id = v_uid
    and coaching_role = 'client';

  delete from public.client_tracking_config
  where client_id = v_uid
    and coach_id = v_coach_id;

  update public.user_profiles
  set coach_link_ended_at = now(),
      solo_trial_ends_at = coalesce(solo_trial_ends_at, now() + interval '30 days'),
      updated_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true, 'former_coach_id', v_coach_id);
end;
$$;

revoke all on function public.client_end_coach_link() from public, anon;
grant execute on function public.client_end_coach_link() to authenticated;
