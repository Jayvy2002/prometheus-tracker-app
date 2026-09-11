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
values ('a1740000-0000-4000-8000-000000000001','a1740000-0000-4000-8000-000000000099',1,'{"name":"first"}');
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
  values ('a1740000-0000-4000-8000-000000000001','a1740000-0000-4000-8000-000000000099',1,'{}');
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
 if (select count(*) from public.coach_questionnaire_versions where definition='{"name":"first"}') <> 1
 then raise exception 'snapshot not preserved'; end if;
end $$;
rollback;
\echo 'questionnaire database checks: 10 passed'
