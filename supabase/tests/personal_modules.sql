-- Vision §5.3 : le Solo choisit ses modules ; aucun objectif eau/pas inventé.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
('b2700000-0000-4000-8000-000000000001','modules-solo@example.test'),
('b2700000-0000-4000-8000-000000000002','modules-other@example.test');
insert into public.user_profiles(id, email) values
('b2700000-0000-4000-8000-000000000001','modules-solo@example.test'),
('b2700000-0000-4000-8000-000000000002','modules-other@example.test')
on conflict (id) do nothing;

do $$ begin
  -- A new account has no invented water or steps target, and no module choice yet.
  if exists (
    select 1 from public.user_profiles
     where id = 'b2700000-0000-4000-8000-000000000001'
       and (daily_water_target_ml is not null or daily_steps_target is not null or personal_modules is not null)
  ) then
    raise exception 'new profile got invented targets or modules';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b2700000-0000-4000-8000-000000000001',true);

update public.user_profiles
   set personal_modules = '{"workouts": true, "nutrition": false, "weight": true, "checkins": false}'
 where id = 'b2700000-0000-4000-8000-000000000001';

do $$ begin
  if (select personal_modules->>'nutrition' from public.user_profiles where id = 'b2700000-0000-4000-8000-000000000001') <> 'false' then
    raise exception 'own module choice not saved';
  end if;
  begin
    update public.user_profiles set personal_modules = '{"alcohol": true}' where id = 'b2700000-0000-4000-8000-000000000001';
    raise exception 'unknown module accepted';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set personal_modules = '{"workouts": "yes"}' where id = 'b2700000-0000-4000-8000-000000000001';
    raise exception 'non-boolean module accepted';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set personal_modules = '[true]' where id = 'b2700000-0000-4000-8000-000000000001';
    raise exception 'array accepted as modules';
  exception when check_violation then null;
  end;
  update public.user_profiles set training_equipment = 'home' where id = 'b2700000-0000-4000-8000-000000000001';
  begin
    update public.user_profiles set training_equipment = 'spaceship' where id = 'b2700000-0000-4000-8000-000000000001';
    raise exception 'unknown equipment accepted';
  exception when check_violation then null;
  end;
end $$;

-- Someone else cannot change my modules (RLS: own row only).
select set_config('request.jwt.claim.sub','b2700000-0000-4000-8000-000000000002',true);
update public.user_profiles set personal_modules = '{"workouts": false}' where id = 'b2700000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','b2700000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select personal_modules->>'workouts' from public.user_profiles where id = 'b2700000-0000-4000-8000-000000000001') <> 'true' then
    raise exception 'another account changed my modules';
  end if;
end $$;
reset role;

rollback;
\echo 'personal modules: own choice saved, unknown or malformed refused, others blind, no invented water/steps target'
