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
