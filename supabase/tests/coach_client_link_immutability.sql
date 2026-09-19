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

do $$
declare
  v_auth text[];
  v_anon text[];
  v_public text[];
  v_cols text[];
  v_forbidden text;
begin
  select coalesce(array_agg(privilege_type order by privilege_type), '{}')
    into v_auth
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
  where c.oid = 'public.coach_client_links'::regclass
    and a.grantee = 'authenticated'::regrole;
  if v_auth is distinct from array['SELECT']::text[] then
    raise exception 'authenticated table ACL is %, expected {SELECT}', v_auth;
  end if;

  select coalesce(array_agg(privilege_type order by privilege_type), '{}')
    into v_anon
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
  where c.oid = 'public.coach_client_links'::regclass
    and a.grantee = 'anon'::regrole;
  if v_anon <> '{}'::text[] then
    raise exception 'anon table ACL is %, expected none', v_anon;
  end if;

  select coalesce(array_agg(privilege_type order by privilege_type), '{}')
    into v_public
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
  where c.oid = 'public.coach_client_links'::regclass
    and a.grantee = 0;
  if v_public <> '{}'::text[] then
    raise exception 'PUBLIC table ACL is %, expected none', v_public;
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'INSERT'
  ) then
    raise exception 'authenticated still has INSERT';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'DELETE'
  ) then
    raise exception 'authenticated still has DELETE';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'TRUNCATE'
  ) then
    raise exception 'authenticated still has TRUNCATE';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'REFERENCES'
  ) then
    raise exception 'authenticated still has REFERENCES';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'TRIGGER'
  ) then
    raise exception 'authenticated still has TRIGGER';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'MAINTAIN'
  ) then
    raise exception 'authenticated still has MAINTAIN';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee = 'authenticated'::regrole
      and a.privilege_type = 'UPDATE'
  ) then
    raise exception 'authenticated still has table-level UPDATE';
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
    where c.oid = 'public.coach_client_links'::regclass
      and a.grantee in (0::oid, 'anon'::regrole)
  ) then
    raise exception 'anon/PUBLIC still have table privileges';
  end if;

  if has_table_privilege('authenticated','public.coach_client_links','insert') then
    raise exception 'authenticated insert grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','delete') then
    raise exception 'authenticated delete grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','truncate') then
    raise exception 'authenticated truncate grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','references') then
    raise exception 'authenticated references grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','trigger') then
    raise exception 'authenticated trigger grant still open';
  end if;
  if has_table_privilege('authenticated','public.coach_client_links','maintain') then
    raise exception 'authenticated maintain grant still open';
  end if;
  if has_table_privilege('anon','public.coach_client_links','select')
     or has_table_privilege('anon','public.coach_client_links','insert')
     or has_table_privilege('anon','public.coach_client_links','update')
     or has_table_privilege('anon','public.coach_client_links','delete')
     or has_table_privilege('anon','public.coach_client_links','truncate')
     or has_table_privilege('anon','public.coach_client_links','references')
     or has_table_privilege('anon','public.coach_client_links','trigger')
     or has_table_privilege('anon','public.coach_client_links','maintain') then
    raise exception 'anon still has a table privilege';
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
  if has_column_privilege('authenticated','public.coach_client_links','id','update') then
    raise exception 'authenticated can update id';
  end if;
  if has_column_privilege('authenticated','public.coach_client_links','created_at','update') then
    raise exception 'authenticated can update created_at';
  end if;
  if has_column_privilege('authenticated','public.coach_client_links','updated_at','update') then
    raise exception 'authenticated can update updated_at';
  end if;
  if not has_column_privilege('authenticated','public.coach_client_links','last_visited_at','update') then
    raise exception 'coach visit bookkeeping revoked';
  end if;
  if not has_column_privilege('authenticated','public.coach_client_links','last_nudged_at','update') then
    raise exception 'coach nudge bookkeeping revoked';
  end if;

  select coalesce(array_agg(a.attname order by a.attname), '{}')
    into v_cols
  from pg_attribute a
  where a.attrelid = 'public.coach_client_links'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege('authenticated', a.attrelid, a.attname, 'update');
  if v_cols is distinct from array['last_nudged_at','last_visited_at']::text[] then
    raise exception 'authenticated column UPDATE is %, expected {last_nudged_at,last_visited_at}', v_cols;
  end if;

  select a.attname into v_forbidden
  from pg_attribute a
  cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[])) x
  where a.attrelid = 'public.coach_client_links'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attname not in ('last_visited_at','last_nudged_at')
    and x.grantee = 'authenticated'::regrole
  limit 1;
  if v_forbidden is not null then
    raise exception 'leftover authenticated column grant on %', v_forbidden;
  end if;

  if exists (
    select 1
    from pg_attribute a
    cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[])) x
    where a.attrelid = 'public.coach_client_links'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and x.grantee in (0::oid, 'anon'::regrole)
  ) then
    raise exception 'anon/PUBLIC still have column privileges';
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
  begin
    update public.coach_client_links
       set updated_at = '2020-01-01T00:00:00Z'
     where coach_id = 'a2010000-0000-4000-8000-000000000001'
       and client_id = 'a2010000-0000-4000-8000-000000000002';
    raise exception 'coach wrote updated_at via Data API';
  exception when others then
    if sqlerrm = 'coach wrote updated_at via Data API' then raise; end if;
  end;
  update public.coach_client_links
     set last_visited_at = '2026-09-19T12:00:00Z'
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
