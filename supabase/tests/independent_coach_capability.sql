\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a1880000-0000-4000-8000-000000000001','p11-coach@example.test'),
 ('a1880000-0000-4000-8000-000000000002','p11-dual@example.test'),
 ('a1880000-0000-4000-8000-000000000003','p11-client@example.test'),
 ('a1880000-0000-4000-8000-000000000004','p11-other@example.test');
update public.user_roles set coaching_role='coach' where user_id='a1880000-0000-4000-8000-000000000001';
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1880000-0000-4000-8000-000000000001','a1880000-0000-4000-8000-000000000002','active');
update public.user_roles set coaching_role='client' where user_id='a1880000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1880000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1880000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare ctx jsonb; begin
 ctx := public.get_my_account_context();
 if (ctx->>'coach_capability')::boolean or ctx->>'active_coach_id' is null then raise exception 'expected Coached without Coach'; end if;
 ctx := public.set_coach_capability(true);
 if not (ctx->>'coach_capability')::boolean or ctx->>'active_coach_id' is null then raise exception 'Coached cannot enable Coach'; end if;
 if public.is_self_coach() then raise exception 'Coach+Coached can override personal plan'; end if;
 ctx := public.set_coach_capability(false);
 if (ctx->>'coach_capability')::boolean or ctx->>'active_coach_id' is null then raise exception 'disable ended personal relationship'; end if;
 perform public.set_coach_capability(true);
 if (select count(*) from public.user_capabilities) <> 1 then raise exception 'capability SELECT leaked'; end if;
 if has_function_privilege('anon','public.set_coach_capability(boolean)','execute') then raise exception 'anon can enable'; end if;
 if has_table_privilege('authenticated','public.user_capabilities','insert') then raise exception 'direct capability forgery'; end if;
 begin
   perform public.set_coach_capability(null);
   raise exception 'null accepted';
 exception when others then if sqlerrm <> 'invalid_capability' then raise; end if; end;
end $$;
reset role;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1880000-0000-4000-8000-000000000002','a1880000-0000-4000-8000-000000000003','active');
-- Prove professional authorization ignores the compatibility field.
update public.user_roles set coaching_role='client' where user_id='a1880000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1880000-0000-4000-8000-000000000002',true);
do $$ declare ctx jsonb; result jsonb; begin
 perform public.triage_coach_fleet();
 begin
   perform public.triage_coach_fleet('a1880000-0000-4000-8000-000000000001');
   raise exception 'foreign fleet leaked';
 exception when others then if sqlerrm <> 'Not this coach' then raise; end if; end;
 begin
   perform public.set_coach_capability(false);
   raise exception 'orphan roster allowed';
 exception when others then if sqlerrm <> 'coach_has_active_clients' then raise; end if; end;
 result := public.client_end_coach_link();
 if result->>'ok' is distinct from 'true' then raise exception 'departure failed: %',result; end if;
 ctx := public.get_my_account_context();
 if not (ctx->>'coach_capability')::boolean or ctx->>'active_coach_id' is not null then raise exception 'departure lost capability'; end if;
 if not public.is_self_coach() then raise exception 'Coach+Solo personal tools denied'; end if;
 if not public.is_coach_of('a1880000-0000-4000-8000-000000000003') then raise exception 'departure lost roster'; end if;
 if public.is_coach_of(auth.uid()) then raise exception 'self added to roster'; end if;
 perform public.triage_coach_fleet();
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1880000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1880000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.is_coach_of('a1880000-0000-4000-8000-000000000002') then raise exception 'former coach kept access'; end if;
 if exists(select 1 from public.user_profiles where id='a1880000-0000-4000-8000-000000000002') then raise exception 'former coach reads profile'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1880000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a1880000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare ctx jsonb; begin
 ctx := public.get_my_account_context();
 if (ctx->>'coach_capability')::boolean or ctx->>'active_coach_id' is not null then raise exception 'Solo state wrong'; end if;
 if not public.is_self_coach() then raise exception 'Solo denied'; end if;
 if exists(select 1 from public.coach_client_links) then raise exception 'stranger reads relationships'; end if;
 begin
  perform public.triage_coach_fleet(); raise exception 'Solo accesses fleet';
 exception when others then if sqlerrm <> 'not_coach' then raise; end if; end;
end $$;
rollback;
\echo 'P1.1: four combinations, activation, revocation, roster, departure and isolation passed'
