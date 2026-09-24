-- Vision §14.4 / §22.2 : photos privées par défaut, partage volontaire au Coach.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b1450000-0000-4000-8000-000000000001','photo-coach@example.test'),
('b1450000-0000-4000-8000-000000000002','photo-client@example.test'),
('b1450000-0000-4000-8000-000000000003','photo-other-coach@example.test'),
('b1450000-0000-4000-8000-000000000004','photo-solo@example.test');
insert into public.user_roles(user_id,role,coaching_role) values
('b1450000-0000-4000-8000-000000000001','free','coach'),
('b1450000-0000-4000-8000-000000000002','free','client'),
('b1450000-0000-4000-8000-000000000003','free','coach'),
('b1450000-0000-4000-8000-000000000004','free','none')
on conflict(user_id) do update set coaching_role=excluded.coaching_role;
insert into public.coach_client_links(coach_id,client_id,status) values
('b1450000-0000-4000-8000-000000000001','b1450000-0000-4000-8000-000000000002','active');
insert into public.progress_photos(user_id,kind,storage_path,taken_at) values
('b1450000-0000-4000-8000-000000000002','front','b1450000-0000-4000-8000-000000000002/before.jpg',current_date - 60);

-- Grants: the share table is written only through the RPC.
do $$ begin
  if has_table_privilege('authenticated','public.progress_photo_shares','insert')
     or has_table_privilege('authenticated','public.progress_photo_shares','update')
     or has_table_privilege('authenticated','public.progress_photo_shares','delete') then
    raise exception 'direct writes on progress_photo_shares are granted';
  end if;
  if has_function_privilege('anon','public.set_progress_photo_sharing(boolean)','execute') then
    raise exception 'anonymous sharing allowed';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Owner or coach can read progress photos'
      and qual like '%coach_can_see_progress_photos%'
  ) and to_regclass('storage.objects') is not null then
    raise exception 'storage read policy does not follow the share';
  end if;
end $$;

-- 1. A new relationship is private: the active coach sees no photo.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from public.progress_photos where user_id='b1450000-0000-4000-8000-000000000002') then
    raise exception 'coach reads photos that were never shared';
  end if;
end $$;

-- 2. A coach cannot share on the athlete's behalf.
do $$ begin
  begin
    perform public.set_progress_photo_sharing(true);
    raise exception 'coach without an active coach shared photos';
  exception when others then
    if sqlerrm <> 'no_active_coach' then raise; end if;
  end;
end $$;

-- 3. The athlete shares: the active coach now sees the photos, history included.
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000002',true);
do $$ begin
  if public.set_progress_photo_sharing(true) is not true then
    raise exception 'share did not return true';
  end if;
  if (select coach_id from public.progress_photo_shares where client_id='b1450000-0000-4000-8000-000000000002')
     is distinct from 'b1450000-0000-4000-8000-000000000001' then
    raise exception 'share not recorded for the active coach';
  end if;
end $$;
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000001',true);
do $$ begin
  if not exists (select 1 from public.progress_photos where user_id='b1450000-0000-4000-8000-000000000002') then
    raise exception 'shared photos are not visible to the active coach';
  end if;
end $$;

-- 4. Another coach still sees nothing.
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists (select 1 from public.progress_photos where user_id='b1450000-0000-4000-8000-000000000002')
     or exists (select 1 from public.progress_photo_shares where client_id='b1450000-0000-4000-8000-000000000002') then
    raise exception 'unrelated coach sees photos or the share';
  end if;
end $$;

-- 5. The athlete withdraws: access stops immediately.
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000002',true);
do $$ begin
  if public.set_progress_photo_sharing(false) is not false then
    raise exception 'unshare did not return false';
  end if;
end $$;
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from public.progress_photos where user_id='b1450000-0000-4000-8000-000000000002') then
    raise exception 'coach still reads photos after the athlete withdrew';
  end if;
end $$;

-- 6. Ending the relationship ends the share; a new cycle starts private.
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000002',true);
select public.set_progress_photo_sharing(true);
select public.client_end_coach_link();
reset role;
do $$ begin
  if exists (select 1 from public.progress_photo_shares where client_id='b1450000-0000-4000-8000-000000000002') then
    raise exception 'share survived the end of the relationship';
  end if;
end $$;

-- 7. A Solo has no coach to share with.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1450000-0000-4000-8000-000000000004',true);
do $$ begin
  begin
    perform public.set_progress_photo_sharing(true);
    raise exception 'solo shared photos with nobody';
  exception when others then
    if sqlerrm <> 'no_active_coach' then raise; end if;
  end;
end $$;
reset role;

rollback;
\echo 'progress photo sharing: private by default, athlete shares and withdraws, other coaches blind, end of link ends share'
