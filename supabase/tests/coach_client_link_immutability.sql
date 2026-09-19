-- Hotfix A — identity of coach_client_links cannot be rewritten by Data API users.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a2010000-0000-4000-8000-000000000001','link-immut-coach@example.test'),
 ('a2010000-0000-4000-8000-000000000002','link-immut-client-b@example.test'),
 ('a2010000-0000-4000-8000-000000000003','link-immut-victim-c@example.test'),
 ('a2010000-0000-4000-8000-000000000004','link-immut-stranger@example.test'),
 ('a2010000-0000-4000-8000-000000000005','link-immut-dual@example.test'),
 ('a2010000-0000-4000-8000-000000000006','link-immut-dual-client@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a2010000-0000-4000-8000-000000000001','free','coach'),
 ('a2010000-0000-4000-8000-000000000002','free','client'),
 ('a2010000-0000-4000-8000-000000000003','free','none'),
 ('a2010000-0000-4000-8000-000000000004','free','none'),
 ('a2010000-0000-4000-8000-000000000005','free','coach'),
 ('a2010000-0000-4000-8000-000000000006','free','client')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.user_capabilities(user_id, capability) values
 ('a2010000-0000-4000-8000-000000000001','coach'),
 ('a2010000-0000-4000-8000-000000000005','coach')
on conflict do nothing;
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a2010000-0000-4000-8000-000000000001','a2010000-0000-4000-8000-000000000002','active'),
 ('a2010000-0000-4000-8000-000000000005','a2010000-0000-4000-8000-000000000006','active');

do $$ begin
  if has_table_privilege('authenticated','public.coach_client_links','insert') then
    raise exception 'authenticated insert grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','delete') then
    raise exception 'authenticated delete grant still open';
  end if;
  if has_table_privilege('anon','public.coach_client_links','update') then
    raise exception 'anon update grant still open';
  end if;
  if has_column_privilege('authenticated','public.coach_client_links','client_id','update') then
    raise exception 'authenticated can update client_id';
  end if;
  if has_column_privilege('authenticated','public.coach_client_links','coach_id','update') then
    raise exception 'authenticated can update coach_id';
  end if;
  if has_column_privilege('authenticated','public.coach_client_links','status','update') then
    raise exception 'authenticated can update status';
  end if;
  if not has_column_privilege('authenticated','public.coach_client_links','last_visited_at','update') then
    raise exception 'coach visit bookkeeping revoked';
  end if;
  if not has_column_privilege('authenticated','public.coach_client_links','last_nudged_at','update') then
    raise exception 'coach nudge bookkeeping revoked';
  end if;
end $$;

do $$ begin
  begin
    update public.coach_client_links
       set client_id = 'a2010000-0000-4000-8000-000000000003'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'owner retargeted client_id';
  exception when others then
    if sqlerrm <> 'coach_client_link_identity_immutable' then raise; end if;
  end;
  begin
    update public.coach_client_links
       set coach_id = 'a2010000-0000-4000-8000-000000000005'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'owner retargeted coach_id';
  exception when others then
    if sqlerrm <> 'coach_client_link_identity_immutable' then raise; end if;
  end;
  if not exists (
    select 1 from public.coach_client_links
    where coach_id = 'a2010000-0000-4000-8000-000000000001'
      and client_id = 'a2010000-0000-4000-8000-000000000002'
      and status = 'active'
  ) then
    raise exception 'owner identity probe mutated A-B';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  begin
    update public.coach_client_links
       set client_id = 'a2010000-0000-4000-8000-000000000003'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'coach retargeted client_id without error';
  exception when others then
    if sqlerrm = 'coach retargeted client_id without error' then raise; end if;
  end;
  begin
    update public.coach_client_links
       set coach_id = 'a2010000-0000-4000-8000-000000000005'
     where client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'coach retargeted coach_id without error';
  exception when others then
    if sqlerrm = 'coach retargeted coach_id without error' then raise; end if;
  end;
  begin
    update public.coach_client_links
       set status = 'ended'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'coach ended link via Data API';
  exception when others then
    if sqlerrm = 'coach ended link via Data API' then raise; end if;
  end;
  begin
    insert into public.coach_client_links(coach_id,client_id,status)
    values ('a2010000-0000-4000-8000-000000000001','a2010000-0000-4000-8000-000000000003','active');
    raise exception 'coach inserted a link via Data API';
  exception when others then
    if sqlerrm = 'coach inserted a link via Data API' then raise; end if;
  end;
  update public.coach_client_links
     set last_visited_at = '2026-09-19T12:00:00Z', updated_at = '2026-09-19T12:00:00Z'
   where coach_id = 'a2010000-0000-4000-8000-000000000001'
     and client_id = 'a2010000-0000-4000-8000-000000000002'
     and status = 'active';
  if not found then
    raise exception 'active coach could not update last_visited_at';
  end if;
  if not public.is_coach_of('a2010000-0000-4000-8000-000000000002') then
    raise exception 'active coach lost B';
  end if;
  if public.is_coach_of('a2010000-0000-4000-8000-000000000003') then
    raise exception 'active coach gained C';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  update public.coach_client_links
     set last_visited_at = now()
   where client_id = 'a2010000-0000-4000-8000-000000000002';
  if found then raise exception 'client updated own link bookkeeping'; end if;
  begin
    update public.coach_client_links
       set client_id = 'a2010000-0000-4000-8000-000000000003'
     where client_id = 'a2010000-0000-4000-8000-000000000002';
    if found then raise exception 'client retargeted identity'; end if;
  exception when others then
    if sqlerrm = 'client retargeted identity' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  update public.coach_client_links set last_visited_at = now();
  if found then raise exception 'stranger updated a link'; end if;
  if exists(select 1 from public.coach_client_links) then
    raise exception 'stranger reads relationships';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
  update public.coach_client_links
     set last_visited_at = now()
   where coach_id = 'a2010000-0000-4000-8000-000000000001';
  if found then raise exception 'other coach updated A-B'; end if;
  begin
    update public.coach_client_links
       set client_id = 'a2010000-0000-4000-8000-000000000003'
     where coach_id = 'a2010000-0000-4000-8000-000000000005'
       and client_id = 'a2010000-0000-4000-8000-000000000006';
    raise exception 'dual coach retargeted roster';
  exception when others then
    if sqlerrm = 'dual coach retargeted roster' then raise; end if;
  end;
  if not public.is_coach_of('a2010000-0000-4000-8000-000000000006') then
    raise exception 'dual coach lost own roster';
  end if;
  if public.is_coach_of('a2010000-0000-4000-8000-000000000002') then
    raise exception 'dual coach gained B';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

do $$ begin
  begin
    insert into public.coach_client_links(coach_id,client_id,status)
    values ('a2010000-0000-4000-8000-000000000005','a2010000-0000-4000-8000-000000000002','active');
    raise exception 'second active coach inserted as owner without unique guard';
  exception when unique_violation then
    null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
  begin
    insert into public.coach_client_links(coach_id,client_id,status)
    values ('a2010000-0000-4000-8000-000000000005','a2010000-0000-4000-8000-000000000002','active');
    raise exception 'second active coach inserted as authenticated';
  exception when others then
    if sqlerrm = 'second active coach inserted as authenticated' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.end_coach_client_link('a2010000-0000-4000-8000-000000000002');
  if result->>'ok' is distinct from 'true' then
    raise exception 'end_coach_client_link failed: %', result;
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

do $$ begin
  if exists (
    select 1 from public.coach_client_links
    where coach_id = 'a2010000-0000-4000-8000-000000000001'
      and client_id = 'a2010000-0000-4000-8000-000000000002'
      and status = 'active'
  ) then
    raise exception 'RPC did not end the link';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  update public.coach_client_links
     set last_visited_at = now()
   where coach_id = 'a2010000-0000-4000-8000-000000000001'
     and client_id = 'a2010000-0000-4000-8000-000000000002';
  if found then raise exception 'former coach updated ended link'; end if;
  begin
    update public.coach_client_links
       set status = 'active'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'former coach resurrected via Data API';
  exception when others then
    if sqlerrm = 'former coach resurrected via Data API' then raise; end if;
  end;
  if public.is_coach_of('a2010000-0000-4000-8000-000000000002') then
    raise exception 'former coach kept is_coach_of(B)';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

do $$ begin
  perform public.activate_coaching_relationship(
    'a2010000-0000-4000-8000-000000000001',
    'a2010000-0000-4000-8000-000000000002'
  );
end $$;
do $$ begin
  if not exists (
    select 1 from public.coach_client_links
    where coach_id = 'a2010000-0000-4000-8000-000000000001'
      and client_id = 'a2010000-0000-4000-8000-000000000002'
      and status = 'active'
  ) then
    raise exception 'activate_coaching_relationship did not revive the same pair';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a2010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare result jsonb; begin
  result := public.client_end_coach_link();
  if result->>'ok' is distinct from 'true' then
    raise exception 'client_end_coach_link failed: %', result;
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','',true);

do $$ begin
  if exists (
    select 1 from public.coach_client_links
    where client_id = 'a2010000-0000-4000-8000-000000000002'
      and status = 'active'
  ) then
    raise exception 'client RPC did not end the link';
  end if;
  if not exists (
    select 1 from public.coach_client_links
    where coach_id = 'a2010000-0000-4000-8000-000000000005'
      and client_id = 'a2010000-0000-4000-8000-000000000006'
      and status = 'active'
  ) then
    raise exception 'unrelated dual roster was damaged';
  end if;
end $$;

\echo 'coach_client_links: identity immutable, status RPC-only, bookkeeping and métier RPCs still work'
rollback;
