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
rollback;
\echo 'client departure: isolation, anonymous grants, role transition and repeat checks passed'
