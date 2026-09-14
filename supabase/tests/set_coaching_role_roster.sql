-- UX78 — set_coaching_role('none') ne peut pas orpheliner un roster actif.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('a1770000-0000-4000-8000-000000000001','ux78-coach@example.test'),
 ('a1770000-0000-4000-8000-000000000002','ux78-client@example.test'),
 ('a1770000-0000-4000-8000-000000000003','ux78-solo-coach@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
 ('a1770000-0000-4000-8000-000000000001','free','coach'),
 ('a1770000-0000-4000-8000-000000000002','free','client'),
 ('a1770000-0000-4000-8000-000000000003','free','coach')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;

insert into public.coach_client_links(coach_id,client_id,status) values
 ('a1770000-0000-4000-8000-000000000001','a1770000-0000-4000-8000-000000000002','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1770000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1770000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
begin
  perform public.set_coaching_role('none');
  raise exception 'roster coach was allowed to drop to none';
exception
  when others then
    if sqlerrm not like '%coach_has_active_clients%' then
      raise;
    end if;
end $$;
reset role;

do $$ begin
  if (select coaching_role from public.user_roles
      where user_id='a1770000-0000-4000-8000-000000000001') is distinct from 'coach' then
    raise exception 'coaching_role drifted after refused none';
  end if;
  if not exists (
    select 1 from public.coach_client_links
    where coach_id='a1770000-0000-4000-8000-000000000001'
      and client_id='a1770000-0000-4000-8000-000000000002'
      and status='active'
  ) then
    raise exception 'active link was mutated';
  end if;
  if not exists (
    select 1 from public.user_capabilities
    where user_id='a1770000-0000-4000-8000-000000000001' and capability='coach'
  ) then
    raise exception 'coach capability dropped while roster is active';
  end if;
end $$;

-- Coach without clients can turn the capability off.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1770000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"a1770000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if public.set_coaching_role('none') is distinct from 'none' then
    raise exception 'empty-roster coach could not disable';
  end if;
end $$;
reset role;

do $$ begin
  if exists (
    select 1 from public.user_capabilities
    where user_id='a1770000-0000-4000-8000-000000000003'
  ) then
    raise exception 'capability survived empty-roster disable';
  end if;
end $$;

rollback;
\echo 'set_coaching_role roster guard passed'
