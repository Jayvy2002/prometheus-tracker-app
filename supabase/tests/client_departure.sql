\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
('a1750000-0000-4000-8000-000000000001','departure-coach@example.test'),
('a1750000-0000-4000-8000-000000000002','departure-client@example.test'),
('a1750000-0000-4000-8000-000000000003','departure-other@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
('a1750000-0000-4000-8000-000000000001','free','coach'),
('a1750000-0000-4000-8000-000000000002','free','client')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
('a1750000-0000-4000-8000-000000000001','a1750000-0000-4000-8000-000000000002','active');

insert into public.programs(id,owner_id,name) values
('a1750000-0000-4000-8000-000000000010','a1750000-0000-4000-8000-000000000001','Departure fixture');
insert into public.program_assignments(id,program_id,client_id,assigned_by,start_date,status) values
('a1750000-0000-4000-8000-000000000011','a1750000-0000-4000-8000-000000000010','a1750000-0000-4000-8000-000000000002','a1750000-0000-4000-8000-000000000001',current_date,'active');
insert into public.workouts(id,user_id,name,date,completed,program_assignment_id) values
('a1750000-0000-4000-8000-000000000012','a1750000-0000-4000-8000-000000000002','Kept session',current_date,true,'a1750000-0000-4000-8000-000000000011');
insert into public.client_tracking_config(coach_id,client_id) values
('a1750000-0000-4000-8000-000000000001','a1750000-0000-4000-8000-000000000002');

do $$ begin
 if has_function_privilege('anon','public.client_end_coach_link()','execute') then
 raise exception 'anonymous execution allowed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000003',true);
do $$ begin
 if public.client_end_coach_link()->>'error' is distinct from 'not_linked' then
 raise exception 'unlinked user accepted'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.coach_client_links where client_id='a1750000-0000-4000-8000-000000000002' and status='active') then
 raise exception 'another users relationship changed'; end if;
end $$;

-- Fault injection proves rollback of the earlier program pause.
create function public.departure_test_fail() returns trigger language plpgsql as $$
begin
 if new.client_id='a1750000-0000-4000-8000-000000000002' and new.status='ended' then
  raise exception 'departure_injected_failure';
 end if;
 return new;
end $$;
create trigger departure_test_fail before update on public.coach_client_links
for each row execute function public.departure_test_fail();
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
  perform public.client_end_coach_link();
  raise exception 'expected injected failure';
 exception when others then
  if sqlerrm <> 'departure_injected_failure' then raise; end if;
 end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.program_assignments where id='a1750000-0000-4000-8000-000000000011' and status='active') then raise exception 'partial program pause'; end if;
 if not exists(select 1 from public.coach_client_links where client_id='a1750000-0000-4000-8000-000000000002' and status='active') then raise exception 'partial departure'; end if;
 if not exists(select 1 from public.client_tracking_config where client_id='a1750000-0000-4000-8000-000000000002') then raise exception 'partial tracking deletion'; end if;
 if exists(select 1 from public.coach_relationship_endings where client_id='a1750000-0000-4000-8000-000000000002') then raise exception 'partial departure event'; end if;
 if has_function_privilege('authenticated','public.transition_client_to_solo(uuid,uuid)','execute') then raise exception 'private helper exposed'; end if;
end $$;
drop trigger departure_test_fail on public.coach_client_links;
drop function public.departure_test_fail();

set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.client_end_coach_link()->>'ok' is distinct from 'true' then
 raise exception 'client departure failed'; end if;
 if public.client_end_coach_link()->>'error' is distinct from 'not_linked' then
 raise exception 'repeat departure incorrectly accepted'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.coach_client_links where client_id='a1750000-0000-4000-8000-000000000002' and status='ended') then
 raise exception 'link not ended'; end if;
 if not exists(select 1 from public.user_roles where user_id='a1750000-0000-4000-8000-000000000002' and coaching_role='none') then
 raise exception 'solo role not restored'; end if;
 if not exists(select 1 from public.user_profiles where id='a1750000-0000-4000-8000-000000000002' and coach_link_ended_at is not null) then
 raise exception 'profile not preserved with departure date'; end if;
end $$;

do $$ begin
 if not exists(select 1 from public.program_assignments where id='a1750000-0000-4000-8000-000000000011' and status='paused') then raise exception 'program not paused'; end if;
 if exists(select 1 from public.client_tracking_config where client_id='a1750000-0000-4000-8000-000000000002') then raise exception 'tracking not removed'; end if;
 if not exists(select 1 from public.workouts where id='a1750000-0000-4000-8000-000000000012' and completed and program_assignment_id='a1750000-0000-4000-8000-000000000011') then raise exception 'history changed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000002',true);
do $$ begin
 if not exists(select 1 from public.programs where id='a1750000-0000-4000-8000-000000000010') then raise exception 'paused program archive inaccessible'; end if;
 if not exists(select 1 from public.workouts where id='a1750000-0000-4000-8000-000000000012') then raise exception 'personal history inaccessible'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.workouts where id='a1750000-0000-4000-8000-000000000012') then raise exception 'former coach still reads history'; end if;
end $$;
reset role;


-- The client departure emits one durable notice, visible only to its recipient.
do $$ begin
 if (select count(*) from public.coach_relationship_notices where client_id='a1750000-0000-4000-8000-000000000002') <> 1 then raise exception 'notice missing or duplicated'; end if;
 if has_table_privilege('authenticated','public.coach_relationship_notices','insert') then raise exception 'notice forgery allowed'; end if;
end $$;
select set_config('test.departure_notice_id',(select id::text from public.coach_relationship_notices where client_id='a1750000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.coach_relationship_notices) then raise exception 'third party reads notices'; end if;
 if public.dismiss_coach_relationship_notice(current_setting('test.departure_notice_id')::uuid)->>'error' is distinct from 'not_found' then raise exception 'third party dismisses notice'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000001',true);
do $$ begin
 if not exists(select 1 from public.coach_relationship_notices where client_id='a1750000-0000-4000-8000-000000000002' and read_at is null) then raise exception 'recipient cannot read notice'; end if;
 if public.dismiss_coach_relationship_notice(current_setting('test.departure_notice_id')::uuid)->>'ok' is distinct from 'true' then raise exception 'dismiss failed'; end if;
 if public.dismiss_coach_relationship_notice(current_setting('test.departure_notice_id')::uuid)->>'ok' is distinct from 'true' then raise exception 'dismiss not idempotent'; end if;
 if not exists(select 1 from public.coach_relationship_notices where id=current_setting('test.departure_notice_id')::uuid and read_at is not null) then raise exception 'receipt not persisted'; end if;
end $$;
reset role;


-- Professional capability survives personal departure; coach-initiated departure uses the same transition.
update public.coach_client_links set status='active' where client_id='a1750000-0000-4000-8000-000000000002';
update public.user_roles set coaching_role='coach' where user_id='a1750000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.client_end_coach_link()->>'ok' is distinct from 'true' then raise exception 'coach personal departure failed'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.user_roles where user_id='a1750000-0000-4000-8000-000000000002' and coaching_role='coach') then raise exception 'professional capability removed'; end if;
end $$;
update public.coach_client_links set status='active' where client_id='a1750000-0000-4000-8000-000000000002';
update public.user_roles set coaching_role='client' where user_id='a1750000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.end_coach_client_link('a1750000-0000-4000-8000-000000000002')->>'ok' is distinct from 'true' then raise exception 'coach departure failed'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.user_roles where user_id='a1750000-0000-4000-8000-000000000002' and coaching_role='none') then raise exception 'coach departure did not restore solo'; end if;
 if (select count(*) from public.coach_relationship_notices where client_id='a1750000-0000-4000-8000-000000000002')<>2 then raise exception 'coach own action emitted unnecessary notice'; end if;
end $$;

-- Minimal end history remains available to participants, without dossier permissions.
do $$ begin
 if (select count(*) from public.coach_relationship_endings where client_id='a1750000-0000-4000-8000-000000000002')<>3 then raise exception 'departure history missing or duplicated'; end if;
 if (select count(*) from public.coach_relationship_endings where initiated_as='client' and initiated_by='a1750000-0000-4000-8000-000000000002')<>2 then raise exception 'client author missing'; end if;
 if (select count(*) from public.coach_relationship_endings where initiated_as='coach' and initiated_by='a1750000-0000-4000-8000-000000000001')<>1 then raise exception 'coach author missing'; end if;
 if has_table_privilege('authenticated','public.coach_relationship_endings','insert') or has_table_privilege('authenticated','public.coach_relationship_endings','update') then raise exception 'departure history forgery allowed'; end if;
 begin
  update public.program_assignments set status='active' where id='a1750000-0000-4000-8000-000000000011';
  raise exception 'expected inactive assignment rejection';
 exception when others then
  if sqlerrm <> 'Coaching relationship is no longer active' then raise; end if;
 end;
 begin
  perform public.assert_client_target('a1750000-0000-4000-8000-000000000002');
  raise exception 'expected old coach rejection';
 exception when others then
  if sqlerrm <> 'Not authorized for this client' then raise; end if;
 end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.coach_relationship_endings) then raise exception 'third party sees relationship history'; end if;
end $$;
select set_config('request.jwt.claim.sub','a1750000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.coach_relationship_endings)<>3 then raise exception 'client lost relationship history'; end if;
end $$;
reset role;

rollback;
\echo 'client departure: isolation, rollback, archives, revocation, role transition and repeat checks passed'

