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
create function public.standard_questionnaire_fields() returns jsonb
language sql immutable set search_path='' as $catalog$
 select $json${"age":{"id":"age","label":{"en":"Age","fr":"Age"},"maps_to":"age","medical":false,"required":false,"type":"number"},"blessuresChirurgies":{"id":"blessuresChirurgies","label":{"en":"Have you had any major injuries, surgeries, or operations?","fr":"As-tu déjà eu des blessures importantes, des chirurgies ou opérations quelconques ?"},"maps_to":"blessuresChirurgies","medical":true,"required":false,"type":"yes_no"},"cardiaqueHtaPoitrine":{"id":"cardiaqueHtaPoitrine","label":{"en":"Heart condition, uncontrolled hypertension, or chest pain during effort?","fr":"Condition cardiaque, hypertension non contrôlée, ou douleurs à la poitrine à l'effort ?"},"maps_to":"cardiaqueHtaPoitrine","medical":true,"required":false,"type":"yes_no"},"conditionMedicalePrecise":{"id":"conditionMedicalePrecise","label":{"en":"Specific medical condition (if yes to any of the previous answers)","fr":"Condition médicale précise (si oui à l'une des réponses précédentes)"},"maps_to":"conditionMedicalePrecise","medical":true,"required":false,"type":"text"},"depuisCombienDeTemps":{"id":"depuisCombienDeTemps","label":{"en":"How long have you been pursuing this goal?","fr":"Depuis combien de temps poursuis-tu cet objectif?"},"maps_to":"depuisCombienDeTemps","medical":false,"required":false,"type":"text"},"descriptionBlessures":{"id":"descriptionBlessures","label":{"en":"Description of the injury(ies) / surgery(ies) / operation(s) (if yes)","fr":"Description de la ou des blessure(s) / chirurgie(s) / opération(s) (si oui)"},"maps_to":"descriptionBlessures","medical":true,"required":false,"type":"text"},"douleursLimitations":{"id":"douleursLimitations","label":{"en":"Do you currently have pain or limitations that affect your movement?","fr":"As-tu actuellement des douleurs ou limitations qui affectent tes mouvements ?"},"maps_to":"douleursLimitations","medical":true,"required":false,"type":"yes_no"},"dureeIdeale":{"id":"dureeIdeale","label":{"en":"Ideal session length","fr":"Durée idéale d'une séance"},"maps_to":"dureeIdeale","medical":false,"options":[{"id":"o0","label":{"en":"30 min","fr":"30 mins"}},{"id":"o1","label":{"en":"45–60 min","fr":"45-60 mins"}},{"id":"o2","label":{"en":"60–75 min","fr":"60-75 mins"}},{"id":"o3","label":{"en":"90+ min","fr":"90+ mins"}}],"required":false,"type":"single"},"equipement":{"id":"equipement","label":{"en":"Available equipment (multiple choices)","fr":"Équipement disponible (plusieurs choix possibles)"},"maps_to":"equipement","medical":false,"options":[{"id":"o0","label":{"en":"Dumbbells","fr":"Haltères libres"}},{"id":"o1","label":{"en":"Barbell","fr":"Barre"}},{"id":"o2","label":{"en":"Rack","fr":"Rack"}},{"id":"o3","label":{"en":"Bench","fr":"Banc"}},{"id":"o4","label":{"en":"Machines","fr":"Machines"}},{"id":"o5","label":{"en":"Câbles","fr":"Câbles"}},{"id":"o6","label":{"en":"Resistance bands","fr":"Bandes élastiques"}},{"id":"o7","label":{"en":"Kettlebells","fr":"Kettlebells"}},{"id":"o8","label":{"en":"Pull-up bar","fr":"Barre de traction"}},{"id":"o9","label":{"en":"Indoor bike","fr":"Vélo intérieur"}},{"id":"o10","label":{"en":"Treadmill","fr":"Tapis"}},{"id":"o11","label":{"en":"Rower","fr":"Rameur"}},{"id":"o12","label":{"en":"Squat machine","fr":"Appareil à squat"}},{"id":"o13","label":{"en":"Bodyweight only","fr":"Poids du corps seulement"}},{"id":"o14","label":{"en":"Other","fr":"Autre"}}],"required":false,"type":"multi"},"etourdissementsEquilibre":{"id":"etourdissementsEquilibre","label":{"en":"Dizziness, loss of balance, or unusual shortness of breath?","fr":"Étourdissements, pertes d'équilibre ou essoufflement inhabituel ?"},"maps_to":"etourdissementsEquilibre","medical":true,"required":false,"type":"yes_no"},"exercicesDetestes":{"id":"exercicesDetestes","label":{"en":"Any exercises you hate or absolutely want to avoid?","fr":"Des exercices que tu détestes ou que tu veux absolument éviter ?"},"maps_to":"exercicesDetestes","medical":false,"required":false,"type":"text"},"foisParSemaine":{"id":"foisParSemaine","label":{"en":"How many times per week?","fr":"Combien de fois par semaine?"},"maps_to":"foisParSemaine","medical":false,"options":[{"id":"o0","label":{"en":"1-2","fr":"1-2"}},{"id":"o1","label":{"en":"3-4","fr":"3-4"}},{"id":"o2","label":{"en":"5-6","fr":"5-6"}},{"id":"o3","label":{"en":"7+","fr":"7+"}}],"required":false,"type":"single"},"lieu":{"id":"lieu","label":{"en":"Where do you mainly train?","fr":"Où t'entraînes-tu principalement ?"},"maps_to":"lieu","medical":false,"options":[{"id":"o0","label":{"en":"Home","fr":"Domicile"}},{"id":"o1","label":{"en":"Gym","fr":"Salle"}},{"id":"o2","label":{"en":"Both","fr":"Mixte"}},{"id":"o3","label":{"en":"Extérieur","fr":"Extérieur"}}],"required":false,"type":"single"},"medecinLimiteExercices":{"id":"medecinLimiteExercices","label":{"en":"Has a doctor ever recommended that you limit certain exercises?","fr":"Un médecin t'a-t-il déjà recommandé de limiter certains exercices ?"},"maps_to":"medecinLimiteExercices","medical":true,"required":false,"type":"yes_no"},"mouvementAEviter":{"id":"mouvementAEviter","label":{"en":"Description of the movement to avoid (if yes)","fr":"Description du mouvement à éviter (si oui)"},"maps_to":"mouvementAEviter","medical":true,"required":false,"type":"text"},"niveauActuel":{"id":"niveauActuel","label":{"en":"What is your current level?","fr":"Quel est ton niveau actuel?"},"maps_to":"niveauActuel","medical":false,"options":[{"id":"o0","label":{"en":"Beginner (less than 6–12 months of consistent training)","fr":"Débutant (moins de 6-12 mois réguliers)"}},{"id":"o1","label":{"en":"Intermédiaire","fr":"Intermédiaire"}},{"id":"o2","label":{"en":"Avancé","fr":"Avancé"}}],"required":false,"type":"single"},"nom":{"id":"nom","label":{"en":"Last name","fr":"Nom"},"maps_to":"nom","medical":false,"required":false,"type":"text"},"objectifPrincipal":{"id":"objectifPrincipal","label":{"en":"What is your main goal","fr":"Quel est ton objectif principal"},"maps_to":"objectifPrincipal","medical":false,"required":false,"type":"text"},"poidsApproxKg":{"id":"poidsApproxKg","label":{"en":"Approximate weight (kg)","fr":"Poids approximatif (kg)"},"maps_to":"poidsApproxKg","medical":false,"required":false,"type":"number"},"prefereProgramme":{"id":"prefereProgramme","label":{"en":"Do you prefer a program?","fr":"Préfères-tu un programme ?"},"maps_to":"prefereProgramme","medical":false,"required":false,"type":"text"},"prenom":{"id":"prenom","label":{"en":"First name","fr":"Prénom"},"maps_to":"prenom","medical":false,"required":false,"type":"text"},"programmeStructure":{"id":"programmeStructure","label":{"en":"Have you already followed a structured program?","fr":"As-tu déjà suivi un programme structuré?"},"maps_to":"programmeStructure","medical":false,"required":false,"type":"yes_no"},"quelqueChoseImportant":{"id":"quelqueChoseImportant","label":{"en":"Is there anything important I should absolutely know?","fr":"Y a-t-il quelque chose d'important que je devrais absolument savoir ?"},"maps_to":"quelqueChoseImportant","medical":false,"required":false,"type":"text"},"seancesRealistes":{"id":"seancesRealistes","label":{"en":"How many sessions per week can you realistically do?","fr":"Combien de séances par semaine peux-tu réalistement faire?"},"maps_to":"seancesRealistes","medical":false,"required":false,"type":"number"},"sexeGenre":{"id":"sexeGenre","label":{"en":"Sex / gender","fr":"Sexe/Genre"},"maps_to":"sexeGenre","medical":false,"options":[{"id":"o0","label":{"en":"F","fr":"F"}},{"id":"o1","label":{"en":"M","fr":"H"}},{"id":"o2","label":{"en":"Other","fr":"Autre"}}],"required":false,"type":"single"},"tailleCm":{"id":"tailleCm","label":{"en":"Height (cm)","fr":"Taille (cm)"},"maps_to":"tailleCm","medical":false,"required":false,"type":"number"},"typesExercices":{"id":"typesExercices","label":{"en":"Which types of exercises do you prefer?","fr":"Quels types d'exercices préfères-tu ?"},"maps_to":"typesExercices","medical":false,"options":[{"id":"o0","label":{"en":"Free weights (dumbbells / barbell)","fr":"Charges libres (haltères / barre)"}},{"id":"o1","label":{"en":"Machines","fr":"Machines"}},{"id":"o2","label":{"en":"Bodyweight","fr":"Poids du corps"}},{"id":"o3","label":{"en":"Unilateral / stability","fr":"Unilatéral / Stabilité"}},{"id":"o4","label":{"en":"Circuits / more dynamic","fr":"Circuits / Plus dynamique"}},{"id":"o5","label":{"en":"Doesn't matter, I adapt","fr":"Peu importe je m'adapte"}},{"id":"o6","label":{"en":"Other","fr":"Autre"}}],"required":false,"type":"multi"}}$json$::jsonb;
$catalog$;
revoke all on function public.standard_questionnaire_fields() from public,anon;
grant execute on function public.standard_questionnaire_fields() to authenticated;

create function public.questionnaire_definition_valid(d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb; q jsonb; o jsonb; ids text[] := '{}'; sids text[] := '{}'; oids text[]; n int := 0; standard jsonb; mapped_ids text[] := '{}';
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
   if exists(select 1 from jsonb_object_keys(q) k where k not in ('id','label','type','required','medical','options','maps_to')) then return false; end if;
   standard:=public.standard_questionnaire_fields()->(q->>'maps_to');
   if q ? 'maps_to' then
    if standard is null or q->>'maps_to'=any(mapped_ids) or q->>'type' is distinct from standard->>'type'
      or (standard->>'medical'='true' and q->>'medical' is distinct from 'true') then return false; end if;
    mapped_ids:=array_append(mapped_ids,q->>'maps_to');
    if standard ? 'options' and (select jsonb_agg(o->'id') from jsonb_array_elements(q->'options') o)
       is distinct from (select jsonb_agg(o->'id') from jsonb_array_elements(standard->'options') o) then return false; end if;
   end if;
   if jsonb_typeof(q#>'{label,fr}') is distinct from 'string' or jsonb_typeof(q#>'{label,en}') is distinct from 'string'
   or (coalesce(q->>'id','') !~ '^custom_[a-zA-Z0-9_-]* or length(q->>'id')>100 or q->>'id'=any(ids)
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
 and (standard is null or q->>'id' is distinct from q->>'maps_to')) or length(q->>'id')>100 or q->>'id'=any(ids)
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
