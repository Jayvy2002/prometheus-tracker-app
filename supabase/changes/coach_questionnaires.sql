-- Candidate schema for isolated CI only. Not a production migration yet.
-- Definition/answer validation and invitations must be completed before release.
create table public.coach_questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id),
  questionnaire_id uuid not null,
  version integer not null check (version > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 262144),
  created_at timestamptz not null default now(),
  unique (coach_id, questionnaire_id, version)
);
alter table public.coach_questionnaire_versions enable row level security;
revoke all on public.coach_questionnaire_versions from public, anon, authenticated;
grant select, insert on public.coach_questionnaire_versions to authenticated;

create policy questionnaire_versions_read_owner on public.coach_questionnaire_versions
for select to authenticated using (coach_id = (select auth.uid()));
create policy questionnaire_versions_create_owner on public.coach_questionnaire_versions
for insert to authenticated with check (
  coach_id = (select auth.uid())
  and exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.coaching_role = 'coach'
  )
);

-- No UPDATE/DELETE grant or policy: published snapshots are append-only.
-- The unique constraint arbitrates concurrent inserts of the same version.

-- A database boundary is required: TypeScript validation alone is bypassable.
create function public.questionnaire_definition_valid(d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb; q jsonb; o jsonb; ids text[] := '{}'; sids text[] := '{}'; oids text[]; n int := 0;
begin
 if jsonb_typeof(d) is distinct from 'object' then return false; end if;
 if jsonb_typeof(d->'schemaVersion') is distinct from 'number' or jsonb_typeof(d->'version') is distinct from 'number'
 or jsonb_typeof(d#>'{name,fr}') is distinct from 'string' or jsonb_typeof(d#>'{name,en}') is distinct from 'string'
 or d->>'schemaVersion' is distinct from '1'
 or jsonb_typeof(d->'sections') is distinct from 'array'
 or jsonb_array_length(d->'sections') not between 1 and 20
 or coalesce(length(btrim(d#>>'{name,fr}')),0) not between 1 and 500
 or coalesce(length(btrim(d#>>'{name,en}')),0) not between 1 and 500 then return false; end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in ('schemaVersion','id','coachId','version','name','sections')) then return false; end if;
 for s in select value from jsonb_array_elements(d->'sections') loop
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('id','label','questions')) then return false; end if;
  if jsonb_typeof(s#>'{label,fr}') is distinct from 'string' or jsonb_typeof(s#>'{label,en}') is distinct from 'string'
  or jsonb_typeof(s->'id') is distinct from 'string' or s->>'id' in ('constructor','prototype','__proto__') or coalesce(s->>'id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$' or s->>'id'=any(sids)
  or coalesce(length(btrim(s#>>'{label,fr}')),0) not between 1 and 500
  or coalesce(length(btrim(s#>>'{label,en}')),0) not between 1 and 500
  or jsonb_typeof(s->'questions') is distinct from 'array'
  or jsonb_array_length(s->'questions') not between 1 and 100 then return false; end if;
  sids := array_append(sids,s->>'id');
  for q in select value from jsonb_array_elements(s->'questions') loop
   n := n+1;
   if n>100 or jsonb_typeof(q) is distinct from 'object' then return false; end if;
   if exists(select 1 from jsonb_object_keys(q) k where k not in ('id','label','type','required','medical','options')) then return false; end if;
   if jsonb_typeof(q#>'{label,fr}') is distinct from 'string' or jsonb_typeof(q#>'{label,en}') is distinct from 'string'
   or coalesce(q->>'id','') !~ '^custom_[a-zA-Z0-9_-]*$' or length(q->>'id')>100 or q->>'id'=any(ids)
   or coalesce(length(btrim(q#>>'{label,fr}')),0) not between 1 and 500
   or coalesce(length(btrim(q#>>'{label,en}')),0) not between 1 and 500
   or jsonb_typeof(q->'required') is distinct from 'boolean'
   or jsonb_typeof(q->'medical') is distinct from 'boolean'
   or coalesce(q->>'type','') not in ('text','number','yes_no','single','multi','weekdays') then return false; end if;
   ids := array_append(ids,q->>'id');
   if q->>'type' in ('single','multi') then
    if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 50 then return false; end if;
    oids := '{}';
    for o in select value from jsonb_array_elements(q->'options') loop
     if jsonb_typeof(o) is distinct from 'object' then return false; end if;
     if exists(select 1 from jsonb_object_keys(o) k where k not in ('id','label')) then return false; end if;
     if jsonb_typeof(o#>'{label,fr}') is distinct from 'string' or jsonb_typeof(o#>'{label,en}') is distinct from 'string'
     or jsonb_typeof(o->'id') is distinct from 'string' or o->>'id' in ('constructor','prototype','__proto__') or coalesce(o->>'id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$' or o->>'id'=any(oids)
     or coalesce(length(btrim(o#>>'{label,fr}')),0) not between 1 and 500
     or coalesce(length(btrim(o#>>'{label,en}')),0) not between 1 and 500 then return false; end if;
     oids := array_append(oids,o->>'id');
    end loop;
   elsif q ? 'options' then return false;
   end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.questionnaire_definition_valid(jsonb) from public,anon;
grant execute on function public.questionnaire_definition_valid(jsonb) to authenticated;

alter table public.coach_questionnaire_versions add constraint questionnaire_definition_contract check (
 public.questionnaire_definition_valid(definition)
 and (definition->>'id') is not distinct from questionnaire_id::text
 and (definition->>'coachId') is not distinct from coach_id::text
 and (definition->>'version') is not distinct from version::text
);

create table public.coach_questionnaire_defaults (
 coach_id uuid primary key references auth.users(id),
 version_id uuid not null references public.coach_questionnaire_versions(id)
);
alter table public.coach_questionnaire_defaults enable row level security;
revoke all on public.coach_questionnaire_defaults from public,anon,authenticated;
grant select,insert,update,delete on public.coach_questionnaire_defaults to authenticated;
create policy questionnaire_default_owner on public.coach_questionnaire_defaults
for all to authenticated using (coach_id=(select auth.uid()))
with check (coach_id=(select auth.uid()) and exists (
 select 1 from public.coach_questionnaire_versions v where v.id=version_id and v.coach_id=(select auth.uid())
));

-- Each invite pins the selected revision; subsequent default changes do not rewrite it.
alter table public.coach_invites add column questionnaire_version_id uuid references public.coach_questionnaire_versions(id);
create function public.pin_invite_questionnaire() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.questionnaire_version_id is distinct from old.questionnaire_version_id then
  raise exception 'questionnaire_version_is_immutable';
 end if;
 if TG_OP='INSERT' then
  if new.questionnaire_version_id is null then
   select version_id into new.questionnaire_version_id from public.coach_questionnaire_defaults where coach_id=new.coach_id;
  end if;
  if new.questionnaire_version_id is not null and not exists (
   select 1 from public.coach_questionnaire_versions where id=new.questionnaire_version_id and coach_id=new.coach_id
  ) then raise exception 'invalid_questionnaire_owner'; end if;
 end if;
 return new;
end $$;
revoke all on function public.pin_invite_questionnaire() from public,anon,authenticated;
create trigger pin_invite_questionnaire before insert or update on public.coach_invites
for each row execute function public.pin_invite_questionnaire();

create table public.client_questionnaire_responses (
 id uuid primary key default gen_random_uuid(),
 invite_id uuid references public.coach_invites(id) on delete set null,
 version_id uuid not null references public.coach_questionnaire_versions(id),
 coach_id uuid not null references auth.users(id),
 client_id uuid not null references auth.users(id),
 answers jsonb not null default '{}' check(jsonb_typeof(answers)='object' and octet_length(answers::text)<=1048576),
 revision integer not null default 0,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(invite_id,client_id)
);
alter table public.client_questionnaire_responses enable row level security;
revoke all on public.client_questionnaire_responses from public,anon,authenticated;
grant select on public.client_questionnaire_responses to authenticated;
create policy questionnaire_response_read on public.client_questionnaire_responses for select to authenticated
using (client_id=(select auth.uid()) or (coach_id=(select auth.uid()) and public.is_coach_of(client_id)));
create policy questionnaire_version_assigned on public.coach_questionnaire_versions for select to authenticated
using(exists(select 1 from public.client_questionnaire_responses r where r.version_id=coach_questionnaire_versions.id and r.client_id=(select auth.uid())));

create function public.assign_invite_questionnaire() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.use_count>old.use_count and new.questionnaire_version_id is not null then
  if auth.uid() is null or not exists (
   select 1 from public.coach_client_links l where l.coach_id=new.coach_id and l.client_id=auth.uid() and l.status='active'
  ) then raise exception 'questionnaire_assignment_forbidden'; end if;
  insert into public.client_questionnaire_responses(invite_id,version_id,coach_id,client_id)
  values(new.id,new.questionnaire_version_id,new.coach_id,auth.uid())
  on conflict(invite_id,client_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.assign_invite_questionnaire() from public,anon,authenticated;
create trigger assign_invite_questionnaire after update of use_count on public.coach_invites
for each row execute function public.assign_invite_questionnaire();

create function public.save_questionnaire_response(p_id uuid,p_revision integer,p_answers jsonb,p_complete boolean default false)
returns public.client_questionnaire_responses
language plpgsql security definer set search_path='' as $$
declare r public.client_questionnaire_responses; d jsonb; q jsonb; v jsonb; known text[]; k text; valid boolean;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into r from public.client_questionnaire_responses where id=p_id and client_id=auth.uid() for update;
 if not found then raise exception 'response_not_found'; end if;
 if r.completed_at is not null or r.revision is distinct from p_revision then raise exception 'response_conflict'; end if;
 perform 1 from public.coach_client_links where client_id=auth.uid() and coach_id=r.coach_id and status='active' for share;
 if not found then raise exception 'coaching_ended'; end if;
 if p_complete is null or jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>1048576 then raise exception 'invalid_answers'; end if;
 select definition into d from public.coach_questionnaire_versions where id=r.version_id;
 select array_agg(x->>'id') into known from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'questions') x;
 for k in select jsonb_object_keys(p_answers) loop
  if not k=any(known) then raise exception 'unknown_question'; end if;
 end loop;
 for q in select x from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'questions') x loop
  v:=p_answers->(q->>'id');
  if v is null or v='null' or (jsonb_typeof(v)='string' and btrim(v#>>'{}')='') or v='[]' then
   if p_complete and (q->>'required')::boolean then raise exception 'required_answer'; end if;
   continue;
  end if;
  valid:=false;
  case q->>'type'
   when 'text' then valid:=jsonb_typeof(v)='string' and length(v#>>'{}')<=10000 and length(btrim(v#>>'{}'))>0;
   when 'number' then valid:=jsonb_typeof(v)='number';
   when 'yes_no' then valid:=jsonb_typeof(v)='boolean';
   when 'single' then valid:=jsonb_typeof(v)='string' and exists(select 1 from jsonb_array_elements(q->'options') o where o->'id'=v);
   when 'multi' then
    if jsonb_typeof(v)='array' then
     valid:=not exists(select 1 from jsonb_array_elements(v) a where not exists(select 1 from jsonb_array_elements(q->'options') o where o->'id'=a))
       and (select count(*)=count(distinct a) from jsonb_array_elements(v) a);
    end if;
   when 'weekdays' then
    if jsonb_typeof(v)='array' then
     valid:=not exists(select 1 from jsonb_array_elements(v) a where a not in ('1','2','3','4','5','6','7'))
      and (select count(*)=count(distinct a) from jsonb_array_elements(v) a);
    end if;
   else valid:=false;
  end case;
  if not coalesce(valid,false) then raise exception 'invalid_answer'; end if;
 end loop;
 update public.client_questionnaire_responses set answers=p_answers,revision=revision+1,
 completed_at=case when p_complete then now() else null end where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.save_questionnaire_response(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_questionnaire_response(uuid,integer,jsonb,boolean) to authenticated;

create index questionnaire_responses_client_idx on public.client_questionnaire_responses(client_id);
create index questionnaire_responses_version_idx on public.client_questionnaire_responses(version_id);
create index questionnaire_responses_coach_idx on public.client_questionnaire_responses(coach_id);
create index questionnaire_defaults_version_idx on public.coach_questionnaire_defaults(version_id);
create index questionnaire_invites_version_idx on public.coach_invites(questionnaire_version_id);
