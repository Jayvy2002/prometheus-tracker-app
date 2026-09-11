\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
 ('a1740000-0000-4000-8000-000000000001','questionnaire-a@example.test'),
 ('a1740000-0000-4000-8000-000000000002','questionnaire-b@example.test'),
 ('a1740000-0000-4000-8000-000000000003','questionnaire-client@example.test');
insert into public.user_roles(user_id, role, coaching_role) values
 ('a1740000-0000-4000-8000-000000000001','free','coach'),
 ('a1740000-0000-4000-8000-000000000002','free','coach'),
 ('a1740000-0000-4000-8000-000000000003','free','client')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000001',true);
insert into public.coach_questionnaire_versions(coach_id, questionnaire_id,version,definition)
values ('a1740000-0000-4000-8000-000000000001','a1740000-0000-4000-8000-000000000099',1,'{"schemaVersion":1,"id":"a1740000-0000-4000-8000-000000000099","coachId":"a1740000-0000-4000-8000-000000000001","version":1,"name":{"fr":"Préférences","en":"Preferences"},"sections":[{"id":"preferences","label":{"fr":"Préférences","en":"Preferences"},"questions":[{"id":"custom_contact","type":"text","label":{"fr":"Contact","en":"Contact"},"required":true,"medical":false}]}]}');
do $$ begin
 if (select count(*) from public.coach_questionnaire_versions) <> 1 then raise exception 'owner read failed'; end if;
 begin
  insert into public.coach_questionnaire_versions(coach_id,questionnaire_id,version,definition)
  values ('a1740000-0000-4000-8000-000000000002','a1740000-0000-4000-8000-000000000099',1,'{}');
  raise exception 'cross-owner insert allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.coach_questionnaire_versions(coach_id,questionnaire_id,version,definition)
  values ('a1740000-0000-4000-8000-000000000001','a1740000-0000-4000-8000-000000000099',1,'{"schemaVersion":1,"id":"a1740000-0000-4000-8000-000000000099","coachId":"a1740000-0000-4000-8000-000000000001","version":1,"name":{"fr":"Préférences","en":"Preferences"},"sections":[{"id":"preferences","label":{"fr":"Préférences","en":"Preferences"},"questions":[{"id":"custom_contact","type":"text","label":{"fr":"Contact","en":"Contact"},"required":true,"medical":false}]}]}');
  raise exception 'duplicate version allowed';
 exception when unique_violation then null;
 end;
 begin
  update public.coach_questionnaire_versions set definition='{}';
  raise exception 'snapshot update allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.coach_questionnaire_versions;
  raise exception 'snapshot delete allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.coach_questionnaire_versions) then raise exception 'cross-coach read allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.coach_questionnaire_versions) then raise exception 'unassigned client read allowed'; end if;
 begin
  insert into public.coach_questionnaire_versions(coach_id,questionnaire_id,version,definition)
  values ('a1740000-0000-4000-8000-000000000003','a1740000-0000-4000-8000-000000000099',1,'{}');
  raise exception 'client created coach questionnaire';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform 1 from public.coach_questionnaire_versions;
  raise exception 'anonymous read allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.coach_questionnaire_versions where definition='{"schemaVersion":1,"id":"a1740000-0000-4000-8000-000000000099","coachId":"a1740000-0000-4000-8000-000000000001","version":1,"name":{"fr":"Préférences","en":"Preferences"},"sections":[{"id":"preferences","label":{"fr":"Préférences","en":"Preferences"},"questions":[{"id":"custom_contact","type":"text","label":{"fr":"Contact","en":"Contact"},"required":true,"medical":false}]}]}') <> 1
 then raise exception 'snapshot not preserved'; end if;
end $$;

-- End-to-end invitation pins a version, draft save, finalize and isolation.
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.coach_questionnaire_defaults(coach_id,version_id)
select coach_id,id from public.coach_questionnaire_versions where version=1;
insert into public.coach_invites(id,coach_id,token,expires_at,max_uses)
values('a1740000-0000-4000-8000-000000000088','a1740000-0000-4000-8000-000000000001','questionnaire-ci-only',now()+interval '1 day',1);
delete from public.coach_questionnaire_defaults;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000003',true);
select public.accept_coach_invite('questionnaire-ci-only');
do $
declare r public.client_questionnaire_responses; saved public.client_questionnaire_responses;
begin
 select * into strict r from public.client_questionnaire_responses;
 if not exists(select 1 from public.coach_questionnaire_versions where id=r.version_id) then raise exception 'assigned definition unreadable'; end if;
 if r.revision<>0 then raise exception 'initial revision'; end if;
 saved:=public.save_questionnaire_response(r.id,0,'{"custom_contact":"morning"}',false);
 if saved.revision<>1 or saved.completed_at is not null then raise exception 'draft save failed'; end if;
 begin
  perform public.save_questionnaire_response(r.id,0,'{}',false);
  raise exception 'stale revision accepted';
 exception when raise_exception then
  if SQLERRM<>'response_conflict' then raise; end if;
 end;
 begin
  perform public.save_questionnaire_response(r.id,1,'{}',true);
  raise exception 'missing required accepted';
 exception when raise_exception then
  if SQLERRM<>'required_answer' then raise; end if;
 end;
 saved:=public.save_questionnaire_response(r.id,1,'{"custom_contact":"morning"}',true);
 if saved.revision<>2 or saved.completed_at is null then raise exception 'finalize failed'; end if;
 begin
  perform public.save_questionnaire_response(r.id,2,'{}',false);
  raise exception 'finalized answer changed';
 exception when raise_exception then
  if SQLERRM<>'response_conflict' then raise; end if;
 end;
end $;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000002',true);
do $ begin
 if exists(select 1 from public.client_questionnaire_responses) then raise exception 'cross coach responses visible'; end if;
end $;
select set_config('request.jwt.claim.sub','a1740000-0000-4000-8000-000000000001',true);
do $ begin
 if (select count(*) from public.client_questionnaire_responses where completed_at is not null)<>1 then raise exception 'coach missing completed response'; end if;
end $;
reset role;

rollback;
\echo 'questionnaire database checks: storage and invitation lifecycle passed'
