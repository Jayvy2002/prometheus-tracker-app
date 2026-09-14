\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('c0750000-0000-4000-8000-000000000001','consent-coach@example.test'),
 ('c0750000-0000-4000-8000-000000000002','consent-client@example.test'),
 ('c0750000-0000-4000-8000-000000000003','consent-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('c0750000-0000-4000-8000-000000000001','free','coach'),
 ('c0750000-0000-4000-8000-000000000002','free','none'),
 ('c0750000-0000-4000-8000-000000000003','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_invites(id,coach_id,token,expires_at,max_uses)
values
 ('c0750000-0000-4000-8000-000000000010','c0750000-0000-4000-8000-000000000001','consent-token',now()+interval '1 hour',1),
 ('c0750000-0000-4000-8000-000000000011','c0750000-0000-4000-8000-000000000001','consent-legacy',now()+interval '1 hour',1);

do $$ begin
  if has_function_privilege('anon','public.accept_coach_invite(text,integer,text[])','execute') then
    raise exception 'anonymous 3-arg execution allowed';
  end if;
  if has_function_privilege('authenticated','public.accept_coach_invite(text)','execute') then
    raise exception 'legacy consent bypass callable';
  end if;
  if not has_function_privilege('authenticated','public.accept_coach_invite(text,integer,text[])','execute') then
    raise exception '3-arg not granted to authenticated';
  end if;
  if has_table_privilege('authenticated','public.coaching_relationship_consents','insert') then
    raise exception 'consent forgery allowed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c0750000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; begin
  result := public.accept_coach_invite('consent-token', 2, array['profile']);
  if result->>'error' is distinct from 'consent_version_required' then
    raise exception 'obsolete consent accepted';
  end if;
  result := public.accept_coach_invite('consent-token', 1, array['profile']);
  if result->>'error' is distinct from 'invalid_consent_scope' then
    raise exception 'partial scope accepted';
  end if;
  result := public.accept_coach_invite(
    'consent-token',
    1,
    array['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts']
  );
  if result->>'ok' is distinct from 'true' or result->>'consent_version' is distinct from '1' then
    raise exception 'valid consent rejected';
  end if;
  if (select count(*) from public.coaching_relationship_consents) <> 1 then
    raise exception 'client cannot read own consent';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c0750000-0000-4000-8000-000000000003',true);
do $$ declare result jsonb; begin
  if (select count(*) from public.coaching_relationship_consents) <> 0 then
    raise exception 'consent exposed to third party';
  end if;
  begin
    perform public.accept_coach_invite('consent-legacy');
    raise exception 'legacy consent bypass succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  if exists (
    select 1 from public.coach_client_links
    where client_id = 'c0750000-0000-4000-8000-000000000003' and status = 'active'
  ) then
    raise exception 'legacy accept created a link';
  end if;
  if exists (
    select 1 from public.coaching_relationship_consents
    where client_id = 'c0750000-0000-4000-8000-000000000003'
  ) then
    raise exception 'legacy accept wrote a consent row';
  end if;
end $$;

update public.coach_client_links
  set status = 'ended'
  where client_id = 'c0750000-0000-4000-8000-000000000002';
do $$ begin
  if not exists (
    select 1 from public.coaching_relationship_consents
    where client_id = 'c0750000-0000-4000-8000-000000000002' and revoked_at is not null
  ) then
    raise exception 'departure did not revoke consent';
  end if;
end $$;

rollback;
\echo 'relationship consent: version, complete scope, isolation, legacy window and revocation passed'
