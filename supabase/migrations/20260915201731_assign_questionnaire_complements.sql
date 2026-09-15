-- UX41: publish a questionnaire version without resetting in-progress answers.
-- Complements are explicit assignments. Snapshots stay append-only.

create unique index if not exists questionnaire_responses_client_version_uidx
  on public.client_questionnaire_responses (client_id, version_id);

create or replace function public.assign_questionnaire_complements(p_version_id uuid, p_client_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := auth.uid();
  v_qid uuid;
  v_owner uuid;
  cid uuid;
  assigned uuid[] := '{}';
  skipped jsonb := '[]'::jsonb;
  already boolean;
begin
  if v_coach is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = v_coach and r.coaching_role = 'coach'
  ) then
    raise exception 'not_coach';
  end if;
  select questionnaire_id, coach_id into v_qid, v_owner
  from public.coach_questionnaire_versions
  where id = p_version_id;
  if v_qid is null or v_owner is distinct from v_coach then
    raise exception 'version_not_found';
  end if;
  if p_client_ids is null or cardinality(p_client_ids) = 0 then
    return jsonb_build_object('ok', true, 'assigned', to_jsonb(assigned), 'skipped', skipped);
  end if;
  if cardinality(p_client_ids) > 200 then
    raise exception 'too_many_clients';
  end if;
  for cid in
    select distinct x from unnest(p_client_ids) as t(x) where x is not null order by 1
  loop
    if not exists (
      select 1 from public.coach_client_links l
      where l.coach_id = v_coach and l.client_id = cid and l.status = 'active'
      for share
    ) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'not_linked'));
      continue;
    end if;
    select exists (
      select 1 from public.client_questionnaire_responses r
      where r.client_id = cid and r.version_id = p_version_id
    ) into already;
    if already then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'already_assigned'));
      continue;
    end if;
    perform r.id from public.client_questionnaire_responses r
      join public.coach_questionnaire_versions v on v.id = r.version_id
      where r.client_id = cid
        and v.questionnaire_id = v_qid
        and r.completed_at is null
      for update of r;
    if found then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'in_progress'));
      continue;
    end if;
    insert into public.client_questionnaire_responses (invite_id, version_id, coach_id, client_id)
    values (null, p_version_id, v_coach, cid);
    assigned := array_append(assigned, cid);
  end loop;
  return jsonb_build_object('ok', true, 'assigned', to_jsonb(assigned), 'skipped', skipped);
end;
$$;

comment on function public.assign_questionnaire_complements(uuid, uuid[]) is
  'Coach assigns a published questionnaire version to selected active clients. Never resets an in-progress response.';

revoke all on function public.assign_questionnaire_complements(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.assign_questionnaire_complements(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
