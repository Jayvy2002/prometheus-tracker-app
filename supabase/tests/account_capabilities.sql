-- M1 — user_capabilities + get_my_account_context
-- Preuve : coach_capability ≠ active_coach_id ; snapshot sans dossier client.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a1760000-0000-4000-8000-000000000001','m1-coach@example.test'),
 ('a1760000-0000-4000-8000-000000000002','m1-client@example.test'),
 ('a1760000-0000-4000-8000-000000000003','m1-solo@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1760000-0000-4000-8000-000000000001','free','coach'),
 ('a1760000-0000-4000-8000-000000000002','free','client'),
 ('a1760000-0000-4000-8000-000000000003','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

do $$ begin
  if to_regclass('public.user_capabilities') is null then
    raise exception 'user_capabilities missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.user_capabilities'::regclass) then
    raise exception 'RLS disabled on user_capabilities';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='user_capabilities') <> 1 then
    raise exception 'expected a single SELECT policy on user_capabilities';
  end if;
  if has_table_privilege('authenticated','public.user_capabilities','insert')
     or has_table_privilege('authenticated','public.user_capabilities','update')
     or has_table_privilege('authenticated','public.user_capabilities','delete') then
    raise exception 'capability forgery allowed';
  end if;
  if has_function_privilege('anon','public.get_my_account_context()','execute') then
    raise exception 'anonymous context execution allowed';
  end if;
  if not has_function_privilege('authenticated','public.get_my_account_context()','execute') then
    raise exception 'authenticated cannot read own account context';
  end if;
  if has_function_privilege('authenticated','public.sync_legacy_coach_capability()','execute') then
    raise exception 'sync helper exposed';
  end if;
  if not exists (
    select 1 from public.user_capabilities
    where user_id='a1760000-0000-4000-8000-000000000001' and capability='coach'
  ) then
    raise exception 'trigger did not project coach capability';
  end if;
  if exists (
    select 1 from public.user_capabilities
    where user_id='a1760000-0000-4000-8000-000000000002'
  ) then
    raise exception 'client role granted coach capability';
  end if;
end $$;

insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1760000-0000-4000-8000-000000000001','a1760000-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1760000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare ctx jsonb; begin
  ctx := public.get_my_account_context();
  if ctx->>'error' is not null then raise exception 'coached athlete context error: %', ctx; end if;
  if ctx->>'coach_capability' is distinct from 'false' then
    raise exception 'coached athlete unexpectedly has coach capability';
  end if;
  if ctx->>'active_coach_id' is distinct from 'a1760000-0000-4000-8000-000000000001' then
    raise exception 'coached athlete missing active_coach_id';
  end if;
  if ctx->>'legacy_coaching_role' is distinct from 'client' then
    raise exception 'coached athlete legacy role drifted';
  end if;
  if ctx ? 'client_id' then raise exception 'snapshot leaked a client folder'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1760000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare ctx jsonb; begin
  ctx := public.get_my_account_context();
  if ctx->>'coach_capability' is distinct from 'true' then
    raise exception 'coach missing capability';
  end if;
  if ctx->>'active_coach_id' is not null then
    raise exception 'coach without a coach should have null active_coach_id';
  end if;
end $$;
reset role;

-- Axes indépendants : un coach peut aussi être athlète d’un autre coach.
update public.user_roles set coaching_role='coach'
 where user_id='a1760000-0000-4000-8000-000000000003';
insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1760000-0000-4000-8000-000000000003','a1760000-0000-4000-8000-000000000001','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1760000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare ctx jsonb; begin
  ctx := public.get_my_account_context();
  if ctx->>'coach_capability' is distinct from 'true' then
    raise exception 'coach-athlete lost professional capability';
  end if;
  if ctx->>'active_coach_id' is distinct from 'a1760000-0000-4000-8000-000000000003' then
    raise exception 'coach-athlete missing personal coach';
  end if;
  if ctx->>'legacy_coaching_role' is distinct from 'coach' then
    raise exception 'coach-athlete legacy role should stay coach';
  end if;
end $$;

-- Isolation SELECT
select set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1760000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.user_capabilities) <> 0 then
    raise exception 'client can read another users capabilities';
  end if;
end $$;
reset role;

-- Retirer le rôle coach retire la projection.
update public.user_roles set coaching_role='none'
 where user_id='a1760000-0000-4000-8000-000000000003';
do $$ begin
  if exists (
    select 1 from public.user_capabilities
    where user_id='a1760000-0000-4000-8000-000000000003'
  ) then
    raise exception 'capability survived role removal';
  end if;
end $$;

rollback;
\echo 'account capabilities: projection, independent axes, isolation and grants passed'
